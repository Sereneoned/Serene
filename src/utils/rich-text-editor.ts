export type ImageAlign = "left" | "center" | "right";

export interface TextEditResult {
	value: string;
	selectionStart: number;
	selectionEnd: number;
}

export interface EmbeddedMarkdownImage {
	index: number;
	rawLength: number;
	rawMatch: string;
	src: string;
	alt: string;
	width: number;
	align: ImageAlign;
	title: string;
	paragraphIndex: number;
	totalParagraphs: number;
}

export const FONT_SIZE_PRESETS: ReadonlyArray<{
	label: string;
	shortLabel: string;
	size: string;
}> = [
	{ label: "极小 12px", shortLabel: "12px", size: "12px" },
	{ label: "小号 14px", shortLabel: "14px", size: "14px" },
	{ label: "正文 16px", shortLabel: "16px", size: "16px" },
	{ label: "偏大 18px", shortLabel: "18px", size: "18px" },
	{ label: "大号 20px", shortLabel: "20px", size: "20px" },
	{ label: "加大 24px", shortLabel: "24px", size: "24px" },
	{ label: "特大 28px", shortLabel: "28px", size: "28px" },
];

export const TEXT_COLOR_PRESETS: ReadonlyArray<{
	label: string;
	color: string;
}> = [
	{ label: "珊瑚红", color: "#e11d48" },
	{ label: "暖橙", color: "#ea580c" },
	{ label: "琥珀金", color: "#d97706" },
	{ label: "森绿", color: "#16a34a" },
	{ label: "天青", color: "#0284c7" },
	{ label: "靛蓝", color: "#4f46e5" },
	{ label: "丁香紫", color: "#9333ea" },
	{ label: "樱花粉", color: "#db2777" },
	{ label: "石板灰", color: "#64748b" },
];

const WIDTH_TOKEN_RE = /(?:^|\s)w-(\d{1,3})%(?=\s|$)/g;
const ALIGN_TOKEN_RE = /(?:^|\s)align-(left|center|right)(?=\s|$)/g;
const IMAGE_MD_RE = /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g;
const SAFE_FONT_SIZE_RE = /^\d{1,3}(?:\.\d{1,2})?(?:px|rem|em)$/;
const SAFE_COLOR_RE =
	/^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla|oklch)\([0-9a-z.,%\s/-]+\)|[a-z]{3,20})$/i;
const SAFE_URL_RE = /^(?:https?:\/\/|\/(?!\/)|blob:|data:image\/)/i;

function clampSelection(
	value: string,
	start: number,
	end: number,
): [number, number] {
	const len = value.length;
	const a = Math.max(0, Math.min(len, start));
	const b = Math.max(a, Math.min(len, end));
	return [a, b];
}

export function applyWrapSyntax(
	value: string,
	selectionStart: number,
	selectionEnd: number,
	before: string,
	after: string,
	placeholder = "文本",
): TextEditResult {
	const [start, end] = clampSelection(value, selectionStart, selectionEnd);
	const selected = value.slice(start, end);

	// Toggle off if the selection itself has before/after or is wrapped right outside
	if (
		selected.startsWith(before) &&
		selected.endsWith(after) &&
		selected.length >= before.length + after.length
	) {
		const inner = selected.slice(before.length, selected.length - after.length);
		const next = value.slice(0, start) + inner + value.slice(end);
		return {
			value: next,
			selectionStart: start,
			selectionEnd: start + inner.length,
		};
	}

	if (
		start >= before.length &&
		value.slice(start - before.length, start) === before &&
		value.slice(end, end + after.length) === after
	) {
		const next =
			value.slice(0, start - before.length) +
			selected +
			value.slice(end + after.length);
		return {
			value: next,
			selectionStart: start - before.length,
			selectionEnd: end - before.length,
		};
	}

	const content = selected || placeholder;
	const inserted = `${before}${content}${after}`;
	const next = value.slice(0, start) + inserted + value.slice(end);
	return {
		value: next,
		selectionStart: start + before.length,
		selectionEnd: start + before.length + content.length,
	};
}

