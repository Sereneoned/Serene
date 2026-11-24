import type { AlbumPhoto } from "@/types/album";
import { buildZipStore, type ZipStoreEntry } from "./zip-store.ts";

export interface AlbumDownloadProgress {
	readonly completed: number;
	readonly total: number;
}

export interface AlbumDownloadResult {
	readonly downloaded: number;
	readonly failed: number;
	readonly filename: string;
}

const KNOWN_EXTENSIONS = new Set([
	".jpg",
	".jpeg",
	".png",
	".webp",
	".avif",
	".gif",
	".svg",
	".bmp",
	".tif",
	".tiff",
]);

const MIME_TO_EXT: Readonly<Record<string, string>> = {
	"image/jpeg": ".jpg",
	"image/jpg": ".jpg",
	"image/png": ".png",
	"image/webp": ".webp",
	"image/avif": ".avif",
	"image/gif": ".gif",
	"image/svg+xml": ".svg",
	"image/bmp": ".bmp",
};

const OBJECT_URL_REVOKE_DELAY_MS = 60_000;
const DEFAULT_FETCH_CONCURRENCY = 6;

/** Strips filesystem-forbidden characters while preserving Unicode names. */
export function sanitizeDownloadName(raw: string, fallback: string): string {
	const cleaned = raw
		.replace(/[\\/:*?"<>|]+/g, "-")
		.replace(/\s+/g, " ")
		.replace(/\s*-\s*/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^[.\s-]+|[.\s-]+$/g, "")
		.slice(0, 80)
		.trim();
	return cleaned || fallback;
}

function extractUrlFileParts(src: string): { stem: string; ext: string } {
	try {
		const pathname = new URL(src, "https://example.invalid").pathname;
		const segment = decodeURIComponent(
			pathname.split("/").filter(Boolean).pop() ?? "",
		);
		const dot = segment.lastIndexOf(".");
		if (dot > 0) {
			const ext = segment.slice(dot).toLowerCase();
			if (KNOWN_EXTENSIONS.has(ext)) {
				return { stem: segment.slice(0, dot), ext };
			}
		}
		return { stem: segment, ext: "" };
	} catch {
		return { stem: "", ext: "" };
	}
}

function extensionFromMime(mimeType?: string): string {
	if (!mimeType) return "";
	const normalized = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
	return MIME_TO_EXT[normalized] ?? "";
}

/** Derives a safe download filename with extension for an album photo. */
export function resolvePhotoFilename(
	photo: Pick<AlbumPhoto, "id" | "src" | "title" | "alt">,
	index: number,
	mimeType?: string,
): string {
	const parts = extractUrlFileParts(photo.src);
	const ext = parts.ext || extensionFromMime(mimeType) || ".webp";
	const fallbackStem = `photo-${String(index + 1).padStart(2, "0")}`;
	const preferredStem = parts.ext
		? parts.stem || photo.title?.trim() || photo.id?.trim() || photo.alt?.trim()
		: photo.title?.trim() ||
			photo.id?.trim() ||
			parts.stem ||
			photo.alt?.trim();
	const safeStem = sanitizeDownloadName(preferredStem || "", fallbackStem);
	return `${safeStem}${ext}`;
}

/** Ensures archive filenames remain unique even on case-insensitive filesystems. */
export function dedupeEntryName(name: string, usedLower: Set<string>): string {
	const lower = name.toLowerCase();
	if (!usedLower.has(lower)) {
		usedLower.add(lower);
		return name;
	}
	const dot = name.lastIndexOf(".");
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const ext = dot > 0 ? name.slice(dot) : "";
	let counter = 2;
	while (true) {
		const candidate = `${stem}-${counter}${ext}`;
		const candidateLower = candidate.toLowerCase();
		if (!usedLower.has(candidateLower)) {
			usedLower.add(candidateLower);
			return candidate;
		}
		counter += 1;
	}
}

function triggerAnchorDownload(
	href: string,
	filename: string,
	openBlank = false,
): void {
	const link = document.createElement("a");
	link.href = href;
	link.download = filename;
	if (openBlank) {
		link.target = "_blank";
		link.rel = "noopener noreferrer";
	}
	link.style.display = "none";
	document.body.appendChild(link);
	link.click();
	link.remove();
}

function triggerBlobDownload(blob: Blob, filename: string): void {
	const objectUrl = URL.createObjectURL(blob);
	triggerAnchorDownload(objectUrl, filename);
	window.setTimeout(
		() => URL.revokeObjectURL(objectUrl),
		OBJECT_URL_REVOKE_DELAY_MS,
	);
}

/** Downloads a single full-resolution photo, falling back cleanly if cross-origin blocks fetch. */
export async function downloadSinglePhoto(
	photo: Pick<AlbumPhoto, "id" | "src" | "title" | "alt">,
	index: number,
	resolvedUrl: string,
): Promise<string> {
	if (!resolvedUrl) {
		throw new Error("Missing photo URL");
	}
	const fallbackName = resolvePhotoFilename(photo, index);
	try {
		const response = await fetch(resolvedUrl);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		const blob = await response.blob();
		const filename = resolvePhotoFilename(photo, index, blob.type);
		triggerBlobDownload(blob, filename);
		return filename;
	} catch {
		triggerAnchorDownload(resolvedUrl, fallbackName, true);
		return fallbackName;
	}
}

/** Fetches all album photos with bounded concurrency and downloads them as a single `.zip`. */
export async function downloadAlbumAsZip(options: {
	readonly albumTitle: string;
	readonly albumId?: string;
	readonly photos: readonly AlbumPhoto[];
	readonly resolveUrl: (src: string) => string;
	readonly onProgress?: (progress: AlbumDownloadProgress) => void;
	readonly concurrency?: number;
	readonly signal?: AbortSignal;
}): Promise<AlbumDownloadResult> {
	const {
		albumTitle,
		albumId,
		photos,
		resolveUrl,
		onProgress,
		concurrency = DEFAULT_FETCH_CONCURRENCY,
		signal,
	} = options;
	const total = photos.length;
	if (total === 0) {
		throw new Error("Album has no photos to download");
	}

	const folderName = sanitizeDownloadName(albumTitle || albumId || "", "album");
	const zipFilename = `${folderName}.zip`;
	const results = new Array<{ name: string; data: Uint8Array } | null>(
		total,
	).fill(null);

	let completed = 0;
	let failed = 0;
	let cursor = 0;
	const workerCount = Math.max(1, Math.min(concurrency, total));

	const worker = async () => {
		while (cursor < total) {
			if (signal?.aborted) return;
			const current = cursor;
			cursor += 1;
			const photo = photos[current];
			const targetUrl = photo?.src ? resolveUrl(photo.src) : "";
			try {
				if (!targetUrl) throw new Error("Empty image source");
				const response = await fetch(targetUrl, { signal });
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				const contentType = response.headers.get("content-type") ?? undefined;
				const buffer = await response.arrayBuffer();
				results[current] = {
					name: resolvePhotoFilename(photo, current, contentType),
					data: new Uint8Array(buffer),
				};
			} catch {
				failed += 1;
			} finally {
				completed += 1;
				onProgress?.({ completed, total });
			}
		}
	};

	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	if (signal?.aborted) {
		throw new DOMException("Album download aborted", "AbortError");
	}

	const usedNames = new Set<string>();
	const entries: ZipStoreEntry[] = [];
	for (const item of results) {
		if (!item) continue;
		const uniqueName = dedupeEntryName(item.name, usedNames);
		entries.push({
			name: `${folderName}/${uniqueName}`,
			data: item.data,
		});
	}

	if (entries.length === 0) {
		throw new Error("No album images could be downloaded");
	}

	const zipBytes = buildZipStore(entries);
	const zipBuffer = new ArrayBuffer(zipBytes.byteLength);
	new Uint8Array(zipBuffer).set(zipBytes);
	const zipBlob = new Blob([zipBuffer], { type: "application/zip" });
	triggerBlobDownload(zipBlob, zipFilename);

	return {
		downloaded: entries.length,
		failed,
		filename: zipFilename,
	};
}
