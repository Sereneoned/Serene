<script lang="ts">
import Button from "@components/atoms/action/Button.svelte";
import type {
	AdminDataDomain,
	EditableCategory,
} from "@utils/admin/data-editors";
import {
	type AdminSession,
	getAdminSession,
	onAdminSessionChange,
} from "@utils/admin/session";
import { url } from "@utils/url-utils";
import { onMount } from "svelte";
import { adminConfig } from "@/config";

type DataPanelComponent = typeof import("./AdminDataPanel.svelte").default;

let {
	domain,
	label,
	initialConfigSnapshot,
}: {
	domain: AdminDataDomain;
	label: string;
	initialConfigSnapshot?: {
		timeline?: {
			order: "desc" | "asc";
			categories: EditableCategory[];
		};
		projects?: {
			categories: EditableCategory[];
		};
		games?: {
			categories: EditableCategory[];
		};
	};
} = $props();

let session = $state<AdminSession | null>(null);
let expanded = $state(false);
let loadingEditor = $state(false);
let loadError = $state("");
let EditorPanel = $state.raw<DataPanelComponent | null>(null);

async function loadEditorPanel() {
	if (EditorPanel) return;
	loadingEditor = true;
	loadError = "";
	try {
		const mod = await import("./AdminDataPanel.svelte");
		EditorPanel = mod.default;
	} catch (error) {
		loadError =
			error instanceof Error ? error.message : "加载前端编辑器失败，请稍后重试";
	} finally {
		loadingEditor = false;
	}
}

async function toggleEditor() {
	if (expanded) {
		expanded = false;
		return;
	}
	expanded = true;
	await loadEditorPanel();
}

onMount(() => {
	if (!adminConfig.enable) return;
	session = getAdminSession();
	return onAdminSessionChange((next) => {
		session = next;
		if (!next) expanded = false;
	});
});
</script>

{#if adminConfig.enable && session}
	<section class="section-admin-bar" aria-label={`${label}前端管理工具栏`}>
		<div class="section-admin-bar__row">
			<div class="section-admin-bar__meta">
				<strong>{label} · 前端编辑模式</strong>
				<span>
					可直接在此页可视增改条目、选择 UI 图标与管理标签，保存后提交到 {session.owner}/{session.repo}。
				</span>
			</div>
			<div class="section-admin-bar__actions">
				<Button
					variant="tonal"
					size="small"
					icon={expanded
						? "material-symbols:close-rounded"
						: "material-symbols:edit-outline-rounded"}
					label={expanded ? "收起前端编辑" : `在当前页编辑${label}`}
					onclick={toggleEditor}
				/>
				<Button
					variant="outlined"
					size="small"
					icon="material-symbols:open-in-new-rounded"
					label="前往完整管理台"
					href={url(`/admin/?tab=data&domain=${domain}`)}
				/>
			</div>
		</div>

		{#if expanded}
			<div class="section-admin-bar__drawer">
				{#if loadingEditor}
					<p class="section-admin-bar__note">正在加载{label}可视化编辑器...</p>
				{:else if loadError}
					<div class="section-admin-bar__error">
						<span>{loadError}</span>
						<Button variant="text" size="xsmall" label="重试" onclick={loadEditorPanel} />
					</div>
				{:else if EditorPanel}
					<p class="section-admin-bar__note">
						保存后将写入仓库并触发 GitHub Actions 自动构建（部署完成刷新即可看到最新结果）。
					</p>
					<EditorPanel
						{session}
						initialDomain={domain}
						singleDomain={true}
						{initialConfigSnapshot}
					/>
				{/if}
			</div>
		{/if}
	</section>
{/if}

<style lang="stylus">
.section-admin-bar
	display: flex
	flex-direction: column
	gap: 0.875rem
	padding: 0.875rem 1rem
	margin-bottom: 1.25rem
	border-radius: var(--shape-corner-l)
	border: 1px solid var(--outline-variant)
	background: var(--surface-container-low)

	&__row
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: 0.75rem

	&__meta
		display: flex
		flex-direction: column
		gap: 0.2rem
		min-width: 14rem

		strong
			font: var(--m3e-type-title-small)
			color: var(--on-surface)

		span
			font: var(--m3e-type-body-small)
			color: var(--on-surface-variant)

	&__actions
		display: flex
		flex-wrap: wrap
		align-items: center
		gap: 0.5rem

	&__drawer
		display: flex
		flex-direction: column
		gap: 0.75rem
		padding-top: 0.875rem
		border-top: 1px solid var(--outline-variant)

	&__note
		margin: 0
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

	&__error
		display: flex
		flex-wrap: wrap
		align-items: center
		gap: 0.5rem
		color: var(--error)
		font: var(--m3e-type-body-small)
</style>
