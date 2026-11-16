/**
 * Curated Tag / Technology / Platform presets and pure tag-list helpers
 * used across Admin visual data editors.
 */

export const TIMELINE_TAG_PRESETS: readonly string[] = [
	"里程碑",
	"开源",
	"项目上线",
	"学习",
	"工作",
	"生活",
	"Astro",
	"TypeScript",
	"Svelte",
	"全栈",
	"写作",
	"旅行",
];

export const PROJECT_TECH_PRESETS: readonly string[] = [
	"Astro",
	"Svelte",
	"TypeScript",
	"JavaScript",
	"Tailwind CSS",
	"React",
	"Vue",
	"Next.js",
	"Node.js",
	"Python",
	"Rust",
	"Go",
	"Kotlin",
	"Android",
	"C",
	"Linux",
	"Docker",
	"Cloudflare",
];

export const GAME_TAG_PRESETS: readonly string[] = [
	"开放世界",
	"RPG",
	"动作",
	"沙盒",
	"独立游戏",
	"剧情向",
	"二次元",
	"策略",
	"肉鸽",
	"音游",
	"多人联机",
	"模拟经营",
	"解谜",
	"休闲",
];

export const GAME_PLATFORM_PRESETS: readonly string[] = [
	"PC",
	"PlayStation",
	"Switch",
	"Mobile",
	"Steam Deck",
	"Xbox",
];

export const FRIEND_TAG_PRESETS: readonly string[] = [
	"技术",
	"博客",
	"日常",
	"设计",
	"开源",
	"二次元",
	"折腾",
];

/** Split comma/newline input into cleaned unique tag tokens. */
export function parseTagTokens(raw: string): string[] {
	const tokens = raw
		.split(/[,，\n]+/)
		.map((part) => part.trim())
		.filter(Boolean);
	return mergeUniqueTags([], tokens);
}

/** Merge new tags into an existing list while preserving original casing and order. */
export function mergeUniqueTags(
	existing: readonly string[],
	additions: readonly string[],
): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const candidate of [...existing, ...additions]) {
		const cleaned = candidate.trim();
		if (!cleaned) continue;
		const normalized = cleaned.toLowerCase();
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		result.push(cleaned);
	}
	return result;
}

/** Remove a single tag from the list case-insensitively. */
export function removeTagValue(
	existing: readonly string[],
	target: string,
): string[] {
	const key = target.trim().toLowerCase();
	return existing.filter((item) => item.trim().toLowerCase() !== key);
}

/** Toggle presence of a tag in the list. */
export function toggleTagValue(
	existing: readonly string[],
	target: string,
): string[] {
	const cleaned = target.trim();
	if (!cleaned) return [...existing];
	const key = cleaned.toLowerCase();
	const exists = existing.some((item) => item.trim().toLowerCase() === key);
	return exists ? removeTagValue(existing, cleaned) : [...existing, cleaned];
}

/** Collect all unique tags across a list of items. */
export function collectTagsFromRecords<T>(
	items: readonly T[],
	getter: (item: T) => readonly string[] | undefined,
): string[] {
	const all: string[] = [];
	for (const item of items) {
		const list = getter(item);
		if (list) all.push(...list);
	}
	return mergeUniqueTags([], all);
}
