<script lang="ts">
import Button from "@components/atoms/action/Button.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import Switch from "@components/atoms/selection/Switch.svelte";
import Icon from "@iconify/svelte";
import {
	collectTagsFromRecords,
	compressImageToWebP,
	type EditableCategory,
	ensureUniqueKey,
	GAME_PLATFORM_PRESETS,
	GAME_TAG_PRESETS,
	moveListItem,
	normalizeGameItems,
	sanitizeUploadFilename,
} from "@utils/admin";
import { showSnackbar } from "@utils/snackbar";
import { url } from "@utils/url-utils";
import { onDestroy } from "svelte";
import type { GameItem, GameStatus } from "@/types/gamesConfig";
import AdminCategoryEditor from "../AdminCategoryEditor.svelte";
import AdminIconPicker from "../AdminIconPicker.svelte";
import AdminTagInput from "../AdminTagInput.svelte";

let {
	items = $bindable<GameItem[]>([]),
	categories = $bindable<EditableCategory[]>([]),
	defaultCategories,
	onUploadFile,
	onConfigChange = () => {},
}: {
	items?: GameItem[];
	categories?: EditableCategory[];
	defaultCategories: readonly EditableCategory[];
	onUploadFile: (repoPath: string, bytes: Uint8Array) => void;
	onConfigChange?: () => void;
} = $props();

let editingIndex = $state<number | null>(null);
let draftName = $state("");
let draftId = $state("");
let draftDeveloper = $state("");
let draftCategory = $state("open-world");
let draftStatus = $state<GameStatus>("playing");
let draftCover = $state("");
let draftIcon = $state("material-symbols:sports-esports-outline-rounded");
let draftRatingText = $state("");
let draftHoursText = $state("");
let draftPlatform = $state("PC");
let draftYear = $state(String(new Date().getFullYear()));
let draftTags = $state<string[]>([]);
let draftDescription = $state("");
let draftLink = $state("");
let draftFeatured = $state(false);
let draftEnabled = $state(true);
let previewMap = $state<Record<string, string>>({});

const statusLabels: Readonly<Record<GameStatus, string>> = {
	playing: "游玩中 (Playing)",
	completed: "已通关 (Completed)",
	backlog: "积灰待玩 (Backlog)",
	wishlist: "愿望单 (Wishlist)",
};

const categoryMap = $derived(new Map(categories.map((cat) => [cat.key, cat])));

const allExistingTags = $derived(
	collectTagsFromRecords(items, (item) => item.tags),
);

function resolveCoverPreview(rawCover: string): string {
	const trimmed = rawCover.trim();
	if (!trimmed) return "";
	if (previewMap[trimmed]) return previewMap[trimmed];
	return trimmed.startsWith("/") ? url(trimmed) : trimmed;
}

onDestroy(() => {
	for (const blobUrl of Object.values(previewMap)) {
		if (blobUrl.startsWith("blob:")) URL.revokeObjectURL(blobUrl);
	}
});

function resetDraft() {
	editingIndex = null;
	draftName = "";
	draftId = "";
	draftDeveloper = "";
	draftCategory = categories[0]?.key ?? "open-world";
	draftStatus = "playing";
	draftCover = "";
	draftIcon = "material-symbols:sports-esports-outline-rounded";
	draftRatingText = "";
	draftHoursText = "";
	draftPlatform = "PC";
	draftYear = String(new Date().getFullYear());
	draftTags = [];
	draftDescription = "";
	draftLink = "";
	draftFeatured = false;
	draftEnabled = true;
}

function startEdit(index: number) {
	const target = items[index];
	if (!target) return;
	editingIndex = index;
	draftName = target.name;
	draftId = target.id;
	draftDeveloper = target.developer;
	draftCategory = target.category || categories[0]?.key || "open-world";
	draftStatus = target.status;
	draftCover = target.cover ?? "";
	draftIcon = target.icon ?? "";
	draftRatingText = target.rating !== undefined ? String(target.rating) : "";
	draftHoursText = target.hours !== undefined ? String(target.hours) : "";
	draftPlatform = target.platform ?? "";
	draftYear = target.year ?? "";
	draftTags = [...(target.tags ?? [])];
	draftDescription = target.description;
	draftLink = target.link ?? "";
	draftFeatured = target.featured === true;
	draftEnabled = target.enable !== false;
}