export function applyLinePrefix(
	value: string,
	selectionStart: number,
	selectionEnd: number,
	prefix: string,
	placeholder = "内容",
): TextEditResult {
	const [start, end] = clampSelection(value, selectionStart, selectionEnd);
	const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
	const rawLineEnd = value.indexOf("\n", end);
	const lineEnd = rawLineEnd === -1 ? value.length : rawLineEnd;
	const block = value.slice(lineStart, lineEnd);

	if (!block.trim() && start === end) {
		const inserted = `${prefix}${placeholder}`;
		const next = value.slice(0, lineStart) + inserted + value.slice(lineEnd);
		return {
			value: next,
			selectionStart: lineStart + prefix.length,
			selectionEnd: lineStart + inserted.length,
		};
	}

	const lines = block.split("\n");
	const allPrefixed = lines.every(
		(line) => !line.trim() || line.startsWith(prefix),
	);
	const updated = lines
		.map((line) => {
			if (!line.trim()) return line;
			return allPrefixed ? line.slice(prefix.length) : `${prefix}${line}`;
		})
		.join("\n");

	const next = value.slice(0, lineStart) + updated + value.slice(lineEnd);
	return {
		value: next,
		selectionStart: lineStart,
		selectionEnd: lineStart + updated.length,
	};
}

function parseStyleDeclarations(styleAttr: string): Map<string, string> {
	const map = new Map<string, string>();
	for (const decl of styleAttr.split(";")) {
		const colon = decl.indexOf(":");
		if (colon <= 0) continue;
		const prop = decl.slice(0, colon).trim().toLowerCase();
		const val = decl.slice(colon + 1).trim();
		if (prop && val) map.set(prop, val);
	}
	return map;
}

function serializeAllowedSpanStyle(map: Map<string, string>): string {
	const out: string[] = [];
	const fontSize = map.get("font-size");
	if (fontSize && SAFE_FONT_SIZE_RE.test(fontSize)) {
		out.push(`font-size: ${fontSize}`);
	}
	const color = map.get("color");
	if (color && SAFE_COLOR_RE.test(color)) {
		out.push(`color: ${color}`);
	}
	return out.join("; ");
}

export function applyInlineSpanStyle(
	value: string,
	selectionStart: number,
	selectionEnd: number,
	patch: { fontSize?: string | null; color?: string | null },
	placeholder = "样式文字",
): TextEditResult {
	const [start, end] = clampSelection(value, selectionStart, selectionEnd);
	const selected = value.slice(start, end);

	// Check if selection IS an exact <span style="...">...</span>
	const fullSpanMatch = selected.match(
		/^<span\s+style="([^"]*)"\s*>([\s\S]*)<\/span>$/i,
	);
	if (fullSpanMatch) {
		const styles = parseStyleDeclarations(fullSpanMatch[1]);
		if (patch.fontSize !== undefined) {
			if (patch.fontSize === null || patch.fontSize === "") {
				styles.delete("font-size");
			} else if (SAFE_FONT_SIZE_RE.test(patch.fontSize.trim())) {
				styles.set("font-size", patch.fontSize.trim());
			}
		}
		if (patch.color !== undefined) {
			if (patch.color === null || patch.color === "") {
				styles.delete("color");
			} else if (SAFE_COLOR_RE.test(patch.color.trim())) {
				styles.set("color", patch.color.trim());
			}
		}
		const styleStr = serializeAllowedSpanStyle(styles);
		const inner = fullSpanMatch[2];
		const replacement = styleStr
			? `<span style="${styleStr}">${inner}</span>`
			: inner;
		const next = value.slice(0, start) + replacement + value.slice(end);
		return {
			value: next,
			selectionStart: start,
			selectionEnd: start + replacement.length,
		};
	}

	// Check if cursor/selection sits immediately inside `<span style="...">` ... `</span>`
	const beforeSlice = value.slice(0, start);
	const afterSlice = value.slice(end);
	const enclosingOpen = beforeSlice.match(/<span\s+style="([^"]*)"\s*>$/i);
	const enclosingClose = afterSlice.match(/^<\/span>/i);
	if (enclosingOpen && enclosingClose) {
		const openTag = enclosingOpen[0];
		const styles = parseStyleDeclarations(enclosingOpen[1]);
		if (patch.fontSize !== undefined) {
			if (patch.fontSize === null || patch.fontSize === "") {
				styles.delete("font-size");
			} else if (SAFE_FONT_SIZE_RE.test(patch.fontSize.trim())) {
				styles.set("font-size", patch.fontSize.trim());
			}
		}
		if (patch.color !== undefined) {
			if (patch.color === null || patch.color === "") {
				styles.delete("color");
			} else if (SAFE_COLOR_RE.test(patch.color.trim())) {
				styles.set("color", patch.color.trim());
			}
		}
		const styleStr = serializeAllowedSpanStyle(styles);
		const prefixHead = beforeSlice.slice(
			0,
			beforeSlice.length - openTag.length,
		);
		const suffixTail = afterSlice.slice(enclosingClose[0].length);
		const newOpen = styleStr ? `<span style="${styleStr}">` : "";
		const newClose = styleStr ? "</span>" : "";
		const next = `${prefixHead}${newOpen}${selected}${newClose}${suffixTail}`;
		const nextStart = prefixHead.length + newOpen.length;
		return {
			value: next,
			selectionStart: nextStart,
			selectionEnd: nextStart + selected.length,
		};
	}

	// Fresh span wrap
	const styles = new Map<string, string>();
	if (patch.fontSize && SAFE_FONT_SIZE_RE.test(patch.fontSize.trim())) {
		styles.set("font-size", patch.fontSize.trim());
	}
	if (patch.color && SAFE_COLOR_RE.test(patch.color.trim())) {
		styles.set("color", patch.color.trim());
	}
	const styleStr = serializeAllowedSpanStyle(styles);
	if (!styleStr) {
		return { value, selectionStart: start, selectionEnd: end };
	}

	const content = selected || placeholder;
	const openTag = `<span style="${styleStr}">`;
	const closeTag = "</span>";
	const next = `${beforeSlice}${openTag}${content}${closeTag}${afterSlice}`;
	return {
		value: next,
		selectionStart: start + openTag.length,
		selectionEnd: start + openTag.length + content.length,
	};
}

