import type { ResolvedCommentOptions } from "@/config/commentConfig";
import type { WalineConfig } from "@/types/commentConfig";

export interface WalineInteractionOptions extends WalineConfig {
	readonly defaultLanguage: string;
}

export interface WalinePathCounters {
	readonly views: number;
	readonly likes: number;
	readonly comments: number;
}

const LIKED_STORAGE_KEY = "shirone-waline-liked-paths";
const VIEWED_STORAGE_KEY = "shirone-waline-viewed-paths";

const WALINE_LANGUAGES: Readonly<Record<string, string>> = {
	zh: "zh-CN",
	"zh-cn": "zh-CN",
	"zh-tw": "zh-TW",
	"zh-hk": "zh-TW",
	"zh-hans": "zh-CN",
	"zh-hant": "zh-TW",
	jp: "jp",
	ja: "jp",
	en: "en",
	es: "es",
	ko: "ko",
	vi: "vi",
};

/** Map site language code to Waline 3.x client locale code. */
export function resolveWalineLang(
	contextLanguage: string,
	configuredLang = "auto",
): string {
	if (configuredLang && configuredLang !== "auto") return configuredLang;
	const siteLanguage = (contextLanguage || "en")
		.toLowerCase()
		.replaceAll("_", "-");
	return (
		WALINE_LANGUAGES[siteLanguage] ??
		WALINE_LANGUAGES[siteLanguage.split("-")[0]] ??
		"en"
	);
}

/** Extract serializable Waline options when comments are configured to use Waline. */
export function toWalineInteractionOptions(
	resolved: ResolvedCommentOptions | null,
	siteLanguage: string,
): WalineInteractionOptions | null {
	if (resolved?.provider !== "waline") return null;
	return {
		...resolved.waline,
		defaultLanguage: siteLanguage,
	};
}

/** Canonical interaction path for a Moment entry (safe with subpath deployments). */
export function buildMomentInteractionPath(
	momentId: string,
	basePath = "/",
): string {
	const cleanBase = `/${basePath.replace(/^\/+|\/+$/g, "")}`;
	const prefix = cleanBase === "/" ? "/" : `${cleanBase}/`;
	const cleanId = momentId.replace(/^\/+|\/+$/g, "");
	return `${prefix}moments/${cleanId}/`;
}

function asCount(value: unknown): number {
	const num = Number(value);
	return Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0;
}

function unwrapData(payload: unknown): unknown {
	if (
		payload &&
		typeof payload === "object" &&
		!Array.isArray(payload) &&
		"data" in payload
	) {
		return (payload as { data: unknown }).data;
	}
	return payload;
}

/** Parse Waline `GET /api/article` payload (`time`, `reaction0`) for one or more paths. */
export function parseWalineArticleCounters(
	payload: unknown,
	paths: readonly string[],
): Map<string, { views: number; likes: number }> {
	const result = new Map<string, { views: number; likes: number }>();
	for (const p of paths) {
		result.set(p, { views: 0, likes: 0 });
	}
	if (paths.length === 0) return result;

	const data = unwrapData(payload);
	const list = Array.isArray(data)
		? data
		: data && typeof data === "object"
			? [data]
			: [];

	if (list.length === 0 && typeof data === "number") {
		result.set(paths[0], { views: asCount(data), likes: 0 });
		return result;
	}

	for (let i = 0; i < list.length; i += 1) {
		const raw = list[i];
		if (typeof raw === "number" && paths[i]) {
			result.set(paths[i], { views: asCount(raw), likes: 0 });
			continue;
		}
		if (!raw || typeof raw !== "object") continue;
		const rec = raw as Record<string, unknown>;
		const matchedPath =
			typeof rec.path === "string" && result.has(rec.path)
				? rec.path
				: typeof rec.url === "string" && result.has(rec.url)
					? rec.url
					: paths.length === list.length
						? paths[i]
						: undefined;
		if (!matchedPath) continue;
		result.set(matchedPath, {
			views: asCount(rec.time ?? rec.pageview),
			likes: asCount(rec.reaction0 ?? rec.like),
		});
	}
	return result;
}

/** Parse Waline `GET /api/comment?type=count` payload for one or more paths. */
export function parseWalineCommentCounts(
	payload: unknown,
	paths: readonly string[],
): Map<string, number> {
	const result = new Map<string, number>();
	for (const p of paths) {
		result.set(p, 0);
	}
	if (paths.length === 0) return result;

	const data = unwrapData(payload);
	if (typeof data === "number") {
		result.set(paths[0], asCount(data));
		return result;
	}
	const list = Array.isArray(data)
		? data
		: data && typeof data === "object"
			? [data]
			: [];

	for (let i = 0; i < list.length; i += 1) {
		const item = list[i];
		if (typeof item === "number") {
			if (paths[i]) result.set(paths[i], asCount(item));
			continue;
		}
		if (!item || typeof item !== "object") continue;
		const rec = item as Record<string, unknown>;
		const matchedPath =
			typeof rec.url === "string" && result.has(rec.url)
				? rec.url
				: typeof rec.path === "string" && result.has(rec.path)
					? rec.path
					: paths.length === list.length
						? paths[i]
						: undefined;
		if (!matchedPath) continue;
		result.set(matchedPath, asCount(rec.count ?? rec.comment));
	}
	return result;
}

