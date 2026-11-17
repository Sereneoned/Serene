<script lang="ts">
/**
 * 动态页主体（有机体）：页头 + 搜索/标签筛选 + 动态流 + 加载更多。
 * 数据由页面层构建期渲染后以 props 传入（零运行时请求）；
 * 筛选状态同步 URL（?q= / ?tag=），与友链页同一交互语言。
 */
import Button from "@components/atoms/action/Button.svelte";
import Chips from "@components/atoms/action/Chips.svelte";
import Card from "@components/atoms/display/Card.svelte";
import Icon from "@components/atoms/display/Icon.svelte";
import LoadingIndicator from "@components/atoms/feedback/LoadingIndicator.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import MomentCard, {
	type MomentAuthor,
} from "@components/molecules/MomentCard.svelte";
import PageHeader from "@components/molecules/PageHeader.svelte";
import RichBodyEditor, {
	type UploadedInlineImage,
} from "@components/molecules/RichBodyEditor.svelte";
import ProtectedMoment from "@components/organisms/ProtectedMoment.svelte";
import I18nKey from "@i18n/i18nKey";
import { t } from "@i18n/runtime.ts";
import {
	type AdminSession,
	commitRepoChanges,
	compressImageToWebP,
	formatIsoDateTimeLocal,
	getAdminSession,
	MOOD_ICON_PRESETS,
	onAdminSessionChange,
	type RepoFileChange,
	sanitizeUploadFilename,
	serializeMomentMarkdown,
	toSlug,
} from "@utils/admin";
import type { MomentItem } from "@utils/content-utils";
import { initFancybox } from "@utils/fancybox-handler";
import { showSnackbar } from "@utils/snackbar";
import { url } from "@utils/url-utils";
import {
	buildMomentInteractionPath,
	fetchWalineBatchCounters,
	type WalineInteractionOptions,
	type WalinePathCounters,
} from "@utils/waline-interactions";
import { onMount, type Snippet } from "svelte";
import { adminConfig } from "@/config";

let {
	moments = [] as MomentItem[],
	author = { name: "", avatar: "", url: "/about/" } as MomentAuthor,
	walineConfig = null,
	umamiEnabled = false,
	basePath = "/",
	title,
	subtitle,
	titleKey,
	subtitleKey,
	children,
}: {
	moments?: MomentItem[];
	author?: MomentAuthor;
	walineConfig?: WalineInteractionOptions | null;
	umamiEnabled?: boolean;
	basePath?: string;
	title?: string;
	subtitle?: string;
	titleKey?: I18nKey;
	subtitleKey?: I18nKey;
	children?: Snippet;
} = $props();
const resolvedTitle = $derived(
	titleKey ? $t(titleKey) : (title ?? $t(I18nKey.moments)),
);
const resolvedSubtitle = $derived(
	subtitleKey ? $t(subtitleKey) : (subtitle ?? $t(I18nKey.momentsBanner)),
);

const MOMENTS_PAGE_SIZE = 10;

let query = $state("");
let selectedTag = $state("");
let shownCount = $state(MOMENTS_PAGE_SIZE);
let initialized = false;
/** 分类（标签）筛选过渡三段态：loading 展示指示器 → out 指示器淡出 → idle 列表 stagger 揭幕 */
type FilterPhase = "idle" | "loading" | "out";
let phase = $state<FilterPhase>("idle");
let phaseTimers: ReturnType<typeof setTimeout>[] = [];

let adminSession = $state<AdminSession | null>(null);
let quickBody = $state("");
let quickLocation = $state("");
let quickTags = $state("");
let quickMood = $state("material-symbols:sentiment-excited-outline-rounded");
let quickPhotos = $state<
	Array<{ id: string; src: string; previewUrl: string; bytes: Uint8Array }>
>([]);
let quickInlineUploads = $state<
	Record<string, { previewUrl: string; bytes: Uint8Array }>
>({});
let quickPublishing = $state(false);
let quickFolder = $state("");
let deletingId = $state("");
let deletedIds = $state<Set<string>>(new Set());

const quickPreviewUrlMap = $derived({
	...Object.fromEntries(
		Object.entries(quickInlineUploads).map(([src, item]) => [
			src,
			item.previewUrl,
		]),
	),
	...Object.fromEntries(quickPhotos.map((p) => [p.src, p.previewUrl])),
});