export function parseAltTokens(rawAlt: string): {
	alt: string;
	width: number;
	align: ImageAlign;
} {
	let width = 100;
	let hasWidth = false;
	let align: ImageAlign = "center";
	let hasAlign = false;
	const withoutWidth = rawAlt.replace(WIDTH_TOKEN_RE, (token, raw) => {
		const n = Number.parseInt(raw, 10);
		if (!hasWidth && n >= 1 && n <= 100) {
			hasWidth = true;
			width = n;
			return "";
		}
		return token;
	});
	const cleaned = withoutWidth.replace(ALIGN_TOKEN_RE, (token, raw) => {
		if (!hasAlign && (raw === "left" || raw === "center" || raw === "right")) {
			hasAlign = true;
			align = raw;
			return "";
		}
		return token;
	});
	return {
		alt: cleaned.replace(/\s{2,}/g, " ").trim(),
		width,
		align,
	};
}

export function formatMarkdownImage(opts: {
	src: string;
	alt?: string;
	width?: number;
	align?: ImageAlign;
	title?: string;
}): string {
	const parts: string[] = [];
	const cleanAlt = (opts.alt ?? "").replace(/[\]]/g, "").trim();
	if (cleanAlt) parts.push(cleanAlt);

	const width =
		typeof opts.width === "number"
			? Math.max(10, Math.min(100, Math.round(opts.width)))
			: 100;
	if (width < 100) {
		parts.push(`w-${width}%`);
	}

	const align = opts.align ?? "center";
	if (align === "left" || align === "right") {
		parts.push(`align-${align}`);
	}

	const altCombined = parts.join(" ");
	const cleanTitle = (opts.title ?? "").replace(/"/g, "'").trim();
	const titleSuffix = cleanTitle ? ` "${cleanTitle}"` : "";
	return `![${altCombined}](${opts.src}${titleSuffix})`;
}

export function insertMarkdownImageAtCursor(
	value: string,
	selectionStart: number,
	selectionEnd: number,
	opts: {
		src: string;
		alt?: string;
		width?: number;
		align?: ImageAlign;
		title?: string;
	},
): TextEditResult {
	const [start, end] = clampSelection(value, selectionStart, selectionEnd);
	const imgMd = formatMarkdownImage(opts);
	const before = value.slice(0, start);
	const after = value.slice(end);
	const lead =
		before.length === 0
			? ""
			: before.endsWith("\n\n")
				? ""
				: before.endsWith("\n")
					? "\n"
					: "\n\n";
	const trail =
		after.length === 0
			? "\n"
			: after.startsWith("\n\n")
				? ""
				: after.startsWith("\n")
					? "\n"
					: "\n\n";

	const inserted = `${lead}${imgMd}${trail}`;
	const next = `${before}${inserted}${after}`;
	const cursorPos = before.length + inserted.length;
	return {
		value: next,
		selectionStart: cursorPos,
		selectionEnd: cursorPos,
	};
}

