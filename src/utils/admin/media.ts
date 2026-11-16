import {
	parseTrackFromFilename,
	slugifyAudioId,
} from "../music/filename-parser.ts";

export interface CompressedImageResult {
	readonly bytes: Uint8Array;
	readonly width: number;
	readonly height: number;
	readonly mimeType: string;
	readonly size: number;
}

export interface ParsedAudioMeta {
	readonly id: string;
	readonly title: string;
	readonly artist?: string;
	readonly album?: string;
	readonly duration?: number;
	readonly coverBytes?: Uint8Array;
	readonly coverMimeType?: string;
	readonly fileName: string;
	readonly relativePath: string;
	readonly sizeBytes: number;
}

export async function compressImageToWebP(
	input: Blob,
	options: { readonly maxDimension?: number; readonly quality?: number } = {},
): Promise<CompressedImageResult> {
	const maxDimension = options.maxDimension ?? 1920;
	const quality = options.quality ?? 0.85;

	const bitmap = await createImageBitmap(input);
	try {
		const scale = Math.min(
			1,
			maxDimension / Math.max(bitmap.width, bitmap.height, 1),
		);
		const width = Math.max(1, Math.round(bitmap.width * scale));
		const height = Math.max(1, Math.round(bitmap.height * scale));

		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			throw new Error("浏览器 Canvas 上下文不可用");
		}
		ctx.drawImage(bitmap, 0, 0, width, height);

		const webpBlob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(blob) => {
					if (blob) resolve(blob);
					else reject(new Error("WebP 编码失败"));
				},
				"image/webp",
				quality,
			);
		});

		const buffer = await webpBlob.arrayBuffer();
		return {
			bytes: new Uint8Array(buffer),
			width,
			height,
			mimeType: "image/webp",
			size: webpBlob.size,
		};
	} finally {
		bitmap.close();
	}
}

export async function readFileBytes(file: Blob): Promise<Uint8Array> {
	const buffer = await file.arrayBuffer();
	return new Uint8Array(buffer);
}

function readUint24BE(bytes: Uint8Array, offset: number): number {
	return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
	return (
		((bytes[offset] << 24) >>> 0) |
		(bytes[offset + 1] << 16) |
		(bytes[offset + 2] << 8) |
		bytes[offset + 3]
	);
}

function readSyncsafe32(bytes: Uint8Array, offset: number): number {
	return (
		((bytes[offset] & 0x7f) << 21) |
		((bytes[offset + 1] & 0x7f) << 14) |
		((bytes[offset + 2] & 0x7f) << 7) |
		(bytes[offset + 3] & 0x7f)
	);
}

function decodeId3Text(payload: Uint8Array, encoding: number): string {
	let decoderName = "iso-8859-1";
	let start = 0;
	if (encoding === 1) {
		if (payload.length >= 2 && payload[0] === 0xfe && payload[1] === 0xff) {
			decoderName = "utf-16be";
			start = 2;
		} else if (
			payload.length >= 2 &&
			payload[0] === 0xff &&
			payload[1] === 0xfe
		) {
			decoderName = "utf-16le";
			start = 2;
		} else {
			decoderName = "utf-16le";
		}
	} else if (encoding === 2) {
		decoderName = "utf-16be";
	} else if (encoding === 3) {
		decoderName = "utf-8";
	}

	const slice = payload.subarray(start);
	let decoded = "";
	try {
		decoded = new TextDecoder(decoderName).decode(slice);
	} catch {
		decoded = new TextDecoder("utf-8", { fatal: false }).decode(slice);
	}
	return decoded.replace(/\0+$/g, "").trim();
}

function findNullTerminator(
	bytes: Uint8Array,
	offset: number,
	doubleByte: boolean,
): number {
	if (doubleByte) {
		for (let i = offset; i + 1 < bytes.length; i += 2) {
			if (bytes[i] === 0 && bytes[i + 1] === 0) return i;
		}
		return bytes.length;
	}
	for (let i = offset; i < bytes.length; i += 1) {
		if (bytes[i] === 0) return i;
	}
	return bytes.length;
}

