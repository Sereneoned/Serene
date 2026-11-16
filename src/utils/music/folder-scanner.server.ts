import fs from "node:fs";
import path from "node:path";
import type { TrackDescriptor } from "@/types/musicConfig";
import {
	isSupportedAudioFilename,
	parseTrackFromFilename,
	stripAudioExtension,
} from "./filename-parser.ts";

const MUSIC_URL_DIR = path.resolve(process.cwd(), "public/assets/music/url");
const MUSIC_COVER_DIR = path.resolve(
	process.cwd(),
	"public/assets/music/cover",
);
const COVER_EXTENSIONS = [".webp", ".avif", ".jpg", ".jpeg", ".png"] as const;

function collectAudioFiles(dir: string, prefix = ""): string[] {
	if (!fs.existsSync(dir)) return [];
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const results: string[] = [];
	for (const entry of entries) {
		if (entry.name.startsWith(".")) continue;
		const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...collectAudioFiles(full, rel));
		} else if (entry.isFile() && isSupportedAudioFilename(entry.name)) {
			results.push(rel);
		}
	}
	return results.sort((a, b) =>
		a.localeCompare(b, undefined, { numeric: true }),
	);
}

function findMatchingCover(relativeAudioPath: string): string | undefined {
	const noExt = stripAudioExtension(relativeAudioPath);
	const baseName = path.basename(noExt);
	const audioSubDir = path.dirname(relativeAudioPath);

	for (const ext of COVER_EXTENSIONS) {
		const coverInCoverRoot = path.join(MUSIC_COVER_DIR, `${baseName}${ext}`);
		if (fs.existsSync(coverInCoverRoot)) {
			return `/assets/music/cover/${baseName}${ext}`;
		}
		const sameFolderCover = path.join(MUSIC_URL_DIR, `${noExt}${ext}`);
		if (fs.existsSync(sameFolderCover)) {
			return `/assets/music/url/${noExt}${ext}`;
		}
	}

	if (audioSubDir && audioSubDir !== ".") {
		for (const ext of COVER_EXTENSIONS) {
			const folderCover = path.join(MUSIC_URL_DIR, audioSubDir, `cover${ext}`);
			if (fs.existsSync(folderCover)) {
				return `/assets/music/url/${audioSubDir}/cover${ext}`;
			}
		}
	}
	return undefined;
}

function normalizeSourcePath(source: string): string {
	const trimmed = source.trim();
	try {
		return decodeURIComponent(trimmed);
	} catch {
		return trimmed;
	}
}

/**
 * 扫描 `public/assets/music/url/` 目录中的本地音频文件（支持子目录），
 * 自动补齐未在 `src/data/json/music.json` 显式登记且未被排除的曲目。
 */
export function scanLocalMusicFolder(
	existingTracks: readonly TrackDescriptor[],
	excludedSources: readonly string[] = [],
	rootDir: string = MUSIC_URL_DIR,
): TrackDescriptor[] {
	const files = collectAudioFiles(rootDir);
	if (files.length === 0) return [];

	const knownSources = new Set(
		existingTracks.map((track) => normalizeSourcePath(track.source)),
	);
	const excluded = new Set(excludedSources.map(normalizeSourcePath));
	const usedIds = new Set(existingTracks.map((track) => track.id.trim()));

	const discovered: TrackDescriptor[] = [];
	for (const relPath of files) {
		const source = `/assets/music/url/${relPath}`;
		const normalizedSource = normalizeSourcePath(source);
		if (knownSources.has(normalizedSource) || excluded.has(normalizedSource)) {
			continue;
		}
		const parsed = parseTrackFromFilename(relPath);
		let id = parsed.id;
		let suffix = 2;
		while (usedIds.has(id)) {
			id = `${parsed.id}-${suffix}`;
			suffix += 1;
		}
		usedIds.add(id);

		const cover =
			rootDir === MUSIC_URL_DIR ? findMatchingCover(relPath) : undefined;
		discovered.push({
			id,
			title: parsed.title,
			...(parsed.artist ? { artist: parsed.artist } : {}),
			source,
			...(cover ? { cover } : {}),
		});
	}
	return discovered;
}

/**
 * 合并显式登记曲目与文件夹自动扫描曲目。
 */
export function mergeLocalAndFolderTracks(
	existingTracks: readonly TrackDescriptor[],
	excludedSources: readonly string[] = [],
): readonly TrackDescriptor[] {
	const scanned = scanLocalMusicFolder(existingTracks, excludedSources);
	return scanned.length > 0 ? [...existingTracks, ...scanned] : existingTracks;
}
