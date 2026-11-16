import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { AlbumLayout, AlbumPhoto } from "@/types/album";

export interface MomentDraftInput {
	readonly id?: string;
	readonly published: string;
	readonly pinned?: boolean;
	readonly draft?: boolean;
	readonly location?: string;
	readonly mood?: string;
	readonly tags?: readonly string[];
	readonly images?: readonly { src: string; alt?: string }[];
	readonly encrypted?: boolean;
	readonly password?: string;
	readonly passwordHint?: string;
	readonly body: string;
}

export interface ParsedMomentDocument extends MomentDraftInput {
	readonly id: string;
	readonly filePath: string;
}

export interface PostDraftInput {
	readonly slug?: string;
	readonly title: string;
	readonly published: string;
	readonly updated?: string;
	readonly pinned?: boolean;
	readonly draft?: boolean;
	readonly comment?: boolean;
	readonly description?: string;
	readonly image?: string;
	readonly tags?: readonly string[];
	readonly category?: string;
	readonly series?: string;
	readonly seriesOrder?: number;
	readonly encrypted?: boolean;
	readonly password?: string;
	readonly passwordHint?: string;
	readonly alias?: string;
	readonly permalink?: string;
	readonly body: string;
}

export interface ParsedPostDocument extends PostDraftInput {
	readonly slug: string;
	readonly filePath: string;
}