function parseApicFrame(payload: Uint8Array): {
	mimeType: string;
	bytes: Uint8Array;
} | null {
	if (payload.length < 4) return null;
	const encoding = payload[0];
	const mimeEnd = findNullTerminator(payload, 1, false);
	if (mimeEnd >= payload.length) return null;
	const mimeType =
		new TextDecoder("iso-8859-1").decode(payload.subarray(1, mimeEnd)).trim() ||
		"image/jpeg";
	const picTypePos = mimeEnd + 1;
	if (picTypePos >= payload.length) return null;
	const isUtf16 = encoding === 1 || encoding === 2;
	const descStart = picTypePos + 1;
	const descEnd = findNullTerminator(payload, descStart, isUtf16);
	const dataStart = descEnd + (isUtf16 ? 2 : 1);
	if (dataStart >= payload.length) return null;
	return {
		mimeType,
		bytes: payload.slice(dataStart),
	};
}

export interface Id3TagResult {
	readonly title?: string;
	readonly artist?: string;
	readonly album?: string;
	readonly coverBytes?: Uint8Array;
	readonly coverMimeType?: string;
}

/**
 * Pure TypeScript ID3v2 (v2.2 / v2.3 / v2.4) & ID3v1 parser.
 * Accepts header slice (for ID3v2) and optional tail slice (last 128 bytes for ID3v1).
 */
export function parseId3TagsFromBytes(
	headBytes: Uint8Array,
	tailBytes?: Uint8Array,
): Id3TagResult {
	let title: string | undefined;
	let artist: string | undefined;
	let album: string | undefined;
	let coverBytes: Uint8Array | undefined;
	let coverMimeType: string | undefined;

	if (
		headBytes.length >= 10 &&
		headBytes[0] === 0x49 &&
		headBytes[1] === 0x44 &&
		headBytes[2] === 0x33
	) {
		const version = headBytes[3];
		const flags = headBytes[5];
		const tagSize = readSyncsafe32(headBytes, 6);
		let offset = 10;
		const limit = Math.min(headBytes.length, 10 + tagSize);

		// Skip optional extended header in v2.3 / v2.4
		if ((flags & 0x40) !== 0 && offset + 4 <= limit) {
			const extSize =
				version === 4
					? readSyncsafe32(headBytes, offset)
					: readUint32BE(headBytes, offset) + 4;
			offset += Math.max(4, extSize);
		}

		const isV22 = version === 2;
		const headerLen = isV22 ? 6 : 10;

		while (offset + headerLen <= limit) {
			if (headBytes[offset] === 0) break;
			const frameId = isV22
				? String.fromCharCode(
						headBytes[offset],
						headBytes[offset + 1],
						headBytes[offset + 2],
					)
				: String.fromCharCode(
						headBytes[offset],
						headBytes[offset + 1],
						headBytes[offset + 2],
						headBytes[offset + 3],
					);

			if (!/^[A-Z0-9]{3,4}$/.test(frameId)) break;

			let frameSize = isV22
				? readUint24BE(headBytes, offset + 3)
				: version === 4
					? readSyncsafe32(headBytes, offset + 4)
					: readUint32BE(headBytes, offset + 4);

			// Fallback for non-syncsafe v2.4 encoders
			if (
				version === 4 &&
				offset + headerLen + frameSize > limit &&
				readUint32BE(headBytes, offset + 4) <= limit - (offset + headerLen)
			) {
				frameSize = readUint32BE(headBytes, offset + 4);
			}

			if (frameSize <= 0 || offset + headerLen + frameSize > limit) break;
			const payload = headBytes.subarray(
				offset + headerLen,
				offset + headerLen + frameSize,
			);

			if (frameId === "TIT2" || frameId === "TT2") {
				if (payload.length > 1) {
					title = decodeId3Text(payload.subarray(1), payload[0]) || title;
				}
			} else if (frameId === "TPE1" || frameId === "TP1") {
				if (payload.length > 1) {
					artist = decodeId3Text(payload.subarray(1), payload[0]) || artist;
				}
			} else if (frameId === "TALB" || frameId === "TAL") {
				if (payload.length > 1) {
					album = decodeId3Text(payload.subarray(1), payload[0]) || album;
				}
			} else if (frameId === "APIC" && !coverBytes) {
				const parsedPic = parseApicFrame(payload);
				if (parsedPic) {
					coverBytes = parsedPic.bytes;
					coverMimeType = parsedPic.mimeType;
				}
			} else if (frameId === "PIC" && !coverBytes && payload.length > 6) {
				const encoding = payload[0];
				const fmt = String.fromCharCode(payload[1], payload[2], payload[3])
					.toLowerCase()
					.trim();
				const isUtf16 = encoding === 1 || encoding === 2;
				const descEnd = findNullTerminator(payload, 5, isUtf16);
				const dataStart = descEnd + (isUtf16 ? 2 : 1);
				if (dataStart < payload.length) {
					coverBytes = payload.slice(dataStart);
					coverMimeType = fmt === "png" ? "image/png" : "image/jpeg";
				}
			}

			offset += headerLen + frameSize;
		}
	}

	if ((!title || !artist) && tailBytes && tailBytes.length === 128) {
		const header = String.fromCharCode(
			tailBytes[0],
			tailBytes[1],
			tailBytes[2],
		);
		if (header === "TAG") {
			const decoder = new TextDecoder("utf-8", { fatal: false });
			const v1Title = decoder
				.decode(tailBytes.subarray(3, 33))
				.replace(/\0+$/g, "")
				.trim();
			const v1Artist = decoder
				.decode(tailBytes.subarray(33, 63))
				.replace(/\0+$/g, "")
				.trim();
			const v1Album = decoder
				.decode(tailBytes.subarray(63, 93))
				.replace(/\0+$/g, "")
				.trim();
			if (!title && v1Title) title = v1Title;
			if (!artist && v1Artist) artist = v1Artist;
			if (!album && v1Album) album = v1Album;
		}
	}

	return {
		...(title ? { title } : {}),
		...(artist ? { artist } : {}),
		...(album ? { album } : {}),
		...(coverBytes ? { coverBytes, coverMimeType } : {}),
	};
}

