<script lang="ts">
import Button from "@components/atoms/action/Button.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import Icon from "@iconify/svelte";
import {
	compressImageToWebP,
	createEmptyCompassShelf,
	ensureUniqueKey,
	moveListItem,
	normalizeCompassShelves,
	sanitizeUploadFilename,
} from "@utils/admin";
import { showSnackbar } from "@utils/snackbar";
import { url } from "@utils/url-utils";
import { onDestroy } from "svelte";
import type { CompassEntry, CompassShelf } from "@/data/compass";
import AdminIconPicker from "../AdminIconPicker.svelte";

let {
	shelves = $bindable<CompassShelf[]>([]),
	onUploadFile,
}: {
	shelves?: CompassShelf[];
	onUploadFile: (repoPath: string, bytes: Uint8Array) => void;
} = $props();

let selectedShelfIdx = $state(0);
let editingEntryIdx = $state<number | null>(null);

let entryLabel = $state("");
let entryHref = $state("");
let entryNote = $state("");
let entryIcon = $state("");
let entryImage = $state("");

let newShelfName = $state("");
let newShelfKey = $state("");
let newShelfBlurb = $state("");
let newShelfIcon = $state("material-symbols:explore-rounded");
let showNewShelfForm = $state(false);
let previewMap = $state<Record<string, string>>({});

const safeShelfIdx = $derived(
	shelves.length === 0 ? -1 : Math.min(selectedShelfIdx, shelves.length - 1),
);
const currentShelf = $derived(
	safeShelfIdx >= 0 ? shelves[safeShelfIdx] : undefined,
);

onDestroy(() => {
	for (const blobUrl of Object.values(previewMap)) {
		if (blobUrl.startsWith("blob:")) URL.revokeObjectURL(blobUrl);
	}
});

function resolveImagePreview(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return "";
	if (previewMap[trimmed]) return previewMap[trimmed];
	return trimmed.startsWith("/") ? url(trimmed) : trimmed;
}

function resetEntryForm() {
	editingEntryIdx = null;
	entryLabel = "";
	entryHref = "";
	entryNote = "";
	entryIcon = "";
	entryImage = "";
}

function selectShelf(index: number) {
	selectedShelfIdx = index;
	resetEntryForm();
}

function addShelf() {
	const name = newShelfName.trim();
	if (!name) {
		showSnackbar("请输入分组名称");
		return;
	}
	const key = ensureUniqueKey(
		newShelfKey.trim() || name,
		shelves.map((s) => s.key),
		"shelf",
	);
	const empty = createEmptyCompassShelf(shelves.map((s) => s.key));
	const created: CompassShelf = {
		...empty,
		key,
		name,
		...(newShelfIcon.trim() ? { icon: newShelfIcon.trim() } : {}),
		...(newShelfBlurb.trim() ? { blurb: newShelfBlurb.trim() } : {}),
		entries: [],
	};
	shelves = [...shelves, created];
	selectedShelfIdx = shelves.length - 1;
	resetEntryForm();
	newShelfName = "";
	newShelfKey = "";
	newShelfBlurb = "";
	newShelfIcon = "material-symbols:explore-rounded";
	showNewShelfForm = false;
	showSnackbar(`已新建分组「${name}」`);
}

function deleteShelf(index: number) {
	const removed = shelves[index];
	shelves = shelves.filter((_, idx) => idx !== index);
	selectedShelfIdx = Math.max(0, Math.min(index, shelves.length - 1));
	resetEntryForm();
	if (removed) showSnackbar(`已移除分组「${removed.name}」`);
}

function startEditEntry(index: number) {
	const entry = currentShelf?.entries[index];
	if (!entry) return;
	editingEntryIdx = index;
	entryLabel = entry.label;
	entryHref = entry.href;
	entryNote = entry.note ?? "";
	entryIcon = entry.icon ?? "";
	entryImage = entry.image ?? "";
}

