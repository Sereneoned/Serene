/**
 * Parse track metadata (title, artist) and deterministic slug ID from an audio filename or path.
 */
export interface ParsedAudioFilename {
	readonly id: string;
	readonly title: string;
	readonly artist?: string;
}

const AUDIO_EXT_RE = /\.(mp3|m4a|ogg|wav|flac|aac)$/i;
const TRACK_PREFIX_RE = /^\d{1,3}\s*[._-]\s*/;

export function isSupportedAudioFilename(filename: string): boolean {
	return AUDIO_EXT_RE.test(filename);
}

export function stripAudioExtension(filename: string): string {
	return filename.replace(AUDIO_EXT_RE, "");
}

export function slugifyAudioId(input: string, prefix = "track"): string {
	const cleaned = input
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (cleaned) {
		return cleaned.slice(0, 64);
	}
	let hash = 0;
	for (let i = 0; i < input.length; i += 1) {
		hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
	}
	return `${prefix}-${hash.toString(36)}`;
}

export function parseTrackFromFilename(
	relativePath: string,
): ParsedAudioFilename {
	const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
	const base = normalized.split("/").pop() ?? normalized;
	const rawName = stripAudioExtension(base).replace(TRACK_PREFIX_RE, "").trim();

	const separatorIndex = rawName.indexOf(" - ");
	let artist: string | undefined;
	let title = rawName || "Untitled Track";

	if (separatorIndex > 0 && separatorIndex + 3 < rawName.length) {
		const left = rawName.slice(0, separatorIndex).trim();
		const right = rawName.slice(separatorIndex + 3).trim();
		if (left && right) {
			artist = left;
			title = right;
		}
	}

	return {
		id: slugifyAudioId(normalized, "mp3"),
		title,
		...(artist ? { artist } : {}),
	};
}