async function handleCoverUpload(file: File) {
	try {
		const compressed = await compressImageToWebP(file, {
			maxDimension: 1440,
			quality: 0.86,
		});
		const base = sanitizeUploadFilename(
			draftId.trim() || draftName.trim() || file.name.replace(/\.[^.]+$/, ""),
			".webp",
		).replace(/\.[^.]+$/, "");
		const fileName = `${base}-${Date.now().toString(36).slice(-4)}.webp`;
		const repoPath = `public/images/games/${fileName}`;
		const publicPath = `/images/games/${fileName}`;
		onUploadFile(repoPath, compressed.bytes);

		const oldPreview = previewMap[publicPath];
		if (oldPreview?.startsWith("blob:")) URL.revokeObjectURL(oldPreview);
		const blobUrl = URL.createObjectURL(
			new Blob([compressed.bytes.buffer as ArrayBuffer], {
				type: "image/webp",
			}),
		);
		previewMap = { ...previewMap, [publicPath]: blobUrl };
		draftCover = publicPath;
		showSnackbar("游戏横屏封面已压缩为 WebP，提交保存时将随数据一起上传");
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "封面处理失败");
	}
}

function commitItem() {
	if (!draftName.trim() || !draftDescription.trim()) {
		showSnackbar("请填写游戏名称与简评/感想");
		return;
	}
	const otherIds = items
		.filter((_, idx) => idx !== editingIndex)
		.map((item) => item.id);
	const id = ensureUniqueKey(
		draftId.trim() || draftName.trim(),
		otherIds,
		"game",
	);

	const ratingNum =
		draftRatingText.trim() !== "" && !Number.isNaN(Number(draftRatingText))
			? Number(draftRatingText)
			: undefined;
	const hoursNum =
		draftHoursText.trim() !== "" && !Number.isNaN(Number(draftHoursText))
			? Number(draftHoursText)
			: undefined;

	const candidate: GameItem = {
		...(draftEnabled ? {} : { enable: false }),
		id,
		name: draftName.trim(),
		developer: draftDeveloper.trim(),
		category: draftCategory.trim() || categories[0]?.key || "open-world",
		status: draftStatus,
		...(draftCover.trim() ? { cover: draftCover.trim() } : {}),
		...(draftIcon.trim() ? { icon: draftIcon.trim() } : {}),
		...(ratingNum !== undefined ? { rating: ratingNum } : {}),
		...(hoursNum !== undefined ? { hours: hoursNum } : {}),
		...(draftPlatform.trim() ? { platform: draftPlatform.trim() } : {}),
		...(draftYear.trim() ? { year: draftYear.trim() } : {}),
		...(draftTags.length > 0 ? { tags: draftTags } : {}),
		description: draftDescription.trim(),
		...(draftLink.trim() ? { link: draftLink.trim() } : {}),
		...(draftFeatured ? { featured: true } : {}),
	};

	const [normalized] = normalizeGameItems([candidate]);
	if (!normalized) return;

	if (
		editingIndex !== null &&
		editingIndex >= 0 &&
		editingIndex < items.length
	) {
		items = items.map((item, idx) =>
			idx === editingIndex ? normalized : item,
		);
		showSnackbar("游戏条目已更新");
	} else {
		items = [...items, normalized];
		showSnackbar("已添加到游戏列表（记得点击底部保存提交）");
	}
	resetDraft();
}
</script>

