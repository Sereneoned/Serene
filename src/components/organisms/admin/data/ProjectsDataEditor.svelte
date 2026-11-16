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
	moveListItem,
	normalizeProjectItems,
	PROJECT_TECH_PRESETS,
	sanitizeUploadFilename,
} from "@utils/admin";
import { showSnackbar } from "@utils/snackbar";
import { url } from "@utils/url-utils";
import { onDestroy } from "svelte";
import type { ProjectItem, ProjectPhase } from "@/types/projectsConfig";
import AdminCategoryEditor from "../AdminCategoryEditor.svelte";
import AdminIconPicker from "../AdminIconPicker.svelte";
import AdminTagInput from "../AdminTagInput.svelte";

let {
	items = $bindable<ProjectItem[]>([]),
	categories = $bindable<EditableCategory[]>([]),
	defaultCategories,
	onUploadFile,
	onConfigChange = () => {},
}: {
	items?: ProjectItem[];
	categories?: EditableCategory[];
	defaultCategories: readonly EditableCategory[];
	onUploadFile: (repoPath: string, bytes: Uint8Array) => void;
	onConfigChange?: () => void;
} = $props();

let editingIndex = $state<number | null>(null);
let draftTitle = $state("");
let draftKey = $state("");
let draftSummary = $state("");
let draftCategory = $state("theme");
let draftPhase = $state<ProjectPhase>("building");
let draftTechnologies = $state<string[]>([]);
let draftIcon = $state("material-symbols:deployed-code-outline-rounded");
let draftCover = $state("");
let draftCoverAlt = $state("");
let draftWebsite = $state("");
let draftRepository = $state("");
let draftYear = $state(String(new Date().getFullYear()));
let draftFeatured = $state(false);
let draftEnabled = $state(true);
let previewMap = $state<Record<string, string>>({});

const phaseLabels: Readonly<Record<ProjectPhase, string>> = {
	shipped: "已完成 (Shipped)",
	building: "开发中 (Building)",
	exploring: "探索中 (Exploring)",
};

const categoryMap = $derived(new Map(categories.map((cat) => [cat.key, cat])));

const allExistingTechs = $derived(
	collectTagsFromRecords(items, (item) => item.technologies),
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
	draftTitle = "";
	draftKey = "";
	draftSummary = "";
	draftCategory = categories[0]?.key ?? "theme";
	draftPhase = "building";
	draftTechnologies = [];
	draftIcon = "material-symbols:deployed-code-outline-rounded";
	draftCover = "";
	draftCoverAlt = "";
	draftWebsite = "";
	draftRepository = "";
	draftYear = String(new Date().getFullYear());
	draftFeatured = false;
	draftEnabled = true;
}

function startEdit(index: number) {
	const target = items[index];
	if (!target) return;
	editingIndex = index;
	draftTitle = target.title;
	draftKey = target.key;
	draftSummary = target.summary;
	draftCategory = target.category || categories[0]?.key || "theme";
	draftPhase = target.phase;
	draftTechnologies = [...target.technologies];
	draftIcon = target.icon ?? "";
	draftCover = target.cover ?? "";
	draftCoverAlt = target.coverAlt ?? "";
	draftWebsite = target.website ?? "";
	draftRepository = target.repository ?? "";
	draftYear = target.year ?? "";
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
			draftKey.trim() || draftTitle.trim() || file.name.replace(/\.[^.]+$/, ""),
			".webp",
		).replace(/\.[^.]+$/, "");
		const fileName = `${base}-${Date.now().toString(36).slice(-4)}.webp`;
		const repoPath = `public/images/projects/${fileName}`;
		const publicPath = `/images/projects/${fileName}`;
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
		showSnackbar("项目封面已压缩为 WebP，提交保存时将随数据一起上传");
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "封面处理失败");
	}
}

