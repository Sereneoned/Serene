<script lang="ts">
import Button from "@components/atoms/action/Button.svelte";
import Chips from "@components/atoms/action/Chips.svelte";
import Icon from "@iconify/svelte";
import {
	mergeUniqueTags,
	parseTagTokens,
	removeTagValue,
	toggleTagValue,
} from "@utils/admin";

let {
	tags = $bindable<string[]>([]),
	label = "标签 (Tags)",
	placeholder = "输入标签后按回车或逗号添加",
	presets = [] as readonly string[],
	existingTags = [] as readonly string[],
	suggestionLabel = "推荐 / 已有标签（点击快速开关）",
}: {
	tags?: string[];
	label?: string;
	placeholder?: string;
	presets?: readonly string[];
	existingTags?: readonly string[];
	suggestionLabel?: string;
} = $props();

let draft = $state("");

const currentChips = $derived(
	tags.map((tag) => ({
		value: tag,
		label: tag,
		leadingIcon: "material-symbols:tag-rounded",
		removable: true,
	})),
);

const activeTagSet = $derived(
	new Set(tags.map((tag) => tag.trim().toLowerCase())),
);

const combinedSuggestions = $derived(mergeUniqueTags(existingTags, presets));

function commitDraft() {
	const parsed = parseTagTokens(draft);
	if (parsed.length === 0) return;
	tags = mergeUniqueTags(tags, parsed);
	draft = "";
}

function handleDraftInput() {
	if (/[,，\n]/.test(draft)) {
		commitDraft();
	}
}
</script>

<div class="tag-editor">
	<span class="tag-editor__label">{label}</span>

	{#if currentChips.length > 0}
		<div class="tag-editor__current">
			<Chips
				items={currentChips}
				variant="input"
				onremove={(item) => {
					tags = removeTagValue(tags, item.value);
				}}
			/>
		</div>
	{:else}
		<p class="tag-editor__empty">暂无标签，请在下方输入或点击推荐标签添加。</p>
	{/if}

	<div class="tag-editor__input-row">
		<input
			type="text"
			class="tag-editor__input"
			bind:value={draft}
			{placeholder}
			aria-label={label}
			oninput={handleDraftInput}
			onkeydown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					commitDraft();
				}
			}}
		/>
		<Button
			variant="tonal"
			size="xsmall"
			icon="material-symbols:add-rounded"
			label="添加标签"
			onclick={commitDraft}
		/>
	</div>

	{#if combinedSuggestions.length > 0}
		<div class="tag-editor__suggestions">
			<span class="tag-editor__suggest-title">{suggestionLabel}：</span>
			<div class="tag-editor__suggest-list">
				{#each combinedSuggestions as suggestion (suggestion)}
					{@const active = activeTagSet.has(suggestion.toLowerCase())}
					<button
						type="button"
						class="tag-editor__pill m3-state-layer"
						class:tag-editor__pill--active={active}
						aria-pressed={active}
						onclick={() => {
							tags = toggleTagValue(tags, suggestion);
						}}
					>
						{#if active}
							<Icon icon="material-symbols:check-circle-outline-rounded" aria-hidden="true" />
						{/if}
						<span>{suggestion}</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style lang="stylus">
.tag-editor
	display: flex
	flex-direction: column
	gap: 0.5rem
	padding: 0.75rem 0.875rem
	border-radius: var(--shape-corner-m)
	border: 1px solid var(--outline-variant)
	background: var(--surface-container-lowest)

	&__label
		font: var(--m3e-type-label-large)
		color: var(--on-surface)

	&__empty
		margin: 0
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

	&__input-row
		display: flex
		flex-wrap: wrap
		align-items: center
		gap: 0.5rem

	&__input
		flex: 1
		min-width: 12rem
		box-sizing: border-box
		padding: 0.45rem 0.75rem
		border-radius: var(--shape-corner-s)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		color: var(--on-surface)
		font: var(--m3e-type-body-small)

	&__suggestions
		display: flex
		flex-direction: column
		gap: 0.375rem

	&__suggest-title
		font: var(--m3e-type-label-small)
		color: var(--on-surface-variant)

	&__suggest-list
		display: flex
		flex-wrap: wrap
		gap: 0.375rem

	&__pill
		display: inline-flex
		align-items: center
		gap: 0.25rem
		padding: 0.22rem 0.6rem
		border-radius: var(--shape-corner-full)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-medium)
		cursor: pointer

		> :global(svg)
			width: 0.9rem
			height: 0.9rem

		&--active
			background: var(--primary-container)
			color: var(--on-primary-container)
			border-color: var(--primary)
</style>