async function handleImageUpload(file: File) {
	try {
		const compressed = await compressImageToWebP(file, {
			maxDimension: 256,
			quality: 0.9,
		});
		const base = sanitizeUploadFilename(
			entryLabel.trim() || file.name.replace(/\.[^.]+$/, ""),
			".webp",
		).replace(/\.[^.]+$/, "");
		const fileName = `${base}-${Date.now().toString(36).slice(-4)}.webp`;
		const repoPath = `public/images/compass/${fileName}`;
		const publicPath = `/images/compass/${fileName}`;
		onUploadFile(repoPath, compressed.bytes);

		const oldPreview = previewMap[publicPath];
		if (oldPreview?.startsWith("blob:")) URL.revokeObjectURL(oldPreview);
		const blobUrl = URL.createObjectURL(
			new Blob([compressed.bytes.buffer as ArrayBuffer], {
				type: "image/webp",
			}),
		);
		previewMap = { ...previewMap, [publicPath]: blobUrl };
		entryImage = publicPath;
		showSnackbar("站点图标图已压缩为 WebP，保存提交时生效");
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "图标上传失败");
	}
}

function commitEntry() {
	if (!currentShelf || safeShelfIdx < 0) {
		showSnackbar("请先新建或选择一个罗盘分组");
		return;
	}
	if (!entryLabel.trim() || !entryHref.trim()) {
		showSnackbar("请填写站点名称和链接 URL");
		return;
	}
	const built: CompassEntry = {
		label: entryLabel.trim(),
		href: entryHref.trim(),
		...(entryNote.trim() ? { note: entryNote.trim() } : {}),
		...(entryIcon.trim() ? { icon: entryIcon.trim() } : {}),
		...(entryImage.trim() ? { image: entryImage.trim() } : {}),
	};

	const nextEntries =
		editingEntryIdx !== null && editingEntryIdx < currentShelf.entries.length
			? currentShelf.entries.map((item, idx) =>
					idx === editingEntryIdx ? built : item,
				)
			: [...currentShelf.entries, built];

	shelves = normalizeCompassShelves(
		shelves.map((shelf, idx) =>
			idx === safeShelfIdx ? { ...shelf, entries: nextEntries } : shelf,
		),
	);
	showSnackbar(editingEntryIdx !== null ? "站点瓷砖已更新" : "站点已加入分组");
	resetEntryForm();
}

function moveEntryToShelf(entryIndex: number, targetShelfKey: string) {
	if (!currentShelf || safeShelfIdx < 0) return;
	const targetIdx = shelves.findIndex((s) => s.key === targetShelfKey);
	if (targetIdx < 0 || targetIdx === safeShelfIdx) return;
	const moving = currentShelf.entries[entryIndex];
	if (!moving) return;

	shelves = normalizeCompassShelves(
		shelves.map((shelf, idx) => {
			if (idx === safeShelfIdx) {
				return {
					...shelf,
					entries: shelf.entries.filter((_, i) => i !== entryIndex),
				};
			}
			if (idx === targetIdx) {
				return {
					...shelf,
					entries: [...shelf.entries, moving],
				};
			}
			return shelf;
		}),
	);
	if (editingEntryIdx === entryIndex) resetEntryForm();
}
</script>

