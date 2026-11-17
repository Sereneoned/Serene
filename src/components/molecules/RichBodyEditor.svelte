<script lang="ts">
import Icon from "@iconify/svelte";
import {
	applyInlineSpanStyle,
	applyLinePrefix,
	applyWrapSyntax,
	type EmbeddedMarkdownImage,
	extractMarkdownImages,
	FONT_SIZE_PRESETS,
	type ImageAlign,
	insertMarkdownImageAtCursor,
	moveMarkdownImageParagraph,
	removeMarkdownImageAt,
	renderRichPreviewHtml,
	TEXT_COLOR_PRESETS,
	type TextEditResult,
	updateMarkdownImageAt,
} from "@utils/rich-text-editor";
import { showSnackbar } from "@utils/snackbar";
import { url } from "@utils/url-utils";
import { tick } from "svelte";

export interface UploadedInlineImage {
	src: string;
	previewUrl: string;
	alt?: string;
}

let {
	value = $bindable(""),
	rows = 6,
	placeholder = "写下此刻的想法、碎碎念或记录（支持字号、加粗、字体颜色与正文任意位置插图）...",
	compact = false,
	previewUrlMap = {} as Record<string, string>,
	onUploadImages,
	onMoveToGallery,
	defaultViewMode,
}: {
	value?: string;
	rows?: number;
	placeholder?: string;
	compact?: boolean;
	previewUrlMap?: Record<string, string>;
	onUploadImages?: (files: FileList | File[]) => Promise<UploadedInlineImage[]>;
	onMoveToGallery?: (item: {
		src: string;
		alt: string;
		previewUrl: string;
	}) => void;
	defaultViewMode?: "edit" | "split" | "preview";
} = $props();

let textareaEl = $state<HTMLTextAreaElement | null>(null);
let lastSelectionStart = $state(0);
let lastSelectionEnd = $state(0);

let viewModeOverride = $state<"edit" | "split" | "preview" | null>(null);
const viewMode = $derived(
	viewModeOverride ?? defaultViewMode ?? (compact ? "edit" : "split"),
);
let activeFontSize = $state("18px");
let activeColor = $state("#e11d48");
let showColorPopover = $state(false);
let showExternalImagePopover = $state(false);
let externalImageUrl = $state("");
let externalImageAlt = $state("");
let defaultImageWidth = $state(70);
let defaultImageAlign = $state<ImageAlign>("center");
let uploadingInline = $state(false);

function rememberSelection() {
	if (!textareaEl) return;
	lastSelectionStart = textareaEl.selectionStart ?? value.length;
	lastSelectionEnd = textareaEl.selectionEnd ?? value.length;
}

function getSelectionRange(): [number, number] {
	if (textareaEl && document.activeElement === textareaEl) {
		return [
			textareaEl.selectionStart ?? value.length,
			textareaEl.selectionEnd ?? value.length,
		];
	}
	return [
		Math.min(lastSelectionStart, value.length),
		Math.min(lastSelectionEnd, value.length),
	];
}

async function applyEditResult(result: TextEditResult) {
	value = result.value;
	lastSelectionStart = result.selectionStart;
	lastSelectionEnd = result.selectionEnd;
	await tick();
	if (textareaEl) {
		textareaEl.focus();
		textareaEl.setSelectionRange(result.selectionStart, result.selectionEnd);
	}
}

async function runWrap(before: string, after: string, hint: string) {
	const [start, end] = getSelectionRange();
	await applyEditResult(
		applyWrapSyntax(value, start, end, before, after, hint),
	);
}

async function runPrefix(prefix: string, hint: string) {
	const [start, end] = getSelectionRange();
	await applyEditResult(applyLinePrefix(value, start, end, prefix, hint));
}

async function applyFontSize(size: string | null) {
	if (size) activeFontSize = size;
	const [start, end] = getSelectionRange();
	await applyEditResult(
		applyInlineSpanStyle(value, start, end, { fontSize: size }, "调整字号文字"),
	);
}

