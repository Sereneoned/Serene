import type { TrackDescriptor } from "@/types/musicConfig";
import musicManifest from "./json/music.json" with { type: "json" };

export interface MusicManifestFile {
	readonly tracks: readonly TrackDescriptor[];
	readonly excludedSources?: readonly string[];
}

const typedManifest = musicManifest as MusicManifestFile;

/**
 * 侧栏音乐本地曲目数据源（由 src/data/json/music.json 驱动，支持前端后台直接增删改）。
 */
export const musicTracks: readonly TrackDescriptor[] = typedManifest.tracks;

/**
 * 在前端后台中被管理员删除/隐藏的文件夹自动扫描音频 source 列表。
 */
export const excludedMusicSources: readonly string[] =
	typedManifest.excludedSources ?? [];