<div class="games-editor">
	<AdminCategoryEditor
		title="游戏分类与 UI 图标管理"
		bind:categories
		{defaultCategories}
		defaultIconGroup="games"
		showDescription={true}
		onchange={onConfigChange}
	/>

	<div class="games-editor__form">
		<div class="games-editor__head">
			<strong>{editingIndex !== null ? `正在编辑游戏 #${editingIndex + 1}` : "新增游戏条目"}</strong>
			{#if editingIndex !== null}
				<Button variant="text" size="xsmall" label="取消编辑" onclick={resetDraft} />
			{/if}
		</div>

		<div class="games-editor__grid">
			<TextField label="游戏名称 (必需)" variant="outlined" bind:value={draftName} />
			<TextField label="开发商 / 工作室" variant="outlined" bind:value={draftDeveloper} />
			<TextField label="唯一 ID (留空自动生成)" variant="outlined" bind:value={draftId} />
			<label class="games-editor__select-field">
				<span>游戏分类</span>
				<select bind:value={draftCategory} aria-label="游戏分类">
					{#each categories as cat (cat.key)}
						<option value={cat.key}>{cat.label} ({cat.key})</option>
					{/each}
					{#if draftCategory && !categoryMap.has(draftCategory)}
						<option value={draftCategory}>{draftCategory} (自定义)</option>
					{/if}
				</select>
			</label>
			<label class="games-editor__select-field">
				<span>游玩状态</span>
				<select bind:value={draftStatus} aria-label="游玩状态">
					{#each Object.entries(statusLabels) as [status, label] (status)}
						<option value={status}>{label}</option>
					{/each}
				</select>
			</label>
			<TextField
				label="评分 (0–5，支持 0.5 步进)"
				type="number"
				placeholder="如 4.5"
				variant="outlined"
				bind:value={draftRatingText}
			/>
			<TextField
				label="游玩时长 (小时)"
				type="number"
				placeholder="如 86"
				variant="outlined"
				bind:value={draftHoursText}
			/>
			<TextField label="发行年份" variant="outlined" bind:value={draftYear} />
			<TextField label="官网 / 商店 / 评测链接" variant="outlined" bind:value={draftLink} />
		</div>

		<div class="games-editor__platform-row">
			<TextField label="游玩平台 (如 PC / Switch / PlayStation)" variant="outlined" bind:value={draftPlatform} />
			<div class="games-editor__platform-pills">
				{#each GAME_PLATFORM_PRESETS as platform (platform)}
					<button
						type="button"
						class="games-editor__pill"
						class:games-editor__pill--active={draftPlatform.trim() === platform}
						onclick={() => (draftPlatform = platform)}
					>
						{platform}
					</button>
				{/each}
			</div>
		</div>

		<label class="games-editor__textarea-field">
			<span>游戏简评 / 感想 (必需)</span>
			<textarea
				rows="3"
				bind:value={draftDescription}
				placeholder="写写对这部游戏的评价、游玩体验或记忆瞬间..."
			></textarea>
		</label>

		<AdminIconPicker
			label="无封面时的横幅 UI 图标"
			defaultGroup="games"
			bind:value={draftIcon}
		/>

		<div class="games-editor__cover-box">
			<TextField label="横屏封面图路径或 URL (建议 16:9)" variant="outlined" bind:value={draftCover} />
			<div class="games-editor__upload-row">
				<label class="games-editor__upload-btn m3-state-layer">
					<Icon icon="material-symbols:cloud-upload-outline-rounded" aria-hidden="true" />
					<span>上传横屏封面图 (自动压缩 WebP)</span>
					<input
						type="file"
						accept="image/*"
						hidden
						onchange={(e) => {
							const f = (e.currentTarget as HTMLInputElement).files?.[0];
							if (f) void handleCoverUpload(f);
						}}
					/>
				</label>
				{#if draftCover.trim()}
					<img
						class="games-editor__cover-preview"
						src={resolveCoverPreview(draftCover)}
						alt={draftName || "游戏封面预览"}
					/>
				{/if}
			</div>
		</div>

		<AdminTagInput
			bind:tags={draftTags}
			label="游戏类型与风格标签 (Tags)"
			placeholder="输入标签按回车添加，如：开放世界、RPG、独立游戏"
			presets={GAME_TAG_PRESETS}
			existingTags={allExistingTags}
		/>

		<div class="games-editor__switches">
			<label class="games-editor__switch">
				<Switch bind:checked={draftFeatured} label="特别推荐" icons />
				<span>特别推荐 (Featured 高亮卡片)</span>
			</label>
			<label class="games-editor__switch">
				<Switch bind:checked={draftEnabled} label="前台启用显示" icons />
				<span>前台展示该游戏</span>
			</label>
		</div>

		<div class="games-editor__end-btn">
			<Button
				variant="tonal"
				size="small"
				icon={editingIndex !== null ? "material-symbols:check-circle-outline-rounded" : "material-symbols:add-rounded"}
				label={editingIndex !== null ? "保存游戏修改" : "添加到游戏列表"}
				onclick={commitItem}
			/>
		</div>
	</div>

	<div class="games-editor__list">
		{#if items.length === 0}
			<p class="games-editor__empty">当前暂无游戏条目，可在上方添加（空列表时前台仅展示空状态）。</p>
		{:else}
			{#each items as item, idx (item.id + idx)}
				{@const cat = categoryMap.get(item.category)}
				<div class="games-editor__row" class:games-editor__row--disabled={item.enable === false}>
					<div class="games-editor__row-main">
						{#if item.cover}
							<img
								class="games-editor__thumb"
								src={resolveCoverPreview(item.cover)}
								alt=""
							/>
						{:else}
							<span class="games-editor__thumb-icon" aria-hidden="true">
								<Icon icon={item.icon || "material-symbols:sports-esports-outline-rounded"} />
							</span>
						{/if}
						<div class="games-editor__row-info">
							<div class="games-editor__row-title">
								<strong>{item.name}</strong>
								{#if item.developer}
									<small>{item.developer}</small>
								{/if}
								<span class="games-editor__badge">{statusLabels[item.status]}</span>
								{#if cat}
									<span class="games-editor__badge">{cat.label}</span>
								{/if}
								{#if item.rating !== undefined}
									<span class="games-editor__badge">★ {item.rating.toFixed(1)}</span>
								{/if}
								{#if item.featured}
									<span class="games-editor__badge games-editor__badge--primary">Featured</span>
								{/if}
							</div>
							<p class="games-editor__row-sub">{item.description}</p>
							{#if item.tags && item.tags.length > 0}
								<div class="games-editor__row-tags">
									{#each item.tags as tag (tag)}
										<span>{tag}</span>
									{/each}
								</div>
							{/if}
						</div>
					</div>
					<div class="games-editor__row-actions">
						<Button variant="text" size="xsmall" icon="material-symbols:edit-outline-rounded" label="编辑" onclick={() => startEdit(idx)} />
						<Button
							variant="text"
							size="xsmall"
							icon="material-symbols:arrow-upward-rounded"
							ariaLabel={`上移 ${item.name}`}
							disabled={idx === 0}
							onclick={() => (items = moveListItem(items, idx, -1))}
						/>
						<Button
							variant="text"
							size="xsmall"
							icon="material-symbols:arrow-downward-rounded"
							ariaLabel={`下移 ${item.name}`}
							disabled={idx === items.length - 1}
							onclick={() => (items = moveListItem(items, idx, 1))}
						/>
						<Button
							variant="text"
							size="xsmall"
							icon="material-symbols:delete-outline-rounded"
							label="删除"
							onclick={() => {
								if (editingIndex === idx) resetDraft();
								items = items.filter((_, i) => i !== idx);
							}}
						/>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style lang="stylus">
.games-editor
	display: flex
	flex-direction: column
	gap: 1rem

	&__form
		display: flex
		flex-direction: column
		gap: 0.875rem
		padding: 1rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)

	&__head
		display: flex
		align-items: center
		justify-content: space-between
		font: var(--m3e-type-title-small)
		color: var(--on-surface)

	&__grid
		display: grid
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr))
		gap: 0.75rem
		align-items: center

	&__select-field,
	&__textarea-field
		display: flex
		flex-direction: column
		gap: 0.25rem

		span
			font: var(--m3e-type-label-small)
			color: var(--on-surface-variant)

		select,
		textarea
			width: 100%
			box-sizing: border-box
			padding: 0.55rem 0.75rem
			border-radius: var(--shape-corner-s)
			border: 1px solid var(--outline-variant)
			background: var(--surface-container-lowest)
			color: var(--on-surface)
			font: var(--m3e-type-body-small)

	&__platform-row
		display: flex
		flex-direction: column
		gap: 0.5rem

	&__platform-pills
		display: flex
		flex-wrap: wrap
		gap: 0.375rem

	&__pill
		padding: 0.22rem 0.6rem
		border-radius: var(--shape-corner-full)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-lowest)
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-medium)
		cursor: pointer

		&--active
			background: var(--primary-container)
			color: var(--on-primary-container)
			border-color: var(--primary)

	&__cover-box
		display: flex
		flex-direction: column
		gap: 0.625rem
		padding: 0.75rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-lowest)

	&__upload-row
		display: flex
		flex-wrap: wrap
		align-items: center
		gap: 0.75rem

	&__upload-btn
		display: inline-flex
		align-items: center
		gap: 0.45rem
		padding: 0.45rem 0.85rem
		border-radius: var(--shape-corner-m)
		border: 1px dashed var(--outline)
		background: var(--surface-container-low)
		color: var(--primary)
		font: var(--m3e-type-label-medium)
		cursor: pointer

	&__cover-preview
		height: 3.5rem
		aspect-ratio: 16 / 9
		border-radius: var(--shape-corner-s)
		object-fit: cover
		border: 1px solid var(--outline-variant)

	&__switches
		display: flex
		flex-wrap: wrap
		gap: 1.25rem

	&__switch
		display: inline-flex
		align-items: center
		gap: 0.5rem
		font: var(--m3e-type-body-small)
		color: var(--on-surface)
		cursor: pointer

	&__end-btn
		display: flex
		justify-content: flex-end

	&__list
		display: flex
		flex-direction: column
		gap: 0.5rem

	&__empty
		margin: 0
		padding: 1rem
		text-align: center
		border-radius: var(--shape-corner-m)
		border: 1px dashed var(--outline-variant)
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)

	&__row
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: 0.75rem
		padding: 0.75rem 0.875rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)

		&--disabled
			opacity: 0.65

	&__row-main
		display: flex
		align-items: flex-start
		gap: 0.75rem
		flex: 1
		min-width: 0

	&__thumb
		width: 4.5rem
		aspect-ratio: 16 / 9
		border-radius: var(--shape-corner-s)
		object-fit: cover
		flex-shrink: 0

	&__thumb-icon
		display: inline-flex
		align-items: center
		justify-content: center
		width: 2.5rem
		height: 2.5rem
		border-radius: var(--shape-corner-m)
		background: var(--primary-container)
		color: var(--on-primary-container)
		flex-shrink: 0

		> :global(svg)
			width: 1.25rem
			height: 1.25rem

	&__row-info
		display: flex
		flex-direction: column
		gap: 0.25rem
		min-width: 0

	&__row-title
		display: flex
		flex-wrap: wrap
		align-items: center
		gap: 0.4rem
		font: var(--m3e-type-body-medium)
		color: var(--on-surface)

		small
			color: var(--on-surface-variant)

	&__badge
		padding: 0.1rem 0.45rem
		border-radius: var(--shape-corner-full)
		background: var(--surface-container-high)
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-small)

		&--primary
			background: var(--primary-container)
			color: var(--on-primary-container)

	&__row-sub
		margin: 0
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

	&__row-tags
		display: flex
		flex-wrap: wrap
		gap: 0.35rem

		span
			padding: 0.08rem 0.4rem
			border-radius: var(--shape-corner-s)
			background: var(--surface-container-high)
			font: var(--m3e-type-label-small)
			color: var(--on-surface-variant)

	&__row-actions
		display: flex
		flex-wrap: wrap
		align-items: center
		gap: 0.25rem
</style>