<div class="compass-editor">
	<div class="compass-editor__shelves-bar">
		<div class="compass-editor__shelf-tabs" role="tablist" aria-label="站点罗盘分组">
			{#each shelves as shelf, idx (shelf.key + idx)}
				<button
					type="button"
					role="tab"
					aria-selected={safeShelfIdx === idx}
					class="compass-editor__shelf-tab"
					class:compass-editor__shelf-tab--active={safeShelfIdx === idx}
					onclick={() => selectShelf(idx)}
				>
					{#if shelf.icon}
						<Icon icon={shelf.icon} aria-hidden="true" />
					{/if}
					<span>{shelf.name}</span>
					<em>{shelf.entries.length}</em>
				</button>
			{/each}
		</div>
		<Button
			variant="tonal"
			size="xsmall"
			icon="material-symbols:add-rounded"
			label={showNewShelfForm ? "取消新增分组" : "新增罗盘分组"}
			onclick={() => (showNewShelfForm = !showNewShelfForm)}
		/>
	</div>

	{#if showNewShelfForm}
		<div class="compass-editor__box">
			<strong>新增站点罗盘分组 (Shelf)</strong>
			<div class="compass-editor__grid">
				<TextField label="分组名称 (如 开发工具)" variant="outlined" bind:value={newShelfName} />
				<TextField label="分组 Key (留空自动生成)" variant="outlined" bind:value={newShelfKey} />
				<TextField label="分组说明 blurb (可选)" variant="outlined" bind:value={newShelfBlurb} />
			</div>
			<AdminIconPicker label="分组 UI 图标" defaultGroup="compass" bind:value={newShelfIcon} />
			<div class="compass-editor__end-btn">
				<Button variant="tonal" size="small" icon="material-symbols:add-rounded" label="创建分组" onclick={addShelf} />
			</div>
		</div>
	{/if}

	{#if currentShelf && safeShelfIdx >= 0}
		<div class="compass-editor__box">
			<div class="compass-editor__box-head">
				<strong>当前分组设置：{currentShelf.name}</strong>
				<div class="compass-editor__inline-actions">
					<Button
						variant="text"
						size="xsmall"
						icon="material-symbols:arrow-upward-rounded"
						label="前移分组"
						disabled={safeShelfIdx === 0}
						onclick={() => {
							shelves = moveListItem(shelves, safeShelfIdx, -1);
							selectedShelfIdx = safeShelfIdx - 1;
						}}
					/>
					<Button
						variant="text"
						size="xsmall"
						icon="material-symbols:arrow-downward-rounded"
						label="后移分组"
						disabled={safeShelfIdx === shelves.length - 1}
						onclick={() => {
							shelves = moveListItem(shelves, safeShelfIdx, 1);
							selectedShelfIdx = safeShelfIdx + 1;
						}}
					/>
					<Button
						variant="text"
						size="xsmall"
						icon="material-symbols:delete-outline-rounded"
						label="删除分组"
						onclick={() => deleteShelf(safeShelfIdx)}
					/>
				</div>
			</div>

			<div class="compass-editor__grid">
				<TextField label="分组显示名称" variant="outlined" bind:value={shelves[safeShelfIdx].name} />
				<TextField label="分组键名 (key)" variant="outlined" bind:value={shelves[safeShelfIdx].key} />
				<label class="compass-editor__plain-field">
					<span>分组说明 (可选)</span>
					<input
						type="text"
						value={shelves[safeShelfIdx].blurb ?? ""}
						placeholder="简短介绍这一类常驻网站"
						oninput={(e) => {
							shelves[safeShelfIdx].blurb = (e.currentTarget as HTMLInputElement).value;
						}}
					/>
				</label>
			</div>

			<AdminIconPicker
				label="分组 UI 图标（同时作用于顶部筛选标签与标题栏）"
				defaultGroup="compass"
				bind:value={shelves[safeShelfIdx].icon}
			/>
		</div>

		<div class="compass-editor__box">
			<div class="compass-editor__box-head">
				<strong>
					{editingEntryIdx !== null
						? `正在编辑「${currentShelf.name}」的第 ${editingEntryIdx + 1} 个站点`
						: `在「${currentShelf.name}」中添加站点瓷砖`}
				</strong>
				{#if editingEntryIdx !== null}
					<Button variant="text" size="xsmall" label="取消编辑" onclick={resetEntryForm} />
				{/if}
			</div>

			<div class="compass-editor__grid">
				<TextField label="站点名称 (必需)" variant="outlined" bind:value={entryLabel} />
				<TextField label="站点网址 URL (https://...)" variant="outlined" bind:value={entryHref} />
				<TextField label="简短备注 note (留空显示域名)" variant="outlined" bind:value={entryNote} />
			</div>

			<AdminIconPicker
				label="站点 UI 图标（与下方自定义图片二选一，均留空时显示首字母方块）"
				defaultGroup="brands"
				bind:value={entryIcon}
			/>

			<div class="compass-editor__upload-wrap">
				<TextField label="自定义图标图片 URL 或路径 (优先于 Iconify)" variant="outlined" bind:value={entryImage} />
				<div class="compass-editor__upload-row">
					<label class="compass-editor__upload-btn m3-state-layer">
						<Icon icon="material-symbols:cloud-upload-outline-rounded" aria-hidden="true" />
						<span>上传本地网站 Logo (自动压成 WebP)</span>
						<input
							type="file"
							accept="image/*"
							hidden
							onchange={(e) => {
								const f = (e.currentTarget as HTMLInputElement).files?.[0];
								if (f) void handleImageUpload(f);
							}}
						/>
					</label>
					{#if entryImage.trim()}
						<img class="compass-editor__logo-preview" src={resolveImagePreview(entryImage)} alt={entryLabel || "站点图标预览"} />
					{/if}
				</div>
			</div>

			<div class="compass-editor__end-btn">
				<Button
					variant="tonal"
					size="small"
					icon={editingEntryIdx !== null ? "material-symbols:check-circle-outline-rounded" : "material-symbols:add-rounded"}
					label={editingEntryIdx !== null ? "保存站点修改" : "添加到当前分组"}
					onclick={commitEntry}
				/>
			</div>

			<div class="compass-editor__entries">
				{#if currentShelf.entries.length === 0}
					<p class="compass-editor__empty">该分组暂无站点，可在上方添加。</p>
				{:else}
					{#each currentShelf.entries as entry, idx (entry.label + entry.href + idx)}
						{@const resolvedImg = resolveImagePreview(entry.image || (entry.icon?.startsWith("/") || /^https?:\/\//.test(entry.icon ?? "") ? (entry.icon ?? "") : ""))}
						<div class="compass-editor__entry-row">
							<div class="compass-editor__entry-main">
								<span class="compass-editor__entry-icon" aria-hidden="true">
									{#if resolvedImg}
										<img src={resolvedImg} alt="" />
									{:else if entry.icon && /^[\w-]+:[\w-]+$/.test(entry.icon)}
										<Icon icon={entry.icon} />
									{:else}
										<em>{(entry.label.charAt(0) || "?").toUpperCase()}</em>
									{/if}
								</span>
								<div class="compass-editor__entry-info">
									<strong>{entry.label}</strong>
									<small>{entry.note || entry.href}</small>
								</div>
							</div>

							<div class="compass-editor__entry-actions">
								{#if shelves.length > 1}
									<select
										class="compass-editor__move-select"
										aria-label={`移动 ${entry.label} 到其他分组`}
										value={currentShelf.key}
										onchange={(e) => moveEntryToShelf(idx, (e.currentTarget as HTMLSelectElement).value)}
									>
										{#each shelves as targetShelf (targetShelf.key)}
											<option value={targetShelf.key}>移动到：{targetShelf.name}</option>
										{/each}
									</select>
								{/if}
								<Button variant="text" size="xsmall" icon="material-symbols:edit-outline-rounded" label="编辑" onclick={() => startEditEntry(idx)} />
								<Button
									variant="text"
									size="xsmall"
									icon="material-symbols:arrow-upward-rounded"
									ariaLabel={`上移 ${entry.label}`}
									disabled={idx === 0}
									onclick={() => {
										shelves = shelves.map((s, sIdx) =>
											sIdx === safeShelfIdx
												? { ...s, entries: moveListItem(s.entries, idx, -1) }
												: s,
										);
									}}
								/>
								<Button
									variant="text"
									size="xsmall"
									icon="material-symbols:arrow-downward-rounded"
									ariaLabel={`下移 ${entry.label}`}
									disabled={idx === currentShelf.entries.length - 1}
									onclick={() => {
										shelves = shelves.map((s, sIdx) =>
											sIdx === safeShelfIdx
												? { ...s, entries: moveListItem(s.entries, idx, 1) }
												: s,
										);
									}}
								/>
								<Button
									variant="text"
									size="xsmall"
									icon="material-symbols:delete-outline-rounded"
									label="删除"
									onclick={() => {
										if (editingEntryIdx === idx) resetEntryForm();
										shelves = shelves.map((s, sIdx) =>
											sIdx === safeShelfIdx
												? { ...s, entries: s.entries.filter((_, i) => i !== idx) }
												: s,
										);
									}}
								/>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	{:else}
		<p class="compass-editor__empty">当前暂无罗盘分组，请先点击右上角“新增罗盘分组”。</p>
	{/if}
</div>

<style lang="stylus">
.compass-editor
	display: flex
	flex-direction: column
	gap: 1rem

	&__shelves-bar
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: 0.75rem

	&__shelf-tabs
		display: flex
		flex-wrap: wrap
		gap: 0.45rem

	&__shelf-tab
		display: inline-flex
		align-items: center
		gap: 0.35rem
		padding: 0.4rem 0.75rem
		border-radius: var(--shape-corner-full)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		color: var(--on-surface)
		font: var(--m3e-type-label-medium)
		cursor: pointer

		> :global(svg)
			width: 1rem
			height: 1rem

		em
			font-style: normal
			padding: 0.05rem 0.35rem
			border-radius: var(--shape-corner-full)
			background: var(--surface-container-high)
			font: var(--m3e-type-label-small)

		&--active
			background: var(--primary-container)
			color: var(--on-primary-container)
			border-color: var(--primary)

	&__box
		display: flex
		flex-direction: column
		gap: 0.875rem
		padding: 1rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)

	&__box-head
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: 0.5rem
		font: var(--m3e-type-title-small)
		color: var(--on-surface)

	&__inline-actions
		display: flex
		flex-wrap: wrap
		gap: 0.25rem

	&__grid
		display: grid
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr))
		gap: 0.75rem
		align-items: center

	&__plain-field
		display: flex
		flex-direction: column
		gap: 0.2rem

		span
			font: var(--m3e-type-label-small)
			color: var(--on-surface-variant)

		input
			width: 100%
			box-sizing: border-box
			padding: 0.5rem 0.7rem
			border-radius: var(--shape-corner-s)
			border: 1px solid var(--outline-variant)
			background: var(--surface-container-lowest)
			color: var(--on-surface)
			font: var(--m3e-type-body-small)

	&__upload-wrap
		display: flex
		flex-direction: column
		gap: 0.5rem

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
		background: var(--surface-container-lowest)
		color: var(--primary)
		font: var(--m3e-type-label-medium)
		cursor: pointer

	&__logo-preview
		width: 2.25rem
		height: 2.25rem
		padding: 0.2rem
		border-radius: var(--shape-corner-s)
		object-fit: contain
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-lowest)

	&__end-btn
		display: flex
		justify-content: flex-end

	&__entries
		display: flex
		flex-direction: column
		gap: 0.5rem
		padding-top: 0.5rem
		border-top: 1px solid var(--outline-variant)

	&__empty
		margin: 0
		padding: 1rem
		text-align: center
		border-radius: var(--shape-corner-m)
		border: 1px dashed var(--outline-variant)
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)

	&__entry-row
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: 0.625rem
		padding: 0.65rem 0.85rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-lowest)

	&__entry-main
		display: flex
		align-items: center
		gap: 0.65rem
		flex: 1
		min-width: 0

	&__entry-icon
		display: inline-flex
		align-items: center
		justify-content: center
		width: 2.25rem
		height: 2.25rem
		flex-shrink: 0
		border-radius: var(--shape-corner-s)
		background: var(--surface-container-high)
		color: var(--primary)

		> :global(svg)
			width: 1.25rem
			height: 1.25rem

		> img
			width: 1.5rem
			height: 1.5rem
			object-fit: contain

		> em
			font-style: normal
			font: var(--m3e-type-title-small)

	&__entry-info
		display: flex
		flex-direction: column
		min-width: 0

		strong
			font: var(--m3e-type-body-medium)
			color: var(--on-surface)

		small
			font: var(--m3e-type-body-small)
			color: var(--on-surface-variant)
			overflow: hidden
			text-overflow: ellipsis
			white-space: nowrap

	&__entry-actions
		display: flex
		flex-wrap: wrap
		align-items: center
		gap: 0.25rem

	&__move-select
		padding: 0.3rem 0.5rem
		border-radius: var(--shape-corner-s)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		color: var(--on-surface)
		font: var(--m3e-type-label-small)
</style>
