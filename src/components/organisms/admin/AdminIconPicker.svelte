<script lang="ts">
import Button from "@components/atoms/action/Button.svelte";
import Icon from "@iconify/svelte";
import {
	UI_ICON_GROUP_LABELS,
	UI_ICON_PRESETS,
	type UiIconGroup,
} from "@utils/admin";
import { localIconCollections } from "@/generated/local-icon-collections";

const bundledIconSet = new Set<string>();
for (const collection of localIconCollections as ReadonlyArray<{
	prefix: string;
	icons?: Record<string, unknown>;
	aliases?: Record<string, unknown>;
}>) {
	for (const name of Object.keys(collection.icons ?? {})) {
		bundledIconSet.add(`${collection.prefix}:${name}`);
	}
	for (const name of Object.keys(collection.aliases ?? {})) {
		bundledIconSet.add(`${collection.prefix}:${name}`);
	}
}

let {
	value = $bindable(""),
	label = "UI 图标",
	defaultGroup = "all" as UiIconGroup | "all",
	allowEmpty = true,
	emptyText = "留空使用默认图标",
	placeholder = "输入图标名 (如 material-symbols:code-rounded) 或点击右侧选择",
}: {
	value?: string;
	label?: string;
	defaultGroup?: UiIconGroup | "all";
	allowEmpty?: boolean;
	emptyText?: string;
	placeholder?: string;
} = $props();

let open = $state(false);
let selectedGroup = $state<UiIconGroup | "all">("all");
let query = $state("");

const groupTabs: Array<{ id: UiIconGroup | "all"; label: string }> = [
	{ id: "all", label: "全部图标" },
	...(Object.entries(UI_ICON_GROUP_LABELS) as Array<[UiIconGroup, string]>).map(
		([id, text]) => ({ id, label: text }),
	),
];

const trimmedValue = $derived((value ?? "").trim());
const isBundled = $derived(
	trimmedValue.length > 0 && bundledIconSet.has(trimmedValue),
);
const isImageUrl = $derived(
	/^(https?:\/\/|\/|data:)/i.test(trimmedValue) &&
		!/^[a-z][a-z0-9-]*:[a-z0-9-]+$/i.test(trimmedValue),
);

const filteredPresets = $derived.by(() => {
	const q = query.trim().toLowerCase();
	return UI_ICON_PRESETS.filter((item) => {
		if (!q && selectedGroup !== "all" && item.group !== selectedGroup) {
			return false;
		}
		if (!q) return true;
		return (
			item.label.toLowerCase().includes(q) ||
			item.icon.toLowerCase().includes(q) ||
			item.keywords.toLowerCase().includes(q)
		);
	});
});

function selectIcon(iconName: string) {
	value = iconName;
	open = false;
}
</script>

