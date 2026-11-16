<script lang="ts">
import Button from "@components/atoms/action/Button.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import Switch from "@components/atoms/selection/Switch.svelte";
import Icon from "@iconify/svelte";
import {
	collectTagsFromRecords,
	createEmptyTimelineItem,
	type EditableCategory,
	moveListItem,
	normalizeTimelineItems,
	TIMELINE_TAG_PRESETS,
} from "@utils/admin";
import { showSnackbar } from "@utils/snackbar";
import type { TimelineItem, TimelineLink } from "@/types/timelineConfig";
import AdminCategoryEditor from "../AdminCategoryEditor.svelte";
import AdminIconPicker from "../AdminIconPicker.svelte";
import AdminTagInput from "../AdminTagInput.svelte";

let {
	items = $bindable<TimelineItem[]>([]),
	categories = $bindable<EditableCategory[]>([]),
	defaultCategories,
	order = $bindable<"desc" | "asc">("desc"),
	onConfigChange = () => {},
}: {
	items?: TimelineItem[];
	categories?: EditableCategory[];
	defaultCategories: readonly EditableCategory[];
	order?: "desc" | "asc";
	onConfigChange?: () => void;
} = $props();

let editingIndex = $state<number | null>(null);
let draftTitle = $state("");
let draftDate = $state(createEmptyTimelineItem().date);
let draftCategory = $state("milestone");
let draftSubtitle = $state("");
let draftLocation = $state("");
let draftDescription = $state("");
let draftIcon = $state("");
let draftFeatured = $state(false);
let draftEnabled = $state(true);
let draftHighlights = $state<string[]>([]);
let draftHighlightInput = $state("");
let draftTags = $state<string[]>([]);
let draftLinks = $state<TimelineLink[]>([]);
let draftLinkLabel = $state("");
let draftLinkUrl = $state("");
let draftLinkIcon = $state("material-symbols:open-in-new-rounded");

const categoryMap = $derived(new Map(categories.map((cat) => [cat.key, cat])));

const allExistingTags = $derived(
	collectTagsFromRecords(items, (item) => item.tags),
);

function resetDraft() {
	editingIndex = null;
	const empty = createEmptyTimelineItem(categories[0]?.key ?? "milestone");
	draftTitle = "";
	draftDate = empty.date;
	draftCategory = empty.category ?? "milestone";
	draftSubtitle = "";
	draftLocation = "";
	draftDescription = "";
	draftIcon = "";
	draftFeatured = false;
	draftEnabled = true;
	draftHighlights = [];
	draftHighlightInput = "";
	draftTags = [];
	draftLinks = [];
	draftLinkLabel = "";
	draftLinkUrl = "";
	draftLinkIcon = "material-symbols:open-in-new-rounded";
}

function startEdit(index: number) {
	const target = items[index];
	if (!target) return;
	editingIndex = index;
	draftTitle = target.title;
	draftDate = target.date;
	draftCategory = target.category ?? categories[0]?.key ?? "milestone";
	draftSubtitle = target.subtitle ?? "";
	draftLocation = target.location ?? "";
	draftDescription = target.description ?? "";
	draftIcon = target.icon ?? "";
	draftFeatured = target.featured === true;
	draftEnabled = target.enable !== false;
	draftHighlights = [...(target.highlights ?? [])];
	draftHighlightInput = "";
	draftTags = [...(target.tags ?? [])];
	draftLinks = (target.links ?? []).map((l) => ({ ...l }));
	draftLinkLabel = "";
	draftLinkUrl = "";
	draftLinkIcon = "material-symbols:open-in-new-rounded";
}

function addHighlight() {
	const text = draftHighlightInput.trim();
	if (!text) return;
	draftHighlights = [...draftHighlights, text];
	draftHighlightInput = "";
}