async function compressQuickFiles(files: FileList | File[]): Promise<
	Array<{
		id: string;
		src: string;
		alt: string;
		previewUrl: string;
		bytes: Uint8Array;
	}>
> {
	const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
	if (arr.length === 0) return [];
	if (!quickFolder) {
		quickFolder = `${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36).slice(-4)}`;
	}
	const added: Array<{
		id: string;
		src: string;
		alt: string;
		previewUrl: string;
		bytes: Uint8Array;
	}> = [];
	for (const file of arr) {
		const compressed = await compressImageToWebP(file, {
			maxDimension: 1600,
			quality: 0.85,
		});
		const base = sanitizeUploadFilename(
			file.name.replace(/\.[^.]+$/, ""),
			".webp",
		).replace(/\.[^.]+$/, "");
		const fileName = `${base}-${Math.random().toString(36).slice(2, 5)}.webp`;
		const src = `/images/moments/${quickFolder}/${fileName}`;
		added.push({
			id: `${Date.now()}-${Math.random()}`,
			src,
			alt: file.name.replace(/\.[^.]+$/, ""),
			previewUrl: URL.createObjectURL(
				new Blob([compressed.bytes.buffer as ArrayBuffer], {
					type: "image/webp",
				}),
			),
			bytes: compressed.bytes,
		});
	}
	return added;
}

async function handleQuickFiles(files: FileList | File[]) {
	const added = await compressQuickFiles(files);
	if (added.length > 0) {
		quickPhotos = [...quickPhotos, ...added];
	}
}

async function uploadQuickInlineImages(
	files: FileList | File[],
): Promise<UploadedInlineImage[]> {
	const added = await compressQuickFiles(files);
	if (added.length === 0) return [];
	const nextMap = { ...quickInlineUploads };
	for (const item of added) {
		nextMap[item.src] = { previewUrl: item.previewUrl, bytes: item.bytes };
	}
	quickInlineUploads = nextMap;
	return added.map((item) => ({
		src: item.src,
		previewUrl: item.previewUrl,
		alt: item.alt,
	}));
}

function moveQuickInlineToGallery(item: {
	src: string;
	alt: string;
	previewUrl: string;
}) {
	const found = quickInlineUploads[item.src];
	if (!found) {
		showSnackbar("仅支持将当前新上传图片移至底部多图");
		return;
	}
	const { [item.src]: _, ...rest } = quickInlineUploads;
	quickInlineUploads = rest;
	quickPhotos = [
		...quickPhotos,
		{
			id: `${Date.now()}-${Math.random()}`,
			src: item.src,
			previewUrl: found.previewUrl,
			bytes: found.bytes,
		},
	];
	showSnackbar("已移至底部多图九宫格");
}

async function submitQuickMoment() {
	if (!adminSession) return;
	if (!quickBody.trim() && quickPhotos.length === 0) {
		showSnackbar("请输入动态内容或添加配图");
		return;
	}
	quickPublishing = true;
	try {
		const published = formatIsoDateTimeLocal();
		const datePrefix = published.slice(0, 10);
		const slug = toSlug(quickBody.slice(0, 28) || "moment", "moment");
		const targetPath = `src/content/moments/${datePrefix}-${slug}-${Date.now().toString(36).slice(-3)}.md`;
		const tags = quickTags
			.split(/[,，]/)
			.map((s) => s.trim())
			.filter(Boolean);
		const md = serializeMomentMarkdown({
			published,
			location: quickLocation,
			mood: quickMood,
			tags,
			images: quickPhotos.map((p) => ({ src: p.src, alt: "" })),
			body: quickBody,
		});
		const uploadedPaths = new Set<string>();
		const changes: RepoFileChange[] = [];
		for (const p of quickPhotos) {
			const repoPath = `public/${p.src.replace(/^\/+/, "")}`;
			uploadedPaths.add(repoPath);
			changes.push({
				path: repoPath,
				action: "upsert",
				content: p.bytes,
			});
		}
		for (const [src, item] of Object.entries(quickInlineUploads)) {
			if (!quickBody.includes(src)) continue;
			const repoPath = `public/${src.replace(/^\/+/, "")}`;
			if (uploadedPaths.has(repoPath)) continue;
			uploadedPaths.add(repoPath);
			changes.push({
				path: repoPath,
				action: "upsert",
				content: item.bytes,
			});
		}
		changes.push({ path: targetPath, action: "upsert", content: md });
		await commitRepoChanges(
			adminSession,
			`content(moments): quick post ${datePrefix}`,
			changes,
		);
		for (const p of quickPhotos) URL.revokeObjectURL(p.previewUrl);
		for (const item of Object.values(quickInlineUploads)) {
			URL.revokeObjectURL(item.previewUrl);
		}
		quickBody = "";
		quickLocation = "";
		quickTags = "";
		quickPhotos = [];
		quickInlineUploads = {};
		quickFolder = "";
		showSnackbar("动态已提交到 GitHub，Pages 构建完成后将出现在列表中", {
			icon: "material-symbols:check-circle-outline-rounded",
		});
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "发布失败");
	} finally {
		quickPublishing = false;
	}
}