export interface AlbumDraftInput {
	readonly id: string;
	readonly mode?: "local" | "external";
	readonly title: string;
	readonly description?: string;
	readonly date: string;
	readonly location?: string;
	readonly tags?: readonly string[];
	readonly layout: AlbumLayout;
	readonly columns: 2 | 3 | 4;
	readonly hidden?: boolean;
	readonly password?: string;
	readonly passwordHint?: string;
	readonly cover?: string;
	readonly photos?: readonly AlbumPhoto[];
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function splitMarkdownFrontmatter(raw: string): {
	data: Record<string, unknown>;
	body: string;
} {
	const match = FRONTMATTER_RE.exec(raw);
	if (!match) {
		return { data: {}, body: raw.trim() };
	}
	const parsed = parseYaml(match[1]);
	const data =
		parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	return { data, body: match[2].replace(/^\r?\n/, "") };
}

export function formatIsoDateTimeLocal(date: Date = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	const offsetMinutes = -date.getTimezoneOffset();
	const sign = offsetMinutes >= 0 ? "+" : "-";
	const absOffset = Math.abs(offsetMinutes);
	const tzHours = pad(Math.floor(absOffset / 60));
	const tzMins = pad(absOffset % 60);
	return (
		`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
		`T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${tzHours}:${tzMins}`
	);
}

export function formatDateYYYYMMDD(date: Date = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toSlug(raw: string, fallbackPrefix = "item"): string {
	const cleaned = raw
		.trim()
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (cleaned) return cleaned.slice(0, 64);
	return `${fallbackPrefix}-${Date.now().toString(36)}`;
}

function asString(value: unknown): string {
	if (value instanceof Date) return formatIsoDateTimeLocal(value);
	return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter(Boolean);
}

export function parseMomentMarkdown(
	filePath: string,
	raw: string,
): ParsedMomentDocument {
	const { data, body } = splitMarkdownFrontmatter(raw);
	const fileName = filePath.split("/").pop() ?? filePath;
	const id = fileName.replace(/\.(md|mdx)$/i, "");
	const images = Array.isArray(data.images)
		? data.images.flatMap((item) => {
				if (!item || typeof item !== "object") return [];
				const rec = item as Record<string, unknown>;
				const src = asString(rec.src);
				if (!src) return [];
				const alt = asString(rec.alt);
				return [{ src, ...(alt ? { alt } : {}) }];
			})
		: [];
	return {
		id,
		filePath,
		published: asString(data.published) || formatIsoDateTimeLocal(),
		pinned: data.pinned === true,
		draft: data.draft === true,
		location: asString(data.location),
		mood: asString(data.mood),
		tags: asStringArray(data.tags),
		images,
		encrypted: data.encrypted === true,
		password:
			data.password !== undefined && data.password !== null
				? String(data.password)
				: "",
		passwordHint: asString(data.passwordHint),
		body: body.trim(),
	};
}

export function serializeMomentMarkdown(input: MomentDraftInput): string {
	const frontmatter: Record<string, unknown> = {
		published: input.published.trim() || formatIsoDateTimeLocal(),
	};
	if (input.pinned) frontmatter.pinned = true;
	if (input.draft) frontmatter.draft = true;
	if (input.location?.trim()) frontmatter.location = input.location.trim();
	if (input.mood?.trim()) frontmatter.mood = input.mood.trim();
	const tags = (input.tags ?? []).map((t) => t.trim()).filter(Boolean);
	if (tags.length > 0) frontmatter.tags = tags;
	const images = (input.images ?? [])
		.filter((img) => img.src.trim())
		.map((img) => ({
			src: img.src.trim(),
			...(img.alt?.trim() ? { alt: img.alt.trim() } : {}),
		}));
	if (images.length > 0) frontmatter.images = images;
	if (input.encrypted && input.password?.trim()) {
		frontmatter.encrypted = true;
		frontmatter.password = input.password.trim();
		if (input.passwordHint?.trim()) {
			frontmatter.passwordHint = input.passwordHint.trim();
		}
	}

	const yamlBlock = stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd();
	const body = input.body.trim();
	return body
		? `---\n${yamlBlock}\n---\n\n${body}\n`
		: `---\n${yamlBlock}\n---\n`;
}

export function parsePostMarkdown(
	filePath: string,
	raw: string,
): ParsedPostDocument {
	const { data, body } = splitMarkdownFrontmatter(raw);
	const cleanPath = filePath.replace(/^.*src\/content\/posts\//, "");
	const slug = cleanPath
		.replace(/\/index\.(md|mdx)$/i, "")
		.replace(/\.(md|mdx)$/i, "");
	return {
		slug,
		filePath,
		title: asString(data.title) || slug,
		published: asString(data.published) || formatDateYYYYMMDD(),
		updated: asString(data.updated),
		pinned: data.pinned === true,
		draft: data.draft === true,
		comment: data.comment !== false,
		description: asString(data.description),
		image: asString(data.image),
		tags: asStringArray(data.tags),
		category: asString(data.category),
		series: asString(data.series),
		seriesOrder:
			typeof data.seriesOrder === "number" ? data.seriesOrder : undefined,
		encrypted: data.encrypted === true,
		password:
			data.password !== undefined && data.password !== null
				? String(data.password)
				: "",
		passwordHint: asString(data.passwordHint),
		alias: asString(data.alias),
		permalink: asString(data.permalink),
		body: body.trim(),
	};
}

export function serializePostMarkdown(input: PostDraftInput): string {
	const frontmatter: Record<string, unknown> = {
		title: input.title.trim() || "Untitled",
		published: input.published.trim() || formatDateYYYYMMDD(),
	};
	if (input.updated?.trim()) frontmatter.updated = input.updated.trim();
	if (input.description?.trim()) {
		frontmatter.description = input.description.trim();
	}
	if (input.image?.trim()) frontmatter.image = input.image.trim();
	const tags = (input.tags ?? []).map((t) => t.trim()).filter(Boolean);
	if (tags.length > 0) frontmatter.tags = tags;
	if (input.category?.trim()) frontmatter.category = input.category.trim();
	if (input.series?.trim()) frontmatter.series = input.series.trim();
	if (
		typeof input.seriesOrder === "number" &&
		Number.isFinite(input.seriesOrder)
	) {
		frontmatter.seriesOrder = input.seriesOrder;
	}
	if (input.pinned) frontmatter.pinned = true;
	if (input.draft) frontmatter.draft = true;
	if (input.comment === false) frontmatter.comment = false;
	if (input.alias?.trim()) frontmatter.alias = input.alias.trim();
	if (input.permalink?.trim()) frontmatter.permalink = input.permalink.trim();
	if (input.encrypted && input.password?.trim()) {
		frontmatter.encrypted = true;
		frontmatter.password = input.password.trim();
		if (input.passwordHint?.trim()) {
			frontmatter.passwordHint = input.passwordHint.trim();
		}
	}

	const yamlBlock = stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd();
	const body = input.body.trim();
	return `---\n${yamlBlock}\n---\n\n${body}\n`;
}

export function serializeAlbumInfoJson(input: AlbumDraftInput): string {
	const out: Record<string, unknown> = {
		...(input.mode === "external" ? { mode: "external" } : {}),
		title: input.title.trim() || input.id,
		description: input.description?.trim() ?? "",
		date: input.date.trim() || formatDateYYYYMMDD(),
		location: input.location?.trim() ?? "",
		tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
		layout: input.layout === "grid" ? "grid" : "masonry",
		columns: input.columns === 2 || input.columns === 4 ? input.columns : 3,
		hidden: Boolean(input.hidden),
	};
	if (input.password?.trim()) {
		out.password = input.password.trim();
		if (input.passwordHint?.trim()) {
			out.passwordHint = input.passwordHint.trim();
		}
	}
	if (input.mode === "external") {
		out.cover = input.cover?.trim() ?? "";
		out.photos = input.photos ?? [];
	}
	return `${JSON.stringify(out, null, 2)}\n`;
}