function commitItem() {
	if (!draftTitle.trim() || !draftSummary.trim()) {
		showSnackbar("请填写项目名称与一句话简介");
		return;
	}
	const otherKeys = items
		.filter((_, idx) => idx !== editingIndex)
		.map((item) => item.key);
	const key = ensureUniqueKey(
		draftKey.trim() || draftTitle.trim(),
		otherKeys,
		"project",
	);

	const candidate: ProjectItem = {
		...(draftEnabled ? {} : { enable: false }),
		key,
		title: draftTitle.trim(),
		summary: draftSummary.trim(),
		category: draftCategory.trim() || categories[0]?.key || "theme",
		phase: draftPhase,
		technologies: draftTechnologies,
		...(draftIcon.trim() ? { icon: draftIcon.trim() } : {}),
		...(draftCover.trim() ? { cover: draftCover.trim() } : {}),
		...(draftCover.trim() && draftCoverAlt.trim()
			? { coverAlt: draftCoverAlt.trim() }
			: {}),
		...(draftFeatured ? { featured: true } : {}),
		...(draftWebsite.trim() ? { website: draftWebsite.trim() } : {}),
		...(draftRepository.trim() ? { repository: draftRepository.trim() } : {}),
		...(draftYear.trim() ? { year: draftYear.trim() } : {}),
	};

	const [normalized] = normalizeProjectItems([candidate]);
	if (!normalized) return;

	if (
		editingIndex !== null &&
		editingIndex >= 0 &&
		editingIndex < items.length
	) {
		items = items.map((item, idx) =>
			idx === editingIndex ? normalized : item,
		);
		showSnackbar("项目信息已更新");
	} else {
		items = [...items, normalized];
		showSnackbar("已加入项目列表（记得点击底部保存提交）");
	}
	resetDraft();
}
</script>