async function deleteMomentFromCard(momentId: string) {
	if (!adminSession || deletingId) return;
	if (!window.confirm(`确定删除动态 ${momentId} 吗？`)) return;
	deletingId = momentId;
	try {
		await commitRepoChanges(
			adminSession,
			`content(moments): delete ${momentId}`,
			[{ path: `src/content/moments/${momentId}.md`, action: "delete" }],
		);
		deletedIds = new Set(deletedIds).add(momentId);
		showSnackbar("已从 GitHub 删除动态，构建后线上列表更新");
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "删除失败");
	} finally {
		deletingId = "";
	}
}

const tagItems = $derived(
	Array.from(
		new Set(
			moments
				.filter((m) => !deletedIds.has(m.id))
				.flatMap((moment) => moment.filterTags),
		),
	)
		.sort((a, b) => a.localeCompare(b))
		.map((tag) => ({ value: tag, label: tag })),
);

/** HTML → 纯文本（搜索用），构建一次避免每键重复解析 */
const searchTexts = $derived.by(() => {
	const map = new Map<string, string>();
	for (const moment of moments) {
		const plain = moment.html.replace(/<[^>]+>/g, " ");
		map.set(
			moment.id,
			[plain, moment.location, ...moment.tags].join(" ").toLowerCase(),
		);
	}
	return map;
});

const filtered = $derived.by(() => {
	const normalizedQuery = query.trim().toLowerCase();

	return moments.filter((moment) => {
		if (deletedIds.has(moment.id)) return false;
		if (selectedTag && !moment.filterTags.includes(selectedTag)) return false;
		if (!normalizedQuery) return true;
		return (searchTexts.get(moment.id) ?? "").includes(normalizedQuery);
	});
});

const visibleMoments = $derived(filtered.slice(0, shownCount));
const hasMore = $derived(filtered.length > shownCount);

function countLabel(count: number) {
	return `${count} ${$t(I18nKey.momentsCounts)}`;
}

/** 分类（标签）筛选：指示器展示 → 淡出 → 列表 stagger 揭幕 */
function onTagChange() {
	phaseTimers.forEach(clearTimeout);
	phase = "loading";
	phaseTimers = [
		setTimeout(() => (phase = "out"), 300),
		setTimeout(() => (phase = "idle"), 300 + 150),
	];
}

// 筛选变化时重置已加载数（读依赖注册在前，避免首次 return 后失联）
$effect(() => {
	const q = query;
	const t = selectedTag;
	if (!initialized) return;
	shownCount = MOMENTS_PAGE_SIZE;
});

// 筛选状态同步到 URL（?q= / ?tag=），刷新/分享/回退保留
$effect(() => {
	const q = query;
	const t = selectedTag;
	if (!initialized) return;
	const params = new URLSearchParams(window.location.search);
	params.delete("q");
	params.delete("tag");
	if (q) params.set("q", q);
	if (t) params.set("tag", t);
	const qs = params.toString();
	history.replaceState(
		history.state,
		"",
		qs ? `?${qs}` : window.location.pathname,
	);
});

let interactionStats = $state<Record<string, WalinePathCounters>>({});
const fetchedPaths = new Set<string>();