export function extractMarkdownImages(value: string): EmbeddedMarkdownImage[] {
	const paragraphs = value.split(/\n{2,}/);
	const paraRanges: Array<{ start: number; end: number }> = [];
	let offset = 0;
	for (let i = 0; i < paragraphs.length; i++) {
		const text = paragraphs[i];
		const start = offset;
		const end = start + text.length;
		paraRanges.push({ start, end });
		if (i < paragraphs.length - 1) {
			const gapMatch = value.slice(end).match(/^\n+/);
			offset = end + (gapMatch ? gapMatch[0].length : 2);
		}
	}

	const items: EmbeddedMarkdownImage[] = [];
	for (const match of value.matchAll(IMAGE_MD_RE)) {
		const rawMatch = match[0];
		const index = match.index ?? 0;
		const parsed = parseAltTokens(match[1] ?? "");
		const paraIdx = paraRanges.findIndex(
			(r) => index >= r.start && index <= r.end,
		);
		items.push({
			index,
			rawLength: rawMatch.length,
			rawMatch,
			src: match[2] ?? "",
			alt: parsed.alt,
			width: parsed.width,
			align: parsed.align,
			title: match[3] ?? "",
			paragraphIndex: paraIdx >= 0 ? paraIdx : 0,
			totalParagraphs: paragraphs.length,
		});
	}
	return items;
}

export function updateMarkdownImageAt(
	value: string,
	item: EmbeddedMarkdownImage,
	patch: {
		alt?: string;
		width?: number;
		align?: ImageAlign;
		title?: string;
	},
): string {
	const replacement = formatMarkdownImage({
		src: item.src,
		alt: patch.alt ?? item.alt,
		width: patch.width ?? item.width,
		align: patch.align ?? item.align,
		title: patch.title ?? item.title,
	});
	return (
		value.slice(0, item.index) +
		replacement +
		value.slice(item.index + item.rawLength)
	);
}

export function removeMarkdownImageAt(
	value: string,
	item: EmbeddedMarkdownImage,
): string {
	const next =
		value.slice(0, item.index) + value.slice(item.index + item.rawLength);
	return next.replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "");
}

export function moveMarkdownImageParagraph(
	value: string,
	item: EmbeddedMarkdownImage,
	direction: "up" | "down",
): string {
	const paragraphs = value
		.split(/\n{2,}/)
		.map((p) => p.trim())
		.filter((p) => p.length > 0);
	const currentIdx = paragraphs.findIndex((p) => p.includes(item.rawMatch));
	if (currentIdx === -1) return value;

	const currentPara = paragraphs[currentIdx];
	// If the image shares a paragraph with other lines, split it into its own block before moving
	if (currentPara !== item.rawMatch) {
		const cleanedCurrent = currentPara
			.replace(item.rawMatch, "")
			.replace(/\n{2,}/g, "\n")
			.trim();
		const targetInsertIdx =
			direction === "up"
				? currentIdx
				: Math.min(paragraphs.length, currentIdx + 1);
		const nextParas = [...paragraphs];
		if (cleanedCurrent) {
			nextParas[currentIdx] = cleanedCurrent;
			nextParas.splice(targetInsertIdx, 0, item.rawMatch);
		} else {
			nextParas[currentIdx] = item.rawMatch;
		}
		return nextParas.join("\n\n");
	}

	const swapIdx = direction === "up" ? currentIdx - 1 : currentIdx + 1;
	if (swapIdx < 0 || swapIdx >= paragraphs.length) return value;
	const nextParas = [...paragraphs];
	[nextParas[currentIdx], nextParas[swapIdx]] = [
		nextParas[swapIdx],
		nextParas[currentIdx],
	];
	return nextParas.join("\n\n");
}

function escapeHtml(raw: string): string {
	return raw
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function escapeAttr(raw: string): string {
	return raw
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function renderInlineSegment(
	raw: string,
	resolveImageSrc: (src: string) => string,
): string {
	// Tokenize safe <span style="...">...</span> segments before escaping the rest
	const spanTokens: string[] = [];
	const withPlaceholders = raw.replace(
		/<span\s+style="([^"]*)"\s*>([\s\S]*?)<\/span>/gi,
		(_full, styleAttr: string, inner: string) => {
			const cleanStyle = serializeAllowedSpanStyle(
				parseStyleDeclarations(styleAttr),
			);
			const renderedInner = renderInlineMarkdownOnly(inner, resolveImageSrc);
			const html = cleanStyle
				? `<span style="${escapeAttr(cleanStyle)}">${renderedInner}</span>`
				: renderedInner;
			const id = `\u0000SPAN${spanTokens.length}\u0000`;
			spanTokens.push(html);
			return id;
		},
	);

	let rendered = renderInlineMarkdownOnly(withPlaceholders, resolveImageSrc);
	for (let i = 0; i < spanTokens.length; i++) {
		rendered = rendered.replace(`\u0000SPAN${i}\u0000`, spanTokens[i]);
	}
	return rendered;
}

