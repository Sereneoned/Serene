import type { CompassEntry, CompassShelf } from "@/data/compass";
import type { FriendItem } from "@/data/friends";
import type { GameCategory, GameItem, GameStatus } from "@/types/gamesConfig";
import type {
	ProjectCategory,
	ProjectItem,
	ProjectPhase,
} from "@/types/projectsConfig";
import type {
	TimelineCategory,
	TimelineItem,
	TimelineLink,
} from "@/types/timelineConfig";
import type { RepoFileChange } from "./github-client.ts";
import { toSlug } from "./serializers.ts";
import { mergeUniqueTags } from "./tag-presets.ts";

export interface EditableCategory {
	key: string;
	label: string;
	icon?: string;
	description?: string;
}

const VALID_PROJECT_PHASES = new Set<ProjectPhase>([
	"shipped",
	"building",
	"exploring",
]);

const VALID_GAME_STATUSES = new Set<GameStatus>([
	"playing",
	"completed",
	"backlog",
	"wishlist",
]);

function asTrimmedString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function asStringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((entry): entry is string => typeof entry === "string")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

/** Swap an element one position up (-1) or down (+1) immutably. */
export function moveListItem<T>(
	items: readonly T[],
	index: number,
	direction: -1 | 1,
): T[] {
	const target = index + direction;
	if (
		index < 0 ||
		index >= items.length ||
		target < 0 ||
		target >= items.length
	) {
		return [...items];
	}
	const copy = [...items];
	const [moved] = copy.splice(index, 1);
	copy.splice(target, 0, moved);
	return copy;
}

/** Generate a slug key/id that does not collide with `existingKeys`. */
export function ensureUniqueKey(
	raw: string,
	existingKeys: Iterable<string>,
	fallbackPrefix = "item",
): string {
	const existing = new Set(
		Array.from(existingKeys, (k) => k.trim().toLowerCase()).filter(Boolean),
	);
	const base = toSlug(raw, fallbackPrefix);
	if (!existing.has(base.toLowerCase())) return base;
	let suffix = 2;
	while (existing.has(`${base}-${suffix}`.toLowerCase())) {
		suffix += 1;
	}
	return `${base}-${suffix}`;
}