function addLink() {
	const label = draftLinkLabel.trim();
	const url = draftLinkUrl.trim();
	if (!label || !url) {
		showSnackbar("请填写关联链接名称和 URL");
		return;
	}
	const icon = draftLinkIcon.trim();
	draftLinks = [...draftLinks, { label, url, ...(icon ? { icon } : {}) }];
	draftLinkLabel = "";
	draftLinkUrl = "";
	draftLinkIcon = "material-symbols:open-in-new-rounded";
}

function commitItem() {
	if (!draftTitle.trim() || !draftDate.trim()) {
		showSnackbar("请填写时间线事件标题与日期");
		return;
	}
	const candidate: TimelineItem = {
		...(draftEnabled ? {} : { enable: false }),
		title: draftTitle.trim(),
		date: draftDate.trim(),
		...(draftCategory.trim() ? { category: draftCategory.trim() } : {}),
		...(draftSubtitle.trim() ? { subtitle: draftSubtitle.trim() } : {}),
		...(draftLocation.trim() ? { location: draftLocation.trim() } : {}),
		...(draftDescription.trim()
			? { description: draftDescription.trim() }
			: {}),
		...(draftHighlights.length > 0 ? { highlights: draftHighlights } : {}),
		...(draftTags.length > 0 ? { tags: draftTags } : {}),
		...(draftLinks.length > 0 ? { links: draftLinks } : {}),
		...(draftIcon.trim() ? { icon: draftIcon.trim() } : {}),
		...(draftFeatured ? { featured: true } : {}),
	};
	const [normalized] = normalizeTimelineItems([candidate]);
	if (!normalized) return;

	if (
		editingIndex !== null &&
		editingIndex >= 0 &&
		editingIndex < items.length
	) {
		items = items.map((it, i) => (i === editingIndex ? normalized : it));
		showSnackbar("时间线节点已更新");
	} else {
		items = [normalized, ...items];
		showSnackbar("已添加到时间线列表（记得点击底部保存提交）");
	}
	resetDraft();
}
</script>