function renderInlineMarkdownOnly(
	raw: string,
	resolveImageSrc: (src: string) => string,
): string {
	let out = escapeHtml(raw);

	// Inline images
	out = out.replace(
		/!\[([^\]]*)\]\(([^\s)]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
		(_m, rawAlt: string, src: string, title?: string) => {
			const cleanSrc = resolveImageSrc(src);
			if (!SAFE_URL_RE.test(cleanSrc)) return escapeHtml(src);
			const parsed = parseAltTokens(rawAlt);
			const styles: string[] = [];
			if (parsed.width < 100) styles.push(`width: ${parsed.width}%`);
			if (parsed.align === "left") {
				styles.push("display: block; margin-left: 0; margin-right: auto");
			} else if (parsed.align === "right") {
				styles.push("display: block; margin-left: auto; margin-right: 0");
			} else if (parsed.width < 100) {
				styles.push("display: block; margin-inline: auto");
			}
			const styleAttr =
				styles.length > 0 ? ` style="${escapeAttr(styles.join("; "))}"` : "";
			const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
			return `<img src="${escapeAttr(cleanSrc)}" alt="${escapeAttr(parsed.alt)}"${titleAttr}${styleAttr} />`;
		},
	);

	// Links [text](url)
	out = out.replace(
		/\[([^\]]+)\]\(([^\s)]+)\)/g,
		(_m, text: string, href: string) => {
			if (!SAFE_URL_RE.test(href)) return text;
			return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
		},
	);

	// Bold, Italic, Strike, Highlight, Inline Code
	out = out
		.replace(/`([^`]+)`/g, "<code>$1</code>")
		.replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>")
		.replace(/~~([\s\S]+?)~~/g, "<del>$1</del>")
		.replace(/==([\s\S]+?)==/g, "<mark>$1</mark>")
		.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");

	return out;
}

export function renderRichPreviewHtml(
	value: string,
	resolveImageSrc: (src: string) => string = (s) => s,
): string {
	const trimmed = value.trim();
	if (!trimmed) return "";

	const blocks = trimmed.split(/\n{2,}/);
	const htmlParts: string[] = [];

	for (const block of blocks) {
		const singleImg = block
			.trim()
			.match(/^!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)$/);
		if (singleImg) {
			const cleanSrc = resolveImageSrc(singleImg[2] ?? "");
			if (SAFE_URL_RE.test(cleanSrc)) {
				const parsed = parseAltTokens(singleImg[1] ?? "");
				const title = (singleImg[3] ?? "").trim();
				const styles: string[] = [];
				if (parsed.width < 100) styles.push(`width: ${parsed.width}%`);
				if (parsed.align === "left") {
					styles.push("display: block; margin-left: 0; margin-right: auto");
				} else if (parsed.align === "right") {
					styles.push("display: block; margin-left: auto; margin-right: 0");
				} else {
					styles.push("display: block; margin-inline: auto");
				}
				const figClass =
					parsed.align === "left" || parsed.align === "right"
						? `markdown-image-figure markdown-image-figure--${parsed.align}`
						: "markdown-image-figure";
				const captionHtml = title
					? `<figcaption class="markdown-image-caption">${escapeHtml(title)}</figcaption>`
					: "";
				htmlParts.push(
					`<figure class="${figClass}"><img src="${escapeAttr(cleanSrc)}" alt="${escapeAttr(parsed.alt)}" style="${escapeAttr(styles.join("; "))}" />${captionHtml}</figure>`,
				);
				continue;
			}
		}

		const headingMatch = block.match(/^(#{1,4})\s+([\s\S]+)$/);
		if (headingMatch) {
			const level = headingMatch[1].length;
			htmlParts.push(
				`<h${level}>${renderInlineSegment(headingMatch[2], resolveImageSrc)}</h${level}>`,
			);
			continue;
		}

		const lines = block.split("\n");
		if (lines.every((l) => l.startsWith(">"))) {
			const inner = lines
				.map((l) => l.replace(/^>\s?/, ""))
				.map((l) => renderInlineSegment(l, resolveImageSrc))
				.join("<br />");
			htmlParts.push(`<blockquote><p>${inner}</p></blockquote>`);
			continue;
		}

		if (lines.every((l) => /^[-*]\s+/.test(l))) {
			const lis = lines
				.map((l) => l.replace(/^[-*]\s+/, ""))
				.map((l) => `<li>${renderInlineSegment(l, resolveImageSrc)}</li>`)
				.join("");
			htmlParts.push(`<ul>${lis}</ul>`);
			continue;
		}

		htmlParts.push(
			`<p>${lines.map((l) => renderInlineSegment(l, resolveImageSrc)).join("<br />")}</p>`,
		);
	}

	return htmlParts.join("\n");
}