export function createEmptyTimelineItem(
	defaultCategory = "milestone",
): TimelineItem {
	const now = new Date();
	const date = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}`;
	return {
		title: "",
		date,
		category: defaultCategory,
		subtitle: "",
		location: "",
		description: "",
		highlights: [],
		tags: [],
		links: [],
		icon: "",
		featured: false,
	};
}

export function normalizeTimelineItems(raw: unknown): TimelineItem[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter((item): item is Record<string, unknown> =>
			Boolean(item && typeof item === "object"),
		)
		.map((rec) => {
			const links: TimelineLink[] = Array.isArray(rec.links)
				? rec.links
						.filter((l): l is Record<string, unknown> =>
							Boolean(l && typeof l === "object"),
						)
						.map((l) => {
							const label = asTrimmedString(l.label);
							const url = asTrimmedString(l.url);
							const icon = asTrimmedString(l.icon);
							return {
								label,
								url,
								...(icon ? { icon } : {}),
							};
						})
						.filter((l) => l.label || l.url)
				: [];

			const item: TimelineItem = {
				...(rec.enable === false ? { enable: false } : {}),
				title: asTrimmedString(rec.title),
				date: asTrimmedString(rec.date),
				...(asTrimmedString(rec.category)
					? { category: asTrimmedString(rec.category) }
					: {}),
				...(asTrimmedString(rec.subtitle)
					? { subtitle: asTrimmedString(rec.subtitle) }
					: {}),
				...(asTrimmedString(rec.location)
					? { location: asTrimmedString(rec.location) }
					: {}),
				...(asTrimmedString(rec.description)
					? { description: asTrimmedString(rec.description) }
					: {}),
				...(asStringList(rec.highlights).length > 0
					? { highlights: asStringList(rec.highlights) }
					: {}),
				...(mergeUniqueTags([], asStringList(rec.tags)).length > 0
					? { tags: mergeUniqueTags([], asStringList(rec.tags)) }
					: {}),
				...(links.length > 0 ? { links } : {}),
				...(asTrimmedString(rec.icon)
					? { icon: asTrimmedString(rec.icon) }
					: {}),
				...(rec.featured === true ? { featured: true } : {}),
			};
			return item;
		});
}

export function serializeTimelineItems(items: readonly TimelineItem[]): string {
	return `${JSON.stringify(normalizeTimelineItems(items), null, 2)}\n`;
}

export function createEmptyProjectItem(defaultCategory = "theme"): ProjectItem {
	return {
		key: "",
		title: "",
		summary: "",
		category: defaultCategory,
		phase: "building",
		technologies: [],
		icon: "material-symbols:deployed-code-outline-rounded",
		cover: "",
		coverAlt: "",
		featured: false,
		website: "",
		repository: "",
		year: String(new Date().getFullYear()),
	};
}

export function normalizeProjectItems(raw: unknown): ProjectItem[] {
	if (!Array.isArray(raw)) return [];
	const usedKeys = new Set<string>();
	return raw
		.filter((item): item is Record<string, unknown> =>
			Boolean(item && typeof item === "object"),
		)
		.map((rec) => {
			const title = asTrimmedString(rec.title);
			const rawKey = asTrimmedString(rec.key) || title;
			const key = ensureUniqueKey(rawKey, usedKeys, "project");
			usedKeys.add(key.toLowerCase());

			const rawPhase = asTrimmedString(rec.phase) as ProjectPhase;
			const phase: ProjectPhase = VALID_PROJECT_PHASES.has(rawPhase)
				? rawPhase
				: "building";

			const cover = asTrimmedString(rec.cover);
			const coverAlt = asTrimmedString(rec.coverAlt);
			const icon = asTrimmedString(rec.icon);
			const website = asTrimmedString(rec.website);
			const repository = asTrimmedString(rec.repository);
			const year = asTrimmedString(rec.year);

			return {
				...(rec.enable === false ? { enable: false } : {}),
				key,
				title: title || key,
				summary: asTrimmedString(rec.summary),
				category: asTrimmedString(rec.category) || "theme",
				phase,
				technologies: mergeUniqueTags([], asStringList(rec.technologies)),
				...(icon ? { icon } : {}),
				...(cover ? { cover } : {}),
				...(cover && coverAlt ? { coverAlt } : {}),
				...(rec.featured === true ? { featured: true } : {}),
				...(website ? { website } : {}),
				...(repository ? { repository } : {}),
				...(year ? { year } : {}),
			};
		});
}

export function serializeProjectItems(items: readonly ProjectItem[]): string {
	return `${JSON.stringify(normalizeProjectItems(items), null, 2)}\n`;
}

export function createEmptyGameItem(defaultCategory = "open-world"): GameItem {
	return {
		id: "",
		name: "",
		developer: "",
		category: defaultCategory,
		status: "playing",
		cover: "",
		icon: "material-symbols:sports-esports-outline-rounded",
		rating: undefined,
		hours: undefined,
		platform: "PC",
		year: String(new Date().getFullYear()),
		tags: [],
		description: "",
		link: "",
		featured: false,
	};
}

function normalizeHalfStepRating(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	const clamped = Math.min(5, Math.max(0, value));
	return Math.round(clamped * 2) / 2;
}

function normalizeHours(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		return undefined;
	}
	return Math.round(value * 10) / 10;
}

export function normalizeGameItems(raw: unknown): GameItem[] {
	if (!Array.isArray(raw)) return [];
	const usedIds = new Set<string>();
	return raw
		.filter((item): item is Record<string, unknown> =>
			Boolean(item && typeof item === "object"),
		)
		.map((rec) => {
			const name = asTrimmedString(rec.name);
			const rawId = asTrimmedString(rec.id) || name;
			const id = ensureUniqueKey(rawId, usedIds, "game");
			usedIds.add(id.toLowerCase());

			const rawStatus = asTrimmedString(rec.status) as GameStatus;
			const status: GameStatus = VALID_GAME_STATUSES.has(rawStatus)
				? rawStatus
				: "playing";

			const cover = asTrimmedString(rec.cover);
			const icon = asTrimmedString(rec.icon);
			const rating = normalizeHalfStepRating(rec.rating);
			const hours = normalizeHours(rec.hours);
			const platform = asTrimmedString(rec.platform);
			const year = asTrimmedString(rec.year);
			const tags = mergeUniqueTags([], asStringList(rec.tags));
			const link = asTrimmedString(rec.link);

			return {
				...(rec.enable === false ? { enable: false } : {}),
				id,
				name: name || id,
				developer: asTrimmedString(rec.developer),
				category: asTrimmedString(rec.category) || "open-world",
				status,
				...(cover ? { cover } : {}),
				...(icon ? { icon } : {}),
				...(rating !== undefined ? { rating } : {}),
				...(hours !== undefined ? { hours } : {}),
				...(platform ? { platform } : {}),
				...(year ? { year } : {}),
				...(tags.length > 0 ? { tags } : {}),
				description: asTrimmedString(rec.description),
				...(link ? { link } : {}),
				...(rec.featured === true ? { featured: true } : {}),
			};
		});
}

export function serializeGameItems(items: readonly GameItem[]): string {
	return `${JSON.stringify(normalizeGameItems(items), null, 2)}\n`;
}

export function createEmptyCompassEntry(): CompassEntry {
	return {
		label: "",
		href: "",
		note: "",
		icon: "",
		image: "",
	};
}

export function createEmptyCompassShelf(
	existingKeys: Iterable<string> = [],
): CompassShelf {
	const key = ensureUniqueKey("shelf", existingKeys, "shelf");
	return {
		key,
		name: "新分组",
		icon: "material-symbols:explore-rounded",
		blurb: "",
		entries: [],
	};
}

export function normalizeCompassShelves(raw: unknown): CompassShelf[] {
	if (!Array.isArray(raw)) return [];
	const usedKeys = new Set<string>();
	return raw
		.filter((shelf): shelf is Record<string, unknown> =>
			Boolean(shelf && typeof shelf === "object"),
		)
		.map((rec) => {
			const name = asTrimmedString(rec.name);
			const rawKey = asTrimmedString(rec.key) || name;
			const key = ensureUniqueKey(rawKey, usedKeys, "shelf");
			usedKeys.add(key.toLowerCase());

			const icon = asTrimmedString(rec.icon);
			const blurb = asTrimmedString(rec.blurb);
			const entries: CompassEntry[] = Array.isArray(rec.entries)
				? rec.entries
						.filter((e): e is Record<string, unknown> =>
							Boolean(e && typeof e === "object"),
						)
						.map((entry) => {
							const entryIcon = asTrimmedString(entry.icon);
							const entryNote = asTrimmedString(entry.note);
							const entryImage = asTrimmedString(entry.image);
							return {
								label: asTrimmedString(entry.label),
								href: asTrimmedString(entry.href),
								...(entryNote ? { note: entryNote } : {}),
								...(entryIcon ? { icon: entryIcon } : {}),
								...(entryImage ? { image: entryImage } : {}),
							};
						})
						.filter((entry) => entry.label || entry.href)
				: [];

			return {
				key,
				name: name || key,
				...(icon ? { icon } : {}),
				...(blurb ? { blurb } : {}),
				entries,
			};
		});
}

export function serializeCompassShelves(
	shelves: readonly CompassShelf[],
): string {
	return `${JSON.stringify(normalizeCompassShelves(shelves), null, 2)}\n`;
}

export function normalizeFriendItems(raw: unknown): FriendItem[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter((item): item is Record<string, unknown> =>
			Boolean(item && typeof item === "object"),
		)
		.map((rec, index) => ({
			id:
				typeof rec.id === "number" && Number.isFinite(rec.id)
					? rec.id
					: index + 1,
			title: asTrimmedString(rec.title),
			imgurl: asTrimmedString(rec.imgurl),
			desc: asTrimmedString(rec.desc),
			siteurl: asTrimmedString(rec.siteurl),
			tags: mergeUniqueTags([], asStringList(rec.tags)),
		}));
}

export function normalizeCategoryConfigs(raw: unknown): EditableCategory[] {
	if (!Array.isArray(raw)) return [];
	const usedKeys = new Set<string>();
	return raw
		.filter((cat): cat is Record<string, unknown> =>
			Boolean(cat && typeof cat === "object"),
		)
		.map((rec) => {
			const label = asTrimmedString(rec.label);
			const rawKey = asTrimmedString(rec.key) || label;
			const key = ensureUniqueKey(rawKey, usedKeys, "category");
			usedKeys.add(key.toLowerCase());
			const icon = asTrimmedString(rec.icon);
			const description = asTrimmedString(rec.description);
			return {
				key,
				label: label || key,
				...(icon ? { icon } : {}),
				...(description ? { description } : {}),
			};
		});
}

export function mergeDomainConfigOverride(
	rawOverrides: Record<string, unknown>,
	domain: "timeline" | "projects" | "games",
	patch: {
		readonly categories?: readonly (
			| TimelineCategory
			| ProjectCategory
			| GameCategory
			| EditableCategory
		)[];
		readonly order?: "desc" | "asc";
	},
): Record<string, unknown> {
	const prevDomain =
		rawOverrides[domain] &&
		typeof rawOverrides[domain] === "object" &&
		!Array.isArray(rawOverrides[domain])
			? (rawOverrides[domain] as Record<string, unknown>)
			: {};
	const nextDomain: Record<string, unknown> = { ...prevDomain };
	if (patch.categories) {
		nextDomain.categories = normalizeCategoryConfigs(patch.categories);
	}
	if (domain === "timeline" && patch.order) {
		nextDomain.order = patch.order === "asc" ? "asc" : "desc";
	}
	return {
		...rawOverrides,
		[domain]: nextDomain,
	};
}

/** Convert pending local image uploads (`public/...` -> bytes) to atomic GitHub file changes. */
export function buildPendingUploadChanges(
	pendingUploads: ReadonlyMap<string, Uint8Array>,
): RepoFileChange[] {
	const changes: RepoFileChange[] = [];
	for (const [repoPath, bytes] of pendingUploads.entries()) {
		if (!repoPath.trim() || bytes.byteLength === 0) continue;
		changes.push({
			path: repoPath,
			action: "upsert",
			content: bytes,
		});
	}
	return changes;
}