<div class="projects-editor">
	<AdminCategoryEditor
		title="项目分类与 UI 图标管理"
		bind:categories
		{defaultCategories}
		defaultIconGroup="projects"
		onchange={onConfigChange}
	/>

	<div class="projects-editor__form">
		<div class="projects-editor__head">
			<strong>{editingIndex !== null ? `正在编辑项目 #${editingIndex + 1}` : "新增项目条目"}</strong>
			{#if editingIndex !== null}
				<Button variant="text" size="xsmall" label="取消编辑" onclick={resetDraft} />
			{/if}
		</div>

		<div class="projects-editor__grid">
			<TextField label="项目名称 (必需)" variant="outlined" bind:value={draftTitle} />
			<TextField label="唯一 Key (留空自动生成)" variant="outlined" bind:value={draftKey} />
			<label class="projects-editor__select-field">
				<span>所属分类</span>
				<select bind:value={draftCategory} aria-label="项目分类">
					{#each categories as cat (cat.key)}
						<option value={cat.key}>{cat.label} ({cat.key})</option>
					{/each}
					{#if draftCategory && !categoryMap.has(draftCategory)}
						<option value={draftCategory}>{draftCategory} (自定义)</option>
					{/if}
				</select>
			</label>
			<label class="projects-editor__select-field">
				<span>项目阶段</span>
				<select bind:value={draftPhase} aria-label="项目阶段">
					{#each Object.entries(phaseLabels) as [phase, label] (phase)}
						<option value={phase}>{label}</option>
					{/each}
				</select>
			</label>
			<TextField label="年份 / 区间 (如 2026)" variant="outlined" bind:value={draftYear} />
			<TextField label="演示 / 官网 URL" variant="outlined" bind:value={draftWebsite} />
			<TextField label="仓库 URL (GitHub 等)" variant="outlined" bind:value={draftRepository} />
		</div>

		<label class="projects-editor__textarea-field">
			<span>项目简介 (必需)</span>
			<textarea
				rows="2"
				bind:value={draftSummary}
				placeholder="简明介绍项目定位、特点或核心技术..."
			></textarea>
		</label>

		<AdminIconPicker
			label="无封面时的项目 UI 图标"
			defaultGroup="projects"
			bind:value={draftIcon}
		/>

		<div class="projects-editor__cover-box">
			<div class="projects-editor__grid">
				<TextField label="项目封面路径或图片 URL (可选)" variant="outlined" bind:value={draftCover} />
				<TextField label="封面替代文本 Cover Alt (可选)" variant="outlined" bind:value={draftCoverAlt} />
			</div>
			<div class="projects-editor__upload-row">
				<label class="projects-editor__upload-btn m3-state-layer">
					<Icon icon="material-symbols:cloud-upload-outline-rounded" aria-hidden="true" />
					<span>上传封面图 (自动压缩 WebP)</span>
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
						class="projects-editor__cover-preview"
						src={resolveCoverPreview(draftCover)}
						alt={draftCoverAlt || draftTitle || "封面预览"}
					/>
				{/if}
			</div>
		</div>

		<AdminTagInput
			bind:tags={draftTechnologies}
			label="技术栈与标签 (Technologies / Tags)"
			placeholder="输入技术名称后按回车或逗号添加"
			presets={PROJECT_TECH_PRESETS}
			existingTags={allExistingTechs}
		/>

		<div class="projects-editor__switches">
			<label class="projects-editor__switch">
				<Switch bind:checked={draftFeatured} label="代表项目" icons />
				<span>设为代表项目 (Featured 高亮徽章)</span>
			</label>
			<label class="projects-editor__switch">
				<Switch bind:checked={draftEnabled} label="前台启用显示" icons />
				<span>前台展示该项目</span>
			</label>
		</div>

		<div class="projects-editor__end-btn">
			<Button
				variant="tonal"
				size="small"
				icon={editingIndex !== null ? "material-symbols:check-circle-outline-rounded" : "material-symbols:add-rounded"}
				label={editingIndex !== null ? "保存项目修改" : "添加到项目列表"}
				onclick={commitItem}
			/>
		</div>
	</div>

	<div class="projects-editor__list">
		{#if items.length === 0}
			<p class="projects-editor__empty">当前暂无项目条目，可在上方添加（空列表时前台仅展示空状态）。</p>
		{:else}
			{#each items as item, idx (item.key + idx)}
				{@const cat = categoryMap.get(item.category)}
				<div class="projects-editor__row" class:projects-editor__row--disabled={item.enable === false}>
					<div class="projects-editor__row-main">
						{#if item.cover}
							<img
								class="projects-editor__thumb"
								src={resolveCoverPreview(item.cover)}
								alt=""
							/>
						{:else}
							<span class="projects-editor__thumb-icon" aria-hidden="true">
								<Icon icon={item.icon || "material-symbols:deployed-code-outline-rounded"} />
							</span>
						{/if}
						<div class="projects-editor__row-info">
							<div class="projects-editor__row-title">
								<strong>{item.title}</strong>
								<span class="projects-editor__badge">{phaseLabels[item.phase]}</span>
								{#if cat}
									<span class="projects-editor__badge">{cat.label}</span>
								{/if}
								{#if item.featured}
									<span class="projects-editor__badge projects-editor__badge--primary">Featured</span>
								{/if}
							</div>
							<p class="projects-editor__row-sub">{item.summary}</p>
							{#if item.technologies.length > 0}
								<div class="projects-editor__row-tags">
									{#each item.technologies as tech (tech)}
										<span>{tech}</span>
									{/each}
								</div>
							{/if}
						</div>
					</div>
					<div class="projects-editor__row-actions">
						<Button variant="text" size="xsmall" icon="material-symbols:edit-outline-rounded" label="编辑" onclick={() => startEdit(idx)} />
						<Button
							variant="text"
							size="xsmall"
							icon="material-symbols:arrow-upward-rounded"
							ariaLabel={`上移 ${item.title}`}
							disabled={idx === 0}
							onclick={() => (items = moveListItem(items, idx, -1))}
						/>
						<Button
							variant="text"
							size="xsmall"
							icon="material-symbols:arrow-downward-rounded"
							ariaLabel={`下移 ${item.title}`}
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
.projects-editor
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
		grid-template-columns: repeat(auto-fit, minmax(12.5rem, 1fr))
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