async function applyTextColor(color: string | null) {
	if (color) activeColor = color;
	showColorPopover = false;
	const [start, end] = getSelectionRange();
	await applyEditResult(
		applyInlineSpanStyle(value, start, end, { color }, "彩色文字"),
	);
}

async function insertLink() {
	const [start, end] = getSelectionRange();
	const selected = value.slice(start, end);
	const href = window.prompt("请输入链接 URL：", "https://");
	if (!href?.trim()) return;
	const label = selected || "链接文字";
	const md = `[${label}](${href.trim()})`;
	const next = value.slice(0, start) + md + value.slice(end);
	await applyEditResult({
		value: next,
		selectionStart: start + 1,
		selectionEnd: start + 1 + label.length,
	});
}

async function handleInlineUpload(files: FileList | File[]) {
	if (!onUploadImages) return;
	uploadingInline = true;
	try {
		const uploaded = await onUploadImages(files);
		if (uploaded.length === 0) return;
		let [start, end] = getSelectionRange();
		let nextVal = value;
		for (const item of uploaded) {
			const res = insertMarkdownImageAtCursor(nextVal, start, end, {
				src: item.src,
				alt: item.alt || "",
				width: defaultImageWidth,
				align: defaultImageAlign,
			});
			nextVal = res.value;
			start = res.selectionStart;
			end = res.selectionEnd;
		}
		await applyEditResult({
			value: nextVal,
			selectionStart: start,
			selectionEnd: end,
		});
		showSnackbar(`已将 ${uploaded.length} 张图片插入到正文光标处`);
	} finally {
		uploadingInline = false;
	}
}

async function insertExternalImage() {
	const cleanUrl = externalImageUrl.trim();
	if (!cleanUrl) return;
	const [start, end] = getSelectionRange();
	const res = insertMarkdownImageAtCursor(value, start, end, {
		src: cleanUrl,
		alt: externalImageAlt.trim(),
		width: defaultImageWidth,
		align: defaultImageAlign,
	});
	externalImageUrl = "";
	externalImageAlt = "";
	showExternalImagePopover = false;
	await applyEditResult(res);
}

async function handleKeydown(event: KeyboardEvent) {
	if (!(event.ctrlKey || event.metaKey)) return;
	const key = event.key.toLowerCase();
	if (key === "b") {
		event.preventDefault();
		await runWrap("**", "**", "加粗文字");
	} else if (key === "i") {
		event.preventDefault();
		await runWrap("*", "*", "斜体文字");
	}
}

async function handlePaste(event: ClipboardEvent) {
	if (!onUploadImages || !event.clipboardData?.files?.length) return;
	const imgs = Array.from(event.clipboardData.files).filter((f) =>
		f.type.startsWith("image/"),
	);
	if (imgs.length === 0) return;
	event.preventDefault();
	rememberSelection();
	await handleInlineUpload(imgs);
}

async function handleDrop(event: DragEvent) {
	if (!onUploadImages || !event.dataTransfer?.files?.length) return;
	const imgs = Array.from(event.dataTransfer.files).filter((f) =>
		f.type.startsWith("image/"),
	);
	if (imgs.length === 0) return;
	event.preventDefault();
	await handleInlineUpload(imgs);
}

function resolvePreviewSrc(src: string): string {
	if (previewUrlMap[src]) return previewUrlMap[src];
	if (src.startsWith("/") && !src.startsWith("//")) return url(src);
	return src;
}

const embeddedImages = $derived(extractMarkdownImages(value));
const previewHtml = $derived(
	viewMode !== "edit" ? renderRichPreviewHtml(value, resolvePreviewSrc) : "",
);

function updateImage(
	img: EmbeddedMarkdownImage,
	patch: { alt?: string; width?: number; align?: ImageAlign },
) {
	value = updateMarkdownImageAt(value, img, patch);
}