export async function probeAudioDuration(
	file: Blob,
): Promise<number | undefined> {
	if (typeof Audio === "undefined" || typeof URL === "undefined") {
		return undefined;
	}
	const objectUrl = URL.createObjectURL(file);
	try {
		return await new Promise<number | undefined>((resolve) => {
			const audio = new Audio();
			let settled = false;
			const finish = (value: number | undefined) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				audio.removeAttribute("src");
				resolve(value);
			};
			const timer = window.setTimeout(() => finish(undefined), 3000);
			audio.preload = "metadata";
			audio.onloadedmetadata = () => {
				const dur =
					Number.isFinite(audio.duration) && audio.duration > 0
						? Math.round(audio.duration)
						: undefined;
				finish(dur);
			};
			audio.onerror = () => finish(undefined);
			audio.src = objectUrl;
		});
	} finally {
		URL.revokeObjectURL(objectUrl);
	}
}

export async function parseAudioFileForAdmin(
	file: File,
): Promise<ParsedAudioMeta> {
	const rawRel =
		(file as File & { webkitRelativePath?: string }).webkitRelativePath ||
		file.name;
	const cleanRel = rawRel.replace(/\\/g, "/").replace(/^\/+/, "");
	const headChunk = new Uint8Array(
		await file.slice(0, Math.min(file.size, 4 * 1024 * 1024)).arrayBuffer(),
	);
	const tailChunk =
		file.size >= 128
			? new Uint8Array(
					await file.slice(file.size - 128, file.size).arrayBuffer(),
				)
			: undefined;

	const id3 = parseId3TagsFromBytes(headChunk, tailChunk);
	const fromName = parseTrackFromFilename(cleanRel);
	const duration = await probeAudioDuration(file);

	const title = id3.title || fromName.title;
	const artist = id3.artist || fromName.artist;
	const baseSlug = slugifyAudioId(
		artist ? `${artist}-${title}` : title || file.name,
		"mp3",
	);

	return {
		id: baseSlug,
		title,
		...(artist ? { artist } : {}),
		...(id3.album ? { album: id3.album } : {}),
		...(duration ? { duration } : {}),
		...(id3.coverBytes
			? { coverBytes: id3.coverBytes, coverMimeType: id3.coverMimeType }
			: {}),
		fileName: file.name,
		relativePath: cleanRel,
		sizeBytes: file.size,
	};
}

export function sanitizeUploadFilename(name: string, fallbackExt = ""): string {
	const trimmed = name.trim();
	const dotIdx = trimmed.lastIndexOf(".");
	const base = dotIdx > 0 ? trimmed.slice(0, dotIdx) : trimmed;
	const ext = dotIdx > 0 ? trimmed.slice(dotIdx).toLowerCase() : fallbackExt;
	const safeBase =
		base
			.replace(/[\\/:*?"<>|#%{}^[\]`]+/g, "-")
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-+|-+$/g, "") || `file-${Date.now().toString(36)}`;
	return `${safeBase}${ext}`;
}
