<script lang="ts">
import Button from "@components/atoms/action/Button.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import {
	type EditableCategory,
	ensureUniqueKey,
	moveListItem,
	type UiIconGroup,
} from "@utils/admin";
import AdminIconPicker from "./AdminIconPicker.svelte";

let {
	title,
	categories = $bindable<EditableCategory[]>([]),
	defaultCategories,
	defaultIconGroup,
	showDescription = false,
	showOrder = false,
	order = $bindable<"desc" | "asc">("desc"),
	onchange = () => {},
}: {
	title: string;
	categories?: EditableCategory[];
	defaultCategories: readonly EditableCategory[];
	defaultIconGroup: UiIconGroup;
	showDescription?: boolean;
	showOrder?: boolean;
	order?: "desc" | "asc";
	onchange?: () => void;
} = $props();

let open = $state(false);
let newLabel = $state("");
let newKey = $state("");
let newIcon = $state("material-symbols:category-outline-rounded");
let newDescription = $state("");

function addCategory() {
	const label = newLabel.trim();
	if (!label) return;
	const key = ensureUniqueKey(
		newKey.trim() || label,
		categories.map((c) => c.key),
		"category",
	);
	categories = [
		...categories,
		{
			key,
			label,
			...(newIcon.trim() ? { icon: newIcon.trim() } : {}),
			...(showDescription && newDescription.trim()
				? { description: newDescription.trim() }
				: {}),
		},
	];
	newLabel = "";
	newKey = "";
	newDescription = "";
	onchange();
}

function resetCategories() {
	categories = defaultCategories.map((c) => ({ ...c }));
	onchange();
}
</script>