function readStoredSet(storage: Storage | undefined, key: string): Set<string> {
	if (!storage) return new Set();
	try {
		const raw = storage.getItem(key);
		if (!raw) return new Set();
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return new Set();
		return new Set(parsed.filter((v): v is string => typeof v === "string"));
	} catch {
		return new Set();
	}
}

function writeStoredSet(
	storage: Storage | undefined,
	key: string,
	values: Set<string>,
): void {
	if (!storage) return;
	try {
		storage.setItem(key, JSON.stringify([...values]));
	} catch {
		// Ignore storage quota / private mode restrictions.
	}
}

export function hasLikedWalinePath(path: string): boolean {
	if (typeof window === "undefined") return false;
	return readStoredSet(window.localStorage, LIKED_STORAGE_KEY).has(path);
}

export function setLikedWalinePath(path: string, liked: boolean): void {
	if (typeof window === "undefined") return;
	const next = readStoredSet(window.localStorage, LIKED_STORAGE_KEY);
	if (liked) next.add(path);
	else next.delete(path);
	writeStoredSet(window.localStorage, LIKED_STORAGE_KEY, next);
}

function cleanServerUrl(serverURL: string): string {
	return serverURL.trim().replace(/\/+$/, "");
}

/** Batch-fetch Waline views (`time`), likes (`reaction0`), and comment counts in at most 2 requests. */
export async function fetchWalineBatchCounters(
	serverURL: string,
	paths: readonly string[],
	signal?: AbortSignal,
): Promise<Map<string, WalinePathCounters>> {
	const merged = new Map<string, WalinePathCounters>();
	for (const p of paths) {
		merged.set(p, { views: 0, likes: 0, comments: 0 });
	}
	const base = cleanServerUrl(serverURL);
	if (!base || paths.length === 0) return merged;

	const encoded = encodeURIComponent(paths.join(","));
	const [articleRes, commentRes] = await Promise.allSettled([
		fetch(`${base}/api/article?path=${encoded}&type=time,reaction0`, {
			signal,
		}).then((res) => (res.ok ? res.json() : null)),
		fetch(`${base}/api/comment?type=count&url=${encoded}`, { signal }).then(
			(res) => (res.ok ? res.json() : null),
		),
	]);

	const articleMap =
		articleRes.status === "fulfilled" && articleRes.value
			? parseWalineArticleCounters(articleRes.value, paths)
			: new Map<string, { views: number; likes: number }>();
	const commentMap =
		commentRes.status === "fulfilled" && commentRes.value
			? parseWalineCommentCounts(commentRes.value, paths)
			: new Map<string, number>();

	for (const p of paths) {
		const article = articleMap.get(p);
		merged.set(p, {
			views: article?.views ?? 0,
			likes: article?.likes ?? 0,
			comments: commentMap.get(p) ?? 0,
		});
	}
	return merged;
}

async function postArticleCounter(
	serverURL: string,
	path: string,
	type: "time" | "reaction0",
	action: "inc" | "desc",
): Promise<number | null> {
	const base = cleanServerUrl(serverURL);
	if (!base || !path) return null;
	const res = await fetch(`${base}/api/article`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ path, type, action }),
	});
	if (!res.ok) {
		throw new Error(`Waline counter error (${res.status})`);
	}
	const payload = (await res.json().catch(() => null)) as unknown;
	const parsed = parseWalineArticleCounters(payload, [path]).get(path);
	if (!parsed) return null;
	return type === "reaction0" ? parsed.likes : parsed.views;
}

/** Toggle like (`reaction0`) for a post or moment, syncing browser preference in localStorage. */
export async function toggleWalineLike(
	serverURL: string,
	path: string,
	currentlyLiked: boolean,
): Promise<{ liked: boolean; likes: number | null }> {
	const nextLiked = !currentlyLiked;
	const likes = await postArticleCounter(
		serverURL,
		path,
		"reaction0",
		nextLiked ? "inc" : "desc",
	);
	setLikedWalinePath(path, nextLiked);
	return { liked: nextLiked, likes };
}

/** Increment view counter (`time`) once per browser session per path. */
export async function recordWalineViewOnce(
	serverURL: string,
	path: string,
): Promise<number | null> {
	if (typeof window === "undefined") return null;
	const viewed = readStoredSet(window.sessionStorage, VIEWED_STORAGE_KEY);
	if (viewed.has(path)) return null;
	viewed.add(path);
	writeStoredSet(window.sessionStorage, VIEWED_STORAGE_KEY, viewed);
	try {
		return await postArticleCounter(serverURL, path, "time", "inc");
	} catch {
		return null;
	}
}