<div class="timeline-editor">
	<AdminCategoryEditor
		title="时间线分类、UI 图标与排序规则"
		bind:categories
		{defaultCategories}
		defaultIconGroup="timeline"
		showOrder={true}
		bind:order
		onchange={onConfigChange}
	/>

	<div class="timeline-editor__form">
		<div class="timeline-editor__form-head">
			<strong>{editingIndex !== null ? `正在编辑节点 #${editingIndex + 1}` : "新增时间线节点"}</strong>
			{#if editingIndex !== null}
				<Button variant="text" size="xsmall" label="取消编辑" onclick={resetDraft} />
			{/if}
		</div>

		<div class="timeline-editor__grid">
			<TextField label="事件标题 (必需)" variant="outlined" bind:value={draftTitle} />
			<TextField
				label="日期 / 区间 (如 2026.08 或 2025.03 – 至今)"
				variant="outlined"
				bind:value={draftDate}
			/>
			<label class="timeline-editor__select-field">
				<span>所属分类</span>
				<select bind:value={draftCategory} aria-label="时间线分类">
					{#each categories as cat (cat.key)}
						<option value={cat.key}>{cat.label} ({cat.key})</option>
					{/each}
					{#if draftCategory && !categoryMap.has(draftCategory)}
						<option value={draftCategory}>{draftCategory} (自定义)</option>
					{/if}
				</select>
			</label>
			<TextField label="副标题 / 学校 / 公司 / 角色" variant="outlined" bind:value={draftSubtitle} />
			<TextField label="地点 (如 Hangzhou, China)" variant="outlined" bind:value={draftLocation} />
		</div>

		<label class="timeline-editor__textarea-field">
			<span>详细描述</span>
			<textarea
				rows="3"
				bind:value={draftDescription}
				placeholder="补充事件背景、经历说明..."
			></textarea>
		</label>

		<AdminIconPicker
			label="节点自定义 UI 图标"
			defaultGroup="timeline"
			emptyText="留空时自动沿用所属分类的图标"
			bind:value={draftIcon}
		/>

		<div class="timeline-editor__subbox">
			<span class="timeline-editor__sublabel">成就 / 要点清单 (Highlights)</span>
			{#if draftHighlights.length > 0}
				<ul class="timeline-editor__highlights">
					{#each draftHighlights as hl, idx (idx)}
						<li>
							<span>{hl}</span>
							<div>
								<Button
									variant="text"
									size="xsmall"
									icon="material-symbols:arrow-upward-rounded"
									ariaLabel="上移要点"
									disabled={idx === 0}
									onclick={() => (draftHighlights = moveListItem(draftHighlights, idx, -1))}
								/>
								<Button
									variant="text"
									size="xsmall"
									icon="material-symbols:arrow-downward-rounded"
									ariaLabel="下移要点"
									disabled={idx === draftHighlights.length - 1}
									onclick={() => (draftHighlights = moveListItem(draftHighlights, idx, 1))}
								/>
								<Button
									variant="text"
									size="xsmall"
									icon="material-symbols:delete-outline-rounded"
									ariaLabel="删除要点"
									onclick={() => (draftHighlights = draftHighlights.filter((_, i) => i !== idx))}
								/>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
			<div class="timeline-editor__inline-add">
				<input
					type="text"
					bind:value={draftHighlightInput}
					placeholder="输入一条关键成果或要点，按回车添加"
					aria-label="新增时间线要点"
					onkeydown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							addHighlight();
						}
					}}
				/>
				<Button
					variant="tonal"
					size="xsmall"
					icon="material-symbols:add-rounded"
					label="添加要点"
					onclick={addHighlight}
				/>
			</div>
		</div>

		<AdminTagInput
			bind:tags={draftTags}
			label="技术栈 / 关联标签 (Tags)"
			presets={TIMELINE_TAG_PRESETS}
			existingTags={allExistingTags}
		/>

		<div class="timeline-editor__subbox">
			<span class="timeline-editor__sublabel">关联链接与链接图标 (Links)</span>
			{#if draftLinks.length > 0}
				<div class="timeline-editor__links-list">
					{#each draftLinks as lnk, idx (idx)}
						<div class="timeline-editor__link-item">
							<span class="timeline-editor__link-preview">
								<Icon icon={lnk.icon || "material-symbols:open-in-new-rounded"} aria-hidden="true" />
								<strong>{lnk.label}</strong>
								<small>{lnk.url}</small>
							</span>
							<Button
								variant="text"
								size="xsmall"
								icon="material-symbols:delete-outline-rounded"
								ariaLabel={`删除链接 ${lnk.label}`}
								onclick={() => (draftLinks = draftLinks.filter((_, i) => i !== idx))}
							/>
						</div>
					{/each}
				</div>
			{/if}
			<div class="timeline-editor__grid">
				<TextField label="链接名称 (如 GitHub 仓库)" variant="outlined" bind:value={draftLinkLabel} />
				<TextField label="链接 URL (https://...)" variant="outlined" bind:value={draftLinkUrl} />
			</div>
			<AdminIconPicker
				label="链接按钮 UI 图标"
				defaultGroup="brands"
				bind:value={draftLinkIcon}
			/>
			<div class="timeline-editor__end-btn">
				<Button
					variant="outlined"
					size="xsmall"
					icon="material-symbols:add-rounded"
					label="追加关联链接"
					onclick={addLink}
				/>
			</div>
		</div>

		<div class="timeline-editor__switches">
			<label class="timeline-editor__switch">
				<Switch bind:checked={draftFeatured} label="重点里程碑" icons />
				<span>重点里程碑 (Featured 高亮卡片)</span>
			</label>
			<label class="timeline-editor__switch">
				<Switch bind:checked={draftEnabled} label="前台启用显示" icons />
				<span>前台显示该节点</span>
			</label>
		</div>

		<div class="timeline-editor__end-btn">
			<Button
				variant="tonal"
				size="small"
				icon={editingIndex !== null ? "material-symbols:check-circle-outline-rounded" : "material-symbols:add-rounded"}
				label={editingIndex !== null ? "保存节点修改" : "添加到时间线"}
				onclick={commitItem}
			/>
		</div>
	</div>

	<div class="timeline-editor__list">
		{#if items.length === 0}
			<p class="timeline-editor__empty">当前暂无时间线节点，请在上方表单中添加。</p>
		{:else}
			{#each items as item, idx (item.title + item.date + idx)}
				{@const cat = item.category ? categoryMap.get(item.category) : undefined}
				{@const previewIcon = item.icon || cat?.icon || "material-symbols:flag-rounded"}
				<div class="timeline-editor__row" class:timeline-editor__row--disabled={item.enable === false}>
					<div class="timeline-editor__row-main">
						<span class="timeline-editor__row-icon" aria-hidden="true">
							<Icon icon={previewIcon} />
						</span>
						<div class="timeline-editor__row-info">
							<div class="timeline-editor__row-title">
								<strong>{item.title}</strong>
								<span class="timeline-editor__badge">{item.date}</span>
								{#if cat}
									<span class="timeline-editor__badge">{cat.label}</span>
								{/if}
								{#if item.featured}
									<span class="timeline-editor__badge timeline-editor__badge--primary">Featured</span>
								{/if}
								{#if item.enable === false}
									<span class="timeline-editor__badge">已隐藏</span>
								{/if}
							</div>
							{#if item.subtitle || item.location}
								<p class="timeline-editor__row-sub">
									{[item.subtitle, item.location].filter(Boolean).join(" · ")}
								</p>
							{/if}
							{#if item.tags && item.tags.length > 0}
								<div class="timeline-editor__row-tags">
									{#each item.tags as tag (tag)}
										<span>#{tag}</span>
									{/each}
								</div>
							{/if}
						</div>
					</div>
					<div class="timeline-editor__row-actions">
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
.timeline-editor
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

	&__form-head
		display: flex
		align-items: center
		justify-content: space-between
		gap: 0.5rem
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

	&__subbox
		display: flex
		flex-direction: column
		gap: 0.5rem
		padding: 0.75rem 0.875rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-lowest)

	&__sublabel
		font: var(--m3e-type-label-large)
		color: var(--on-surface)

	&__highlights
		display: flex
		flex-direction: column
		gap: 0.375rem
		margin: 0
		padding: 0
		list-style: none

		li
			display: flex
			align-items: center
			justify-content: space-between
			gap: 0.5rem
			padding: 0.4rem 0.625rem
			border-radius: var(--shape-corner-s)
			background: var(--surface-container-low)
			font: var(--m3e-type-body-small)
			color: var(--on-surface)

			div
				display: inline-flex
				flex-shrink: 0

	&__inline-add
		display: flex
		flex-wrap: wrap
		align-items: center
		gap: 0.5rem

		input
			flex: 1
			min-width: 12rem
			box-sizing: border-box
			padding: 0.45rem 0.75rem
			border-radius: var(--shape-corner-s)
			border: 1px solid var(--outline-variant)
			background: var(--surface-container-low)
			color: var(--on-surface)
			font: var(--m3e-type-body-small)

	&__links-list
		display: flex
		flex-direction: column
		gap: 0.375rem

	&__link-item
		display: flex
		align-items: center
		justify-content: space-between
		gap: 0.5rem
		padding: 0.4rem 0.625rem
		border-radius: var(--shape-corner-s)
		background: var(--surface-container-low)

	&__link-preview
		display: inline-flex
		flex-wrap: wrap
		align-items: center
		gap: 0.4rem
		min-width: 0
		font: var(--m3e-type-body-small)
		color: var(--on-surface)

		small
			color: var(--on-surface-variant)
			word-break: break-all

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

	&__row-icon
		display: inline-flex
		align-items: center
		justify-content: center
		width: 2.25rem
		height: 2.25rem
		flex-shrink: 0
		border-radius: var(--shape-corner-m)
		background: var(--primary-container)
		color: var(--on-primary-container)

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
			font: var(--m3e-type-label-small)
			color: var(--primary)

	&__row-actions
		display: flex
		flex-wrap: wrap
		align-items: center
		gap: 0.25rem
</style>