<div class="cat-admin">
	<div class="cat-admin__bar">
		<div>
			<strong class="cat-admin__title">{title}</strong>
			<span class="cat-admin__summary">
				共 {categories.length} 个分类
				{#if showOrder}
					· 当前排序：{order === "asc" ? "最早在前 (asc)" : "最新在前 (desc)"}
				{/if}
			</span>
		</div>
		<div class="cat-admin__bar-actions">
			<Button
				variant={open ? "filled" : "outlined"}
				size="xsmall"
				icon="material-symbols:category-outline-rounded"
				label={open ? "收起分类设置" : "管理分类与 UI 图标"}
				onclick={() => (open = !open)}
			/>
		</div>
	</div>

	{#if open}
		<div class="cat-admin__panel">
			<p class="cat-admin__hint">
				此处的分类名称、UI 图标与顺序将同步写入 <code>src/data/json/admin-overrides.json</code>，无需手动修改配置源码。
			</p>

			{#if showOrder}
				<label class="cat-admin__order">
					<span>时间线排序方向：</span>
					<select
						bind:value={order}
						onchange={onchange}
						aria-label="时间线排序方向"
					>
						<option value="desc">最新事件在前（倒序 desc）</option>
						<option value="asc">最早事件在前（正序 asc）</option>
					</select>
				</label>
			{/if}

			<div class="cat-admin__list">
				{#each categories as cat, idx (idx)}
					<div class="cat-admin__row">
						<div class="cat-admin__row-fields">
							<TextField
								label="显示名称"
								variant="outlined"
								bind:value={cat.label}
								oninput={onchange}
							/>
							<TextField
								label="分类键名 (key)"
								variant="outlined"
								bind:value={cat.key}
								oninput={onchange}
							/>
							{#if showDescription}
								<label class="cat-admin__desc-field">
									<span>分类说明</span>
									<input
										type="text"
										value={cat.description ?? ""}
										oninput={(e) => {
											cat.description = (e.currentTarget as HTMLInputElement).value;
											onchange();
										}}
									/>
								</label>
							{/if}
						</div>

						<div class="cat-admin__row-icon">
							<AdminIconPicker
								label={`分类 "${cat.label || cat.key}" 的 UI 图标`}
								defaultGroup={defaultIconGroup}
								bind:value={cat.icon}
							/>
						</div>

						<div class="cat-admin__row-actions">
							<Button
								variant="text"
								size="xsmall"
								icon="material-symbols:arrow-upward-rounded"
								ariaLabel={`上移分类 ${cat.label}`}
								disabled={idx === 0}
								onclick={() => {
									categories = moveListItem(categories, idx, -1);
									onchange();
								}}
							/>
							<Button
								variant="text"
								size="xsmall"
								icon="material-symbols:arrow-downward-rounded"
								ariaLabel={`下移分类 ${cat.label}`}
								disabled={idx === categories.length - 1}
								onclick={() => {
									categories = moveListItem(categories, idx, 1);
									onchange();
								}}
							/>
							<Button
								variant="text"
								size="xsmall"
								icon="material-symbols:delete-outline-rounded"
								ariaLabel={`删除分类 ${cat.label}`}
								onclick={() => {
									categories = categories.filter((_, i) => i !== idx);
									onchange();
								}}
							/>
						</div>
					</div>
				{/each}
			</div>

			<div class="cat-admin__add">
				<strong class="cat-admin__add-title">新增分类</strong>
				<div class="cat-admin__row-fields">
					<TextField label="分类名称" variant="outlined" bind:value={newLabel} />
					<TextField label="键名 key (可选，留空自动生成)" variant="outlined" bind:value={newKey} />
					{#if showDescription}
						<TextField label="分类说明 (可选)" variant="outlined" bind:value={newDescription} />
					{/if}
				</div>
				<AdminIconPicker
					label="新分类 UI 图标"
					defaultGroup={defaultIconGroup}
					bind:value={newIcon}
				/>
				<div class="cat-admin__add-actions">
					<Button
						variant="text"
						size="xsmall"
						icon="material-symbols:refresh-rounded"
						label="恢复默认分类"
						onclick={resetCategories}
					/>
					<Button
						variant="tonal"
						size="small"
						icon="material-symbols:add-rounded"
						label="添加分类"
						onclick={addCategory}
					/>
				</div>
			</div>
		</div>
	{/if}
</div>

<style lang="stylus">
.cat-admin
	display: flex
	flex-direction: column
	gap: 0.75rem
	padding: 0.875rem 1rem
	border-radius: var(--shape-corner-m)
	border: 1px solid var(--outline-variant)
	background: var(--surface-container-low)

	&__bar
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: 0.5rem

	&__title
		display: block
		font: var(--m3e-type-title-small)
		color: var(--on-surface)

	&__summary
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

	&__bar-actions
		display: flex
		flex-wrap: wrap
		gap: 0.5rem

	&__panel
		display: flex
		flex-direction: column
		gap: 0.875rem
		padding-top: 0.75rem
		border-top: 1px solid var(--outline-variant)

	&__hint
		margin: 0
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

	&__order
		display: inline-flex
		align-items: center
		gap: 0.5rem
		font: var(--m3e-type-body-small)
		color: var(--on-surface)

		select
			padding: 0.4rem 0.65rem
			border-radius: var(--shape-corner-s)
			border: 1px solid var(--outline-variant)
			background: var(--surface-container-lowest)
			color: var(--on-surface)
			font: var(--m3e-type-body-small)

	&__list
		display: flex
		flex-direction: column
		gap: 0.625rem

	&__row
		display: flex
		flex-direction: column
		gap: 0.625rem
		padding: 0.75rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-lowest)

	&__row-fields
		display: grid
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr))
		gap: 0.625rem
		align-items: center

	&__desc-field
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
			background: var(--surface-container-low)
			color: var(--on-surface)
			font: var(--m3e-type-body-small)

	&__row-actions
		display: flex
		flex-wrap: wrap
		justify-content: flex-end
		gap: 0.25rem

	&__add
		display: flex
		flex-direction: column
		gap: 0.625rem
		padding: 0.75rem
		border-radius: var(--shape-corner-m)
		border: 1px dashed var(--outline-variant)
		background: var(--surface-container-lowest)

	&__add-title
		font: var(--m3e-type-label-large)
		color: var(--on-surface)

	&__add-actions
		display: flex
		flex-wrap: wrap
		justify-content: space-between
		gap: 0.5rem
</style>