<div class="icon-picker">
	<div class="icon-picker__row">
		<div class="icon-picker__preview" aria-hidden="true">
			{#if isBundled}
				<Icon icon={trimmedValue} />
			{:else if isImageUrl}
				<img src={trimmedValue} alt="" />
			{:else}
				<Icon icon="material-symbols:category-outline-rounded" />
			{/if}
		</div>

		<label class="icon-picker__input-wrap">
			<span class="icon-picker__label">{label}</span>
			<input
				type="text"
				class="icon-picker__input"
				bind:value
				{placeholder}
				aria-label={label}
			/>
		</label>

		<div class="icon-picker__btns">
			<Button
				variant={open ? "filled" : "tonal"}
				size="xsmall"
				icon="material-symbols:apps-rounded"
				label={open ? "收起图标库" : "选择图标"}
				onclick={() => {
					if (!open && !query) selectedGroup = defaultGroup;
					open = !open;
				}}
			/>
			{#if allowEmpty && trimmedValue}
				<Button
					variant="text"
					size="xsmall"
					label="清空"
					onclick={() => (value = "")}
				/>
			{/if}
		</div>
	</div>

	<p class="icon-picker__status">
		{#if !trimmedValue}
			<span>{emptyText}</span>
		{:else if isBundled}
			<span class="icon-picker__ok">✓ 已预打包离线图标（{trimmedValue}），可立即预览与发布</span>
		{:else if isImageUrl}
			<span class="icon-picker__ok">✓ 已识别为图片路径/外链，将直接以图片展示</span>
		{:else}
			<span class="icon-picker__warn">
				⚠ 非预置图标名：提交后会在 GitHub Actions 构建时打包，请确保拼写存在于
				material-symbols / fa7-brands / fa7-solid / simple-icons
			</span>
		{/if}
	</p>

	{#if open}
		<div class="icon-picker__drawer">
			<div class="icon-picker__toolbar">
				<div class="icon-picker__groups" role="tablist" aria-label="图标分类">
					{#each groupTabs as grp (grp.id)}
						<button
							type="button"
							role="tab"
							aria-selected={selectedGroup === grp.id}
							class="icon-picker__group-btn"
							class:icon-picker__group-btn--active={selectedGroup === grp.id}
							onclick={() => (selectedGroup = grp.id)}
						>
							{grp.label}
						</button>
					{/each}
				</div>

				<input
					type="search"
					class="icon-picker__search"
					bind:value={query}
					placeholder="搜索中文含义或英文名，如：游戏、github、里程碑..."
					aria-label="搜索预置 UI 图标"
				/>
			</div>

			{#if filteredPresets.length === 0}
				<p class="icon-picker__empty">没有匹配的预置图标，可清空搜索词或直接输入完整 Iconify 名称。</p>
			{:else}
				<div class="icon-picker__grid">
					{#each filteredPresets as preset (preset.icon + preset.group)}
						<button
							type="button"
							class="icon-picker__item m3-state-layer"
							class:icon-picker__item--selected={trimmedValue === preset.icon}
							title={`${preset.label} (${preset.icon})`}
							onclick={() => selectIcon(preset.icon)}
						>
							<Icon icon={preset.icon} aria-hidden="true" />
							<span>{preset.label}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style lang="stylus">
.icon-picker
	display: flex
	flex-direction: column
	gap: 0.375rem

	&__row
		display: flex
		flex-wrap: wrap
		align-items: center
		gap: 0.625rem

	&__preview
		display: flex
		align-items: center
		justify-content: center
		width: 2.5rem
		height: 2.5rem
		flex-shrink: 0
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		color: var(--primary)

		> :global(svg)
			width: 1.35rem
			height: 1.35rem

		> img
			width: 1.75rem
			height: 1.75rem
			object-fit: contain

	&__input-wrap
		display: flex
		flex-direction: column
		flex: 1
		min-width: 12rem
		gap: 0.2rem

	&__label
		font: var(--m3e-type-label-small)
		color: var(--on-surface-variant)

	&__input
		width: 100%
		box-sizing: border-box
		padding: 0.45rem 0.7rem
		border-radius: var(--shape-corner-s)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		color: var(--on-surface)
		font: var(--m3e-type-body-small)

	&__btns
		display: flex
		align-items: center
		gap: 0.375rem

	&__status
		margin: 0
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

	&__ok
		color: var(--primary)

	&__warn
		color: var(--tertiary)

	&__drawer
		display: flex
		flex-direction: column
		gap: 0.75rem
		margin-top: 0.25rem
		padding: 0.875rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-lowest)

	&__toolbar
		display: flex
		flex-direction: column
		gap: 0.5rem

	&__groups
		display: flex
		flex-wrap: wrap
		gap: 0.375rem

	&__group-btn
		padding: 0.25rem 0.625rem
		border-radius: var(--shape-corner-full)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-medium)
		cursor: pointer

		&--active
			background: var(--primary-container)
			color: var(--on-primary-container)
			border-color: var(--primary)

	&__search
		width: 100%
		box-sizing: border-box
		padding: 0.45rem 0.75rem
		border-radius: var(--shape-corner-s)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		color: var(--on-surface)
		font: var(--m3e-type-body-small)

	&__grid
		display: grid
		grid-template-columns: repeat(auto-fill, minmax(6.75rem, 1fr))
		gap: 0.5rem
		max-height: 15.5rem
		overflow-y: auto
		padding: 0.125rem

	&__item
		display: flex
		flex-direction: column
		align-items: center
		justify-content: center
		gap: 0.3rem
		padding: 0.55rem 0.4rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		color: var(--on-surface)
		font: var(--m3e-type-label-small)
		cursor: pointer
		text-align: center

		> :global(svg)
			width: 1.35rem
			height: 1.35rem
			color: var(--primary)

		span
			overflow: hidden
			text-overflow: ellipsis
			white-space: nowrap
			max-width: 100%

		&--selected
			background: var(--primary-container)
			color: var(--on-primary-container)
			border-color: var(--primary)

	&__empty
		margin: 0.25rem 0
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)
</style>