$effect(() => {
	if (!walineConfig || typeof window === "undefined") return;
	const missing = visibleMoments
		.filter((m) => !m.encrypted)
		.map((m) => buildMomentInteractionPath(m.id, basePath))
		.filter((path) => !fetchedPaths.has(path));
	if (missing.length === 0) return;
	for (const path of missing) fetchedPaths.add(path);
	const controller = new AbortController();
	void fetchWalineBatchCounters(
		walineConfig.serverURL,
		missing,
		controller.signal,
	)
		.then((map) => {
			const next = { ...interactionStats };
			for (const [path, counts] of map.entries()) {
				next[path] = counts;
			}
			interactionStats = next;
		})
		.catch(() => {
			for (const path of missing) fetchedPaths.delete(path);
		});
	return () => controller.abort();
});

onMount(() => {
	const params = new URLSearchParams(window.location.search);
	query = params.get("q") || "";
	selectedTag = params.get("tag") || "";
	initialized = true;
	// 图片灯箱：client:only 岛挂载晚于全局 init，此处确保 [data-fancybox] 已绑定
	initFancybox();
	let stopSession = () => {};
	if (adminConfig.enable) {
		adminSession = getAdminSession();
		stopSession = onAdminSessionChange((next) => {
			adminSession = next;
		});
	}
	return () => {
		phaseTimers.forEach(clearTimeout);
		stopSession();
	};
});
</script>