function moveImage(img: EmbeddedMarkdownImage, direction: "up" | "down") {
	value = moveMarkdownImageParagraph(value, img, direction);
}

async function moveImageToCursor(img: EmbeddedMarkdownImage) {
	const [start, end] = getSelectionRange();
	const stripped = removeMarkdownImageAt(value, img);
	const shift =
		start > img.index + img.rawLength ? value.length - stripped.length : 0;
	const clampedStart = Math.max(0, Math.min(start - shift, stripped.length));
	const clampedEnd = Math.max(
		clampedStart,
		Math.min(end - shift, stripped.length),
	);
	const res = insertMarkdownImageAtCursor(stripped, clampedStart, clampedEnd, {
		src: img.src,
		alt: img.alt,
		width: img.width,
		align: img.align,
		title: img.title,
	});
	await applyEditResult(res);
}

function demoteImageToGallery(img: EmbeddedMarkdownImage) {
	const previewUrl = resolvePreviewSrc(img.src);
	value = removeMarkdownImageAt(value, img);
	onMoveToGallery?.({
		src: img.src,
		alt: img.alt,
		previewUrl,
	});
}
</script>

<div class="rich-editor" class:rich-editor--compact={compact}>
	<div class="rich-editor__toolbar" role="toolbar" aria-label="动态正文格式与插图工具栏">
		<div class="rich-editor__group">
			<button
				type="button"
				class="rich-editor__btn"
				title="加粗 (Ctrl+B)"
				aria-label="加粗"
				onclick={() => void runWrap("**", "**", "加粗文字")}
			>
				<Icon icon="material-symbols:format-bold-rounded" aria-hidden="true" />
				<span>加粗</span>
			</button>
			<button
				type="button"
				class="rich-editor__btn"
				title="斜体 (Ctrl+I)"
				aria-label="斜体"
				onclick={() => void runWrap("*", "*", "斜体文字")}
			>
				<Icon icon="material-symbols:format-italic-rounded" aria-hidden="true" />
			</button>
			<button
				type="button"
				class="rich-editor__btn"
				title="删除线"
				aria-label="删除线"
				onclick={() => void runWrap("~~", "~~", "删除文字")}
			>
				<Icon icon="material-symbols:format-strikethrough-rounded" aria-hidden="true" />
			</button>
			<button
				type="button"
				class="rich-editor__btn"
				title="高亮重点"
				aria-label="高亮"
				onclick={() => void runWrap("==", "==", "高亮内容")}
			>
				<Icon icon="material-symbols:ink-highlighter-outline-rounded" aria-hidden="true" />
			</button>
			<button
				type="button"
				class="rich-editor__btn"
				title="引用段落"
				aria-label="引用"
				onclick={() => void runPrefix("> ", "引用一段话")}
			>
				<Icon icon="material-symbols:format-quote-rounded" aria-hidden="true" />
			</button>
			<button
				type="button"
				class="rich-editor__btn"
				title="插入链接"
				aria-label="插入链接"
				onclick={() => void insertLink()}
			>
				<Icon icon="material-symbols:link-rounded" aria-hidden="true" />
			</button>
		</div>

		<span class="rich-editor__sep" aria-hidden="true"></span>

		<div class="rich-editor__group">
			<label class="rich-editor__select-wrap" title="选择选中文字或光标处的字号">
				<Icon icon="material-symbols:format-size-rounded" aria-hidden="true" />
				<select
					class="rich-editor__select"
					aria-label="字号"
					value=""
					onchange={(e) => {
						const v = (e.currentTarget as HTMLSelectElement).value;
						if (v === "__reset__") {
							void applyFontSize(null);
						} else if (v === "h2") {
							void runPrefix("## ", "大标题");
						} else if (v === "h3") {
							void runPrefix("### ", "小标题");
						} else if (v) {
							void applyFontSize(v);
						}
						(e.currentTarget as HTMLSelectElement).value = "";
					}}
				>
					<option value="" disabled>字号 ({activeFontSize})</option>
					{#each FONT_SIZE_PRESETS as preset (preset.size)}
						<option value={preset.size}>{preset.label}</option>
					{/each}
					<option value="h2">标题 H2</option>
					<option value="h3">小标题 H3</option>
					<option value="__reset__">恢复默认字号</option>
				</select>
			</label>

			<div class="rich-editor__color-wrap">
				<button
					type="button"
					class="rich-editor__btn"
					title="选择字体颜色"
					aria-label="字体颜色"
					aria-expanded={showColorPopover}
					onclick={() => {
						showColorPopover = !showColorPopover;
						showExternalImagePopover = false;
					}}
				>
					<Icon icon="material-symbols:format-color-text-rounded" aria-hidden="true" />
					<span>颜色</span>
					<span class="rich-editor__swatch-dot" style="background-color: {activeColor};"></span>
				</button>

				{#if showColorPopover}
					<div class="rich-editor__popover" role="dialog" aria-label="选择字体颜色">
						<div class="rich-editor__palette">
							{#each TEXT_COLOR_PRESETS as swatch (swatch.color)}
								<button
									type="button"
									class="rich-editor__palette-dot"
									style="background-color: {swatch.color};"
									title={swatch.label}
									aria-label={swatch.label}
									onclick={() => void applyTextColor(swatch.color)}
								></button>
							{/each}
						</div>
						<div class="rich-editor__color-custom">
							<label class="rich-editor__color-picker">
								<Icon icon="material-symbols:palette-outline" aria-hidden="true" />
								<span>自定义色：</span>
								<input
									type="color"
									aria-label="自定义字体颜色"
									value={activeColor}
									onchange={(e) =>
										void applyTextColor(
											(e.currentTarget as HTMLInputElement).value,
										)}
								/>
							</label>
							<button
								type="button"
								class="rich-editor__mini-btn"
								onclick={() => void applyTextColor(null)}
							>
								恢复默认
							</button>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<span class="rich-editor__sep" aria-hidden="true"></span>

		<div class="rich-editor__group">
			{#if onUploadImages}
				<label class="rich-editor__upload-btn m3-state-layer" title="上传图片并插入到正文当前光标位置">
					<Icon icon="material-symbols:add-photo-alternate-outline-rounded" aria-hidden="true" />
					<span>{uploadingInline ? "压缩中..." : "插图到光标处"}</span>
					<input
						type="file"
						accept="image/*"
						multiple
						hidden
						disabled={uploadingInline}
						onchange={(e) => {
							const files = (e.currentTarget as HTMLInputElement).files;
							if (files) void handleInlineUpload(files);
							(e.currentTarget as HTMLInputElement).value = "";
						}}
					/>
				</label>
			{/if}

			<div class="rich-editor__color-wrap">
				<button
					type="button"
					class="rich-editor__btn"
					title="插入网络图片 URL 并设定宽度/对齐"
					aria-expanded={showExternalImagePopover}
					onclick={() => {
						showExternalImagePopover = !showExternalImagePopover;
						showColorPopover = false;
					}}
				>
					<Icon icon="material-symbols:photo-library-outline-rounded" aria-hidden="true" />
					<span>外链图片</span>
				</button>

				{#if showExternalImagePopover}
					<div class="rich-editor__popover rich-editor__popover--wide" role="dialog" aria-label="插入网络图片">
						<input
							type="url"
							class="rich-editor__pop-input"
							placeholder="图片 URL (https://...)"
							bind:value={externalImageUrl}
						/>
						<input
							type="text"
							class="rich-editor__pop-input"
							placeholder="图片描述 alt（可选）"
							bind:value={externalImageAlt}
						/>
						<div class="rich-editor__pop-row">
							<span>默认宽 {defaultImageWidth}%</span>
							<input
								type="range"
								min="20"
								max="100"
								step="5"
								bind:value={defaultImageWidth}
							/>
						</div>
						<div class="rich-editor__pop-row">
							<span>对齐：</span>
							<button
								type="button"
								class="rich-editor__mini-btn"
								class:rich-editor__mini-btn--active={defaultImageAlign === "left"}
								onclick={() => (defaultImageAlign = "left")}
							>
								左
							</button>
							<button
								type="button"
								class="rich-editor__mini-btn"
								class:rich-editor__mini-btn--active={defaultImageAlign === "center"}
								onclick={() => (defaultImageAlign = "center")}
							>
								中
							</button>
							<button
								type="button"
								class="rich-editor__mini-btn"
								class:rich-editor__mini-btn--active={defaultImageAlign === "right"}
								onclick={() => (defaultImageAlign = "right")}
							>
								右
							</button>
							<button
								type="button"
								class="rich-editor__mini-btn rich-editor__mini-btn--primary"
								onclick={() => void insertExternalImage()}
							>
								插入正文
							</button>
						</div>
					</div>
				{/if}
			</div>

			<div class="rich-editor__view-tabs" role="group" aria-label="编辑与预览切换">
				<button
					type="button"
					class="rich-editor__view-tab"
					class:rich-editor__view-tab--active={viewMode === "edit"}
					onclick={() => (viewModeOverride = "edit")}
				>
					仅编辑
				</button>
				<button
					type="button"
					class="rich-editor__view-tab"
					class:rich-editor__view-tab--active={viewMode === "split"}
					onclick={() => (viewModeOverride = "split")}
				>
					实时预览
				</button>
			</div>
		</div>
	</div>

	<div class="rich-editor__workspace" class:rich-editor__workspace--split={viewMode === "split"}>
		{#if viewMode !== "preview"}
			<textarea
				bind:this={textareaEl}
				class="rich-editor__textarea"
				{rows}
				{placeholder}
				bind:value
				onclick={rememberSelection}
				onkeyup={rememberSelection}
				onselect={rememberSelection}
				onblur={rememberSelection}
				onkeydown={handleKeydown}
				onpaste={handlePaste}
				ondrop={handleDrop}
				ondragover={(e) => {
					if (onUploadImages) e.preventDefault();
				}}
			></textarea>
		{/if}

		{#if viewMode !== "edit"}
			<div class="rich-editor__preview-pane">
				<div class="rich-editor__preview-label">
					<Icon icon="material-symbols:visibility-outline-rounded" aria-hidden="true" />
					<span>所见即所得实时预览</span>
				</div>
				{#if previewHtml}
					<div class="rich-editor__preview custom-md">
						{@html previewHtml}
					</div>
				{:else}
					<p class="rich-editor__preview-empty">输入文字或插入图片后，这里会实时显示发布效果……</p>
				{/if}
			</div>
		{/if}
	</div>

	{#if embeddedImages.length > 0}
		<div class="rich-editor__images">
			<div class="rich-editor__images-head">
				<span>正文已插入图片 ({embeddedImages.length}) · 可自由拖动调整尺寸、对齐与段落位置</span>
			</div>
			<div class="rich-editor__images-list">
				{#each embeddedImages as img, idx (`${img.src}-${img.index}`)}
					<div class="rich-editor__img-row">
						<img src={resolvePreviewSrc(img.src)} alt={img.alt || "embedded"} class="rich-editor__img-thumb" />
						<div class="rich-editor__img-controls">
							<div class="rich-editor__img-top">
								<input
									type="text"
									class="rich-editor__alt-input"
									placeholder="图片描述 alt（可选）"
									value={img.alt}
									onchange={(e) =>
										updateImage(img, {
											alt: (e.currentTarget as HTMLInputElement).value,
										})}
								/>
								<span class="rich-editor__size-badge">宽度 {img.width}%</span>
							</div>
							<div class="rich-editor__img-sliders">
								<input
									type="range"
									min="20"
									max="100"
									step="5"
									aria-label={`第 ${idx + 1} 张图片宽度`}
									value={img.width}
									oninput={(e) =>
										updateImage(img, {
											width: Number((e.currentTarget as HTMLInputElement).value),
										})}
								/>
								<div class="rich-editor__quick-widths">
									{#each [30, 50, 75, 100] as pct (pct)}
										<button
											type="button"
											class="rich-editor__mini-btn"
											class:rich-editor__mini-btn--active={img.width === pct}
											onclick={() => updateImage(img, { width: pct })}
										>
											{pct}%
										</button>
									{/each}
								</div>
							</div>
							<div class="rich-editor__img-actions">
								<div class="rich-editor__align-group" role="group" aria-label="图片对齐">
									<button
										type="button"
										class="rich-editor__mini-btn"
										class:rich-editor__mini-btn--active={img.align === "left"}
										title="左对齐"
										onclick={() => updateImage(img, { align: "left" })}
									>
										<Icon icon="material-symbols:format-align-left-rounded" aria-hidden="true" />
										<span>左</span>
									</button>
									<button
										type="button"
										class="rich-editor__mini-btn"
										class:rich-editor__mini-btn--active={img.align === "center"}
										title="居中"
										onclick={() => updateImage(img, { align: "center" })}
									>
										<Icon icon="material-symbols:format-align-center-rounded" aria-hidden="true" />
										<span>中</span>
									</button>
									<button
										type="button"
										class="rich-editor__mini-btn"
										class:rich-editor__mini-btn--active={img.align === "right"}
										title="右对齐"
										onclick={() => updateImage(img, { align: "right" })}
									>
										<Icon icon="material-symbols:format-align-right-rounded" aria-hidden="true" />
										<span>右</span>
									</button>
								</div>

								<div class="rich-editor__order-group">
									<button
										type="button"
										class="rich-editor__mini-btn"
										title="上移一段"
										onclick={() => moveImage(img, "up")}
									>
										<Icon icon="material-symbols:arrow-upward-rounded" aria-hidden="true" />
										<span>上移</span>
									</button>
									<button
										type="button"
										class="rich-editor__mini-btn"
										title="下移一段"
										onclick={() => moveImage(img, "down")}
									>
										<Icon icon="material-symbols:arrow-downward-rounded" aria-hidden="true" />
										<span>下移</span>
									</button>
									<button
										type="button"
										class="rich-editor__mini-btn"
										title="移到正文当前光标位置"
										onclick={() => void moveImageToCursor(img)}
									>
										移到光标处
									</button>
									{#if onMoveToGallery}
										<button
											type="button"
											class="rich-editor__mini-btn"
											title="改为放到底部九宫格相册"
											onclick={() => demoteImageToGallery(img)}
										>
											移至底部多图
										</button>
									{/if}
									<button
										type="button"
										class="rich-editor__mini-btn rich-editor__mini-btn--danger"
										title="移除此图片"
										aria-label="移除图片"
										onclick={() => (value = removeMarkdownImageAt(value, img))}
									>
										<Icon icon="material-symbols:delete-outline-rounded" aria-hidden="true" />
									</button>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style lang="stylus">
.rich-editor
	display: flex
	flex-direction: column
	gap: 0.625rem

	&__toolbar
		display: flex
		flex-wrap: wrap
		align-items: center
		gap: 0.375rem
		padding: 0.45rem 0.6rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)

	&__group
		display: inline-flex
		flex-wrap: wrap
		align-items: center
		gap: 0.25rem

	&__sep
		width: 1px
		height: 1.25rem
		background: var(--outline-variant)
		margin-inline: 0.2rem

	&__btn
		display: inline-flex
		align-items: center
		gap: 0.25rem
		height: 2rem
		padding: 0 0.5rem
		border: 1px solid transparent
		border-radius: var(--shape-corner-s)
		background: transparent
		color: var(--on-surface)
		font: var(--m3e-type-label-medium)
		cursor: pointer
		&:hover
			background: var(--surface-container-high)
		> :global(svg)
			width: 1.1rem
			height: 1.1rem

	&__upload-btn
		position: relative
		display: inline-flex
		align-items: center
		gap: 0.3rem
		height: 2rem
		padding: 0 0.65rem
		border-radius: var(--shape-corner-s)
		border: 1px solid var(--primary)
		background: var(--primary-container)
		color: var(--on-primary-container)
		font: var(--m3e-type-label-medium)
		cursor: pointer
		> :global(svg)
			width: 1.05rem
			height: 1.05rem

	&__select-wrap
		display: inline-flex
		align-items: center
		gap: 0.2rem
		height: 2rem
		padding: 0 0.4rem
		border-radius: var(--shape-corner-s)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-lowest)
		color: var(--on-surface)
		font: var(--m3e-type-label-medium)
		> :global(svg)
			width: 1rem
			height: 1rem
			color: var(--on-surface-variant)

	&__select
		border: 0
		background: transparent
		color: var(--on-surface)
		font: var(--m3e-type-label-medium)
		outline: none
		cursor: pointer

	&__color-wrap
		position: relative
		display: inline-flex

	&__swatch-dot
		width: 0.75rem
		height: 0.75rem
		border-radius: var(--shape-corner-full)
		border: 1px solid var(--outline-variant)

	&__popover
		position: absolute
		top: calc(100% + 0.35rem)
		left: 0
		z-index: 30
		width: max-content
		min-width: 13.5rem
		padding: 0.65rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-high)
		box-shadow: var(--m3e-elevation-3)
		display: flex
		flex-direction: column
		gap: 0.55rem

		&--wide
			min-width: 17.5rem

	&__palette
		display: flex
		flex-wrap: wrap
		gap: 0.375rem

	&__palette-dot
		width: 1.4rem
		height: 1.4rem
		border-radius: var(--shape-corner-full)
		border: 2px solid var(--surface-container-lowest)
		cursor: pointer
		transition: transform 0.12s ease
		&:hover
			transform: scale(1.12)

	&__color-custom
		display: flex
		align-items: center
		justify-content: space-between
		gap: 0.5rem
		padding-top: 0.4rem
		border-top: 1px solid var(--outline-variant)

	&__color-picker
		display: inline-flex
		align-items: center
		gap: 0.3rem
		font: var(--m3e-type-label-small)
		color: var(--on-surface-variant)
		input[type="color"]
			width: 1.75rem
			height: 1.35rem
			padding: 0
			border: 1px solid var(--outline-variant)
			border-radius: var(--shape-corner-xs)
			background: transparent
			cursor: pointer

	&__pop-input
		width: 100%
		box-sizing: border-box
		padding: 0.4rem 0.55rem
		border-radius: var(--shape-corner-s)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-lowest)
		color: var(--on-surface)
		font: var(--m3e-type-body-small)

	&__pop-row
		display: flex
		align-items: center
		gap: 0.4rem
		flex-wrap: wrap
		font: var(--m3e-type-label-small)
		color: var(--on-surface-variant)

	&__view-tabs
		display: inline-flex
		padding: 0.15rem
		border-radius: var(--shape-corner-s)
		background: var(--surface-container-highest)
		gap: 0.15rem

	&__view-tab
		padding: 0.25rem 0.55rem
		border: 0
		border-radius: var(--shape-corner-xs)
		background: transparent
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-small)
		cursor: pointer
		&--active
			background: var(--surface-container-lowest)
			color: var(--primary)
			font-weight: 600

	&__workspace
		display: grid
		grid-template-columns: minmax(0, 1fr)
		gap: 0.75rem

		&--split
			grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr))

	&__textarea
		width: 100%
		box-sizing: border-box
		padding: 0.75rem 0.9rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-lowest)
		color: var(--on-surface)
		font: var(--m3e-type-body-medium)
		line-height: 1.65
		resize: vertical
		&:focus
			outline: 2px solid var(--primary)
			outline-offset: -1px

	&__preview-pane
		padding: 0.75rem 0.95rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-lowest)
		min-height: 8.5rem
		overflow-x: hidden

	&__preview-label
		display: inline-flex
		align-items: center
		gap: 0.3rem
		margin-bottom: 0.5rem
		font: var(--m3e-type-label-small)
		color: var(--on-surface-variant)
		> :global(svg)
			width: 0.95rem
			height: 0.95rem

	&__preview
		font: var(--m3e-type-body-medium)
		line-height: 1.75
		color: var(--on-surface)
		overflow-wrap: anywhere
		:global(p:first-child)
			margin-top: 0
		:global(p:last-child)
			margin-bottom: 0
		:global(strong)
			font-weight: 700
		:global(.markdown-image-figure)
			margin: 0.75rem 0
		:global(.markdown-image-caption)
			margin-top: 0.35rem
			font: var(--m3e-type-body-small)
			color: var(--on-surface-variant)
			text-align: center
		:global(.markdown-image-figure--left .markdown-image-caption)
			text-align: left
		:global(.markdown-image-figure--right .markdown-image-caption)
			text-align: right
		:global(mark)
			padding: 0.05em 0.25em
			border-radius: var(--shape-corner-xs)
			background: unquote("color-mix(in oklab, var(--primary) 22%, transparent)")
			color: inherit

	&__preview-empty
		margin: 0
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

	&__images
		display: flex
		flex-direction: column
		gap: 0.5rem
		padding: 0.65rem 0.75rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)

	&__images-head
		font: var(--m3e-type-label-medium)
		color: var(--on-surface-variant)

	&__images-list
		display: flex
		flex-direction: column
		gap: 0.5rem

	&__img-row
		display: flex
		gap: 0.7rem
		align-items: flex-start
		padding: 0.55rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-lowest)

	&__img-thumb
		width: 4.5rem
		height: 4.5rem
		flex-shrink: 0
		border-radius: var(--shape-corner-s)
		object-fit: cover
		background: var(--surface-container-high)

	&__img-controls
		flex: 1
		min-width: 0
		display: flex
		flex-direction: column
		gap: 0.4rem

	&__img-top
		display: flex
		align-items: center
		gap: 0.5rem
		flex-wrap: wrap

	&__alt-input
		flex: 1
		min-width: 9rem
		padding: 0.28rem 0.5rem
		border-radius: var(--shape-corner-xs)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		color: var(--on-surface)
		font: var(--m3e-type-body-small)

	&__size-badge
		font: var(--m3e-type-label-medium)
		color: var(--primary)
		font-weight: 600

	&__img-sliders
		display: flex
		align-items: center
		gap: 0.5rem
		flex-wrap: wrap
		input[type="range"]
			flex: 1
			min-width: 7.5rem

	&__quick-widths
		display: inline-flex
		gap: 0.25rem

	&__img-actions
		display: flex
		align-items: center
		justify-content: space-between
		gap: 0.4rem
		flex-wrap: wrap

	&__align-group,
	&__order-group
		display: inline-flex
		align-items: center
		gap: 0.25rem
		flex-wrap: wrap

	&__mini-btn
		display: inline-flex
		align-items: center
		gap: 0.2rem
		padding: 0.2rem 0.5rem
		border-radius: var(--shape-corner-xs)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-small)
		cursor: pointer
		> :global(svg)
			width: 0.95rem
			height: 0.95rem
		&:hover
			background: var(--surface-container-high)
		&--active
			border-color: var(--primary)
			background: var(--primary-container)
			color: var(--on-primary-container)
			font-weight: 600
		&--primary
			border-color: var(--primary)
			background: var(--primary)
			color: var(--on-primary)
		&--danger
			color: var(--error)
</style>