<Card color="var(--card-bg)" radius="l" class="moment-section px-8 py-6">
	<PageHeader
		icon="material-symbols:auto-awesome-outline-rounded"
		title={resolvedTitle}
		subtitle={resolvedSubtitle}
	/>

	{#if umamiEnabled && children}
		<div class="moment-section__page-stats">
			{@render children()}
		</div>
	{/if}

	{#if adminConfig.enable && adminSession}
		<div class="moment-admin-composer">
			{#if !walineConfig || !umamiEnabled}
				<p class="moment-admin-composer__hint">
					当前{#if !walineConfig && !umamiEnabled}访客点赞/评论 (Waline) 与浏览量 (Umami){:else if !walineConfig}访客点赞/评论 (Waline){:else}浏览量统计 (Umami){/if}尚未填写服务地址——<a href={url("/admin/?tab=site#analytics-comment")}>前往站点设置配置 →</a>
				</p>
			{/if}
			<div class="moment-admin-composer__head">
				<strong>{$t(I18nKey.adminQuickNewMoment)}</strong>
				<a href={url("/admin/?tab=moments")}>打开完整动态管理台 →</a>
			</div>
			<RichBodyEditor
				compact
				bind:value={quickBody}
				rows={4}
				placeholder="写下此刻动态（可选字号/加粗/字体颜色；点「插图到光标处」或粘贴截图直接在当前位置插图并调大小）..."
				previewUrlMap={quickPreviewUrlMap}
				onUploadImages={uploadQuickInlineImages}
				onMoveToGallery={moveQuickInlineToGallery}
			/>
			{#if quickPhotos.length > 0}
				<div class="moment-admin-composer__thumbs">
					{#each quickPhotos as p (p.id)}
						<div class="moment-admin-composer__thumb">
							<img src={p.previewUrl} alt="" />
							<button
								type="button"
								aria-label="移除图片"
								onclick={() => {
									URL.revokeObjectURL(p.previewUrl);
									quickPhotos = quickPhotos.filter((item) => item.id !== p.id);
								}}
							>
								×
							</button>
						</div>
					{/each}
				</div>
			{/if}
			<div class="moment-admin-composer__bar">
				<label class="moment-admin-composer__upload m3-state-layer" title="可选：仅放到底部九宫格相册；正文插图请用上方「插图到光标处」">
					<Icon icon="material-symbols:cloud-upload-outline-rounded" aria-hidden="true" />
					<span>末尾多图相册</span>
					<input
						type="file"
						accept="image/*"
						multiple
						hidden
						onchange={(e) => {
							const files = (e.currentTarget as HTMLInputElement).files;
							if (files) void handleQuickFiles(files);
							(e.currentTarget as HTMLInputElement).value = "";
						}}
					/>
				</label>
				<select class="moment-admin-composer__input" bind:value={quickMood} aria-label="心情">
					{#each MOOD_ICON_PRESETS as preset (preset.icon)}
						<option value={preset.icon}>{preset.label}</option>
					{/each}
				</select>
				<input class="moment-admin-composer__input" type="text" placeholder="位置" bind:value={quickLocation} />
				<input class="moment-admin-composer__input" type="text" placeholder="标签 (逗号分隔)" bind:value={quickTags} />
				<Button
					variant="filled"
					size="small"
					icon="material-symbols:rocket-launch-outline-rounded"
					label={quickPublishing ? "发布中..." : "立即发表"}
					disabled={quickPublishing}
					onclick={submitQuickMoment}
				/>
			</div>
		</div>
	{/if}

	{#if moments.length > 0}
		<div class="moment-section__tools">
			<div class="moment-section__search">
				<TextField
					type="search"
					bind:value={query}
					placeholder={$t(I18nKey.search)}
					label={$t(I18nKey.search)}
					hideLabel
					variant="outlined"
					class="!rounded-(--shape-corner-l)"
				>
					<Icon slot="leading" icon="material-symbols:search-rounded" aria-hidden="true" />
				</TextField>
				{#if query}
					<button
						type="button"
						class="moment-section__search-clear"
						aria-label={$t(I18nKey.clear)}
						onclick={() => (query = "")}
					>
						<Icon icon="material-symbols:close-rounded" aria-hidden="true" />
					</button>
				{/if}
			</div>

			{#if tagItems.length > 0}
				<div class="moment-section__chips">
					<Chips
						items={tagItems}
						variant="filter"
						bind:value={selectedTag}
						onchange={onTagChange}
					/>
				</div>
			{/if}
			{#if filtered.length > 1}
				<p class="moment-section__count">{countLabel(filtered.length)}</p>
			{/if}
		</div>
	{/if}

	{#if phase !== "idle"}
		<!-- 分类（标签）筛选过渡：contained 指示器展示后淡出，再由列表 stagger 揭幕 -->
		<div
			class="moment-section__loading"
			class:moment-section__loading--out={phase === "out"}
		>
			<LoadingIndicator contained size={64} />
		</div>
	{:else if visibleMoments.length > 0}
		{#key `${query}|${selectedTag}`}
			<div class="moment-section__list">
				{#each visibleMoments as moment, i (moment.id)}
					<div class="moment-section__entry">
						{#if moment.encrypted}
							<ProtectedMoment {moment} {author} delay={Math.min(i, 7) * 45} />
						{:else}
							{@const momentPath = walineConfig
								? buildMomentInteractionPath(moment.id, basePath)
								: ""}
							<MomentCard
								{moment}
								{author}
								delay={Math.min(i, 7) * 45}
								{walineConfig}
								interactionPath={momentPath}
								interactionStats={momentPath
									? interactionStats[momentPath]
									: undefined}
							/>
						{/if}
						{#if adminConfig.enable && adminSession}
							<div class="moment-admin-actions">
								<Button
									variant="text"
									size="xsmall"
									icon="material-symbols:edit-outline-rounded"
									label={$t(I18nKey.adminQuickEdit)}
									href={url(`/admin/?tab=moments&edit=${encodeURIComponent(moment.id)}`)}
								/>
								<Button
									variant="text"
									size="xsmall"
									icon="material-symbols:delete-outline-rounded"
									label={$t(I18nKey.adminQuickDelete)}
									disabled={deletingId === moment.id}
									onclick={() => deleteMomentFromCard(moment.id)}
								/>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/key}
		{#if hasMore}
			<div class="moment-section__more">
				<Button
					variant="outlined"
					icon="material-symbols:expand-more-rounded"
					label={$t(I18nKey.loadMore)}
					onclick={() => (shownCount += MOMENTS_PAGE_SIZE)}
				/>
			</div>
		{/if}
	{:else}
		<div class="moment-section__empty">
			<Icon icon="material-symbols:search-off-outline-rounded" aria-hidden="true" />
			<span>{$t(I18nKey.momentsNoResults)}</span>
		</div>
	{/if}
</Card>

<style lang="stylus">
@import "../../styles/breakpoints.styl"

.moment-section
	display: block

	&__page-stats
		margin-bottom: 1rem

	&__tools
		display: flex
		flex-direction: column
		gap: 0.875rem
		padding-bottom: 1.5rem
		border-bottom: 1px solid var(--outline-variant)

	&__search
		position: relative
		width: 100%
		max-width: 32rem

		:global(.m3-text-field)
			width: 100%

	&__search-clear
		position: absolute
		right: 0.5rem
		top: 50%
		transform: translateY(-50%)
		display: inline-flex
		flex-shrink: 0
		align-items: center
		justify-content: center
		width: 1.75rem
		height: 1.75rem
		padding: 0.25rem
		border: none
		background: none
		color: var(--on-surface-variant)
		cursor: pointer
		border-radius: var(--shape-corner-full)
		> :global(svg)
			width: 1.25rem
			height: 1.25rem
		&:hover
			background: unquote("color-mix(in oklab, var(--on-surface-variant) 8%, transparent)")

	&__chips
		width: 100%

	&__count
		margin: 0
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)

	&__list
		display: grid
		/* 显式下限 0：长链接等不可断 token 的 min-content 不得撑宽网格轨道 */
		grid-template-columns: minmax(0, 1fr)
		gap: 1rem
		padding-top: 1.5rem

	/* 分类筛选过渡：区块位置的大号 contained LoadingIndicator（out = 淡出退场） */
	&__loading
		display: flex
		align-items: center
		justify-content: center
		min-height: 11rem
		padding-top: 1.5rem

		&--out
			animation: moment-loading-out var(--m3e-duration-short) var(--m3e-easing-emphasized-accelerate) both

	&__more
		display: flex
		justify-content: center
		margin-top: 1.25rem

	&__empty
		display: flex
		flex-direction: column
		align-items: center
		justify-content: center
		gap: 0.75rem
		min-height: 11rem
		padding-top: 1.5rem
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-large)
		> :global(svg)
			width: 2.5rem
			height: 2.5rem

	@media (max-width: bp-sm - 1px)
		padding: 1rem 0.75rem

		&__list
			padding-top: 1.25rem

/* 指示器退场：淡出 + 轻微收拢（reduced-motion 由全局规则压至终态） */
@keyframes moment-loading-out
	from
		opacity: 1
		transform: none
	to
		opacity: 0
		transform: scale(0.96)

.moment-admin-composer
	display: flex
	flex-direction: column
	gap: 0.75rem
	margin-bottom: 1.25rem
	padding: 1rem
	border-radius: var(--shape-corner-l)
	border: 1px solid var(--outline-variant)
	background: var(--surface-container-low)

	&__hint
		margin: 0
		padding: 0.5rem 0.75rem
		border-radius: var(--shape-corner-m)
		background: var(--secondary-container)
		color: var(--on-secondary-container)
		font: var(--m3e-type-body-small)

		a
			color: var(--primary)
			font-weight: 600
			text-decoration: underline

	&__head
		display: flex
		align-items: center
		justify-content: space-between
		font: var(--m3e-type-title-small)
		color: var(--on-surface)

		a
			font: var(--m3e-type-label-medium)
			color: var(--primary)
			text-decoration: none

	&__thumbs
		display: flex
		flex-wrap: wrap
		gap: 0.5rem

	&__thumb
		position: relative
		width: 4.5rem
		height: 4.5rem
		border-radius: var(--shape-corner-s)
		overflow: hidden

		img
			width: 100%
			height: 100%
			object-fit: cover

		button
			position: absolute
			top: 0.15rem
			right: 0.15rem
			width: 1.25rem
			height: 1.25rem
			border: 0
			border-radius: var(--shape-corner-full)
			background: unquote("rgb(0 0 0 / 0.65)")
			color: #fff
			cursor: pointer
			line-height: 1

	&__bar
		display: flex
		flex-wrap: wrap
		gap: 0.5rem
		align-items: center

	&__upload
		display: inline-flex
		align-items: center
		gap: 0.375rem
		padding: 0.45rem 0.75rem
		border-radius: var(--shape-corner-m)
		border: 1px dashed var(--outline)
		color: var(--primary)
		font: var(--m3e-type-label-large)
		cursor: pointer

	&__input
		flex: 1 1 7rem
		min-width: 0
		padding: 0.45rem 0.625rem
		border-radius: var(--shape-corner-s)
		border: 1px solid var(--outline-variant)
		background: var(--surface)
		color: var(--on-surface)
		font: var(--m3e-type-body-small)

.moment-admin-actions
	display: flex
	justify-content: flex-end
	gap: 0.375rem
	margin-top: 0.25rem
</style>
