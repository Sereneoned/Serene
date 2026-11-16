<script lang="ts">
import Button from "@components/atoms/action/Button.svelte";
import Card from "@components/atoms/display/Card.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import Icon from "@iconify/svelte";
import {
	type AdminSession,
	type CommitProgress,
	clearStagedQueue,
	commitRepoChanges,
	flattenStagedChanges,
	getStagedQueue,
	listWorkflowRuns,
	onStagedQueueChange,
	removeStagedBatch,
	type StagedBatchItem,
	triggerWorkflowDispatch,
	type WorkflowRunInfo,
} from "@utils/admin";
import { showSnackbar } from "@utils/snackbar";
import { onMount } from "svelte";

let { session }: { session: AdminSession } = $props();

let stagedItems = $state<readonly StagedBatchItem[]>(getStagedQueue());
let commitMessage = $state("chore(admin): batch publish updates");
let committing = $state(false);
let progress = $state<CommitProgress | null>(null);
let lastCommitUrl = $state("");

let runs = $state<WorkflowRunInfo[]>([]);
let runsLoading = $state(false);
let runsError = $state("");
let triggering = $state(false);

async function refreshRuns() {
	runsLoading = true;
	runsError = "";
	try {
		runs = await listWorkflowRuns(session, 6);
	} catch (error) {
		runsError =
			error instanceof Error
				? error.message
				: "无法读取 Actions 状态（需 Token 开启 Actions 读权限）";
	} finally {
		runsLoading = false;
	}
}

async function handleCommitAll() {
	const changes = flattenStagedChanges();
	if (changes.length === 0) return;
	committing = true;
	progress = null;
	try {
		const res = await commitRepoChanges(
			session,
			commitMessage,
			changes,
			(p) => (progress = p),
		);
		lastCommitUrl = res.htmlUrl;
		clearStagedQueue();
		showSnackbar("已批量提交到 GitHub，Pages 正在自动构建", {
			icon: "material-symbols:check-circle-outline-rounded",
		});
		void refreshRuns();
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "提交失败，请重试", {
			icon: "material-symbols:error-outline-rounded",
		});
	} finally {
		committing = false;
	}
}

async function handleManualTrigger() {
	triggering = true;
	try {
		await triggerWorkflowDispatch(session, "pages.yml");
		showSnackbar("已触发 GitHub Pages 重新构建", {
			icon: "material-symbols:rocket-launch-outline-rounded",
		});
		setTimeout(() => void refreshRuns(), 1500);
	} catch (error) {
		showSnackbar(
			error instanceof Error
				? error.message
				: "手动触发失败（请确认仓库存在 .github/workflows/pages.yml 且 Token 含 Actions 写权限）",
			{ icon: "material-symbols:error-outline-rounded" },
		);
	} finally {
		triggering = false;
	}
}

function statusLabel(run: WorkflowRunInfo): string {
	if (run.status === "completed") {
		if (run.conclusion === "success") return "已上线";
		if (run.conclusion === "cancelled") return "已取消";
		return `失败 (${run.conclusion || "error"})`;
	}
	if (run.status === "in_progress") return "构建中...";
	if (run.status === "queued") return "排队中...";
	return run.status;
}

onMount(() => {
	stagedItems = getStagedQueue();
	const stop = onStagedQueueChange((items) => {
		stagedItems = items;
	});
	void refreshRuns();
	return stop;
});
</script>

<div class="deploy-panel">
	<Card color="var(--card-bg)" radius="l" class="p-5 md:p-6">
		<div class="deploy-panel__head">
			<div>
				<h2 class="deploy-panel__title">批量暂存发布队列 ({stagedItems.length})</h2>
				<p class="deploy-panel__sub">
					可将多个页面的改动先加入队列，再合并成单次 Git Commit 推送，减少 GitHub Actions 构建次数。
				</p>
			</div>
			{#if stagedItems.length > 0}
				<Button
					variant="text"
					size="xsmall"
					label="清空队列"
					onclick={clearStagedQueue}
				/>
			{/if}
		</div>

		{#if stagedItems.length === 0}
			<div class="deploy-panel__empty">
				<Icon icon="material-symbols:check-circle-outline-rounded" aria-hidden="true" />
				<span>当前没有暂存中的修改；各模块也支持直接点「立即发布」。</span>
			</div>
		{:else}
			<ul class="deploy-panel__list">
				{#each stagedItems as item (item.id)}
					<li class="deploy-panel__item">
						<div>
							<strong>{item.label}</strong>
							<span class="deploy-panel__meta">
								{item.changes.length} 个文件变更
							</span>
						</div>
						<Button
							variant="text"
							size="xsmall"
							icon="material-symbols:delete-outline-rounded"
							ariaLabel="移出队列"
							onclick={() => removeStagedBatch(item.id)}
						/>
					</li>
				{/each}
			</ul>

			<div class="deploy-panel__commit-bar">
				<TextField
					label="提交说明 (Commit Message)"
					variant="outlined"
					bind:value={commitMessage}
				/>
				<Button
					variant="filled"
					size="medium"
					icon="material-symbols:rocket-launch-outline-rounded"
					label={committing ? "正在提交..." : "一键提交队列并部署"}
					disabled={committing}
					onclick={handleCommitAll}
				/>
			</div>
		{/if}

		{#if progress}
			<p class="deploy-panel__progress">
				状态：{progress.phase} ({progress.completed}/{progress.total})
				{progress.currentPath ?? ""}
			</p>
		{/if}

		{#if lastCommitUrl}
			<p class="deploy-panel__last-commit">
				最近一次提交：
				<a href={lastCommitUrl} target="_blank" rel="noopener noreferrer">
					{lastCommitUrl}
				</a>
			</p>
		{/if}
	</Card>

	<Card color="var(--card-bg)" radius="l" class="p-5 md:p-6">
		<div class="deploy-panel__head">
			<div>
				<h2 class="deploy-panel__title">GitHub Actions 构建与部署状态</h2>
				<p class="deploy-panel__sub">
					目标仓库：{session.owner}/{session.repo} ({session.branch})
				</p>
			</div>
			<div class="deploy-panel__head-actions">
				<Button
					variant="outlined"
					size="xsmall"
					icon="material-symbols:refresh-rounded"
					label={runsLoading ? "刷新中..." : "刷新"}
					disabled={runsLoading}
					onclick={refreshRuns}
				/>
				<Button
					variant="tonal"
					size="xsmall"
					icon="material-symbols:rocket-launch-outline-rounded"
					label={triggering ? "触发中..." : "手动触发 Pages 构建"}
					disabled={triggering}
					onclick={handleManualTrigger}
				/>
			</div>
		</div>

		{#if runsError}
			<p class="deploy-panel__warn">{runsError}</p>
		{:else if runs.length === 0 && !runsLoading}
			<p class="deploy-panel__sub">
				暂无工作流运行记录。提交后 GitHub Actions 会自动触发 pages.yml 构建并上线。
			</p>
		{:else}
			<ul class="deploy-panel__runs">
				{#each runs as run (run.id)}
					<li class="deploy-panel__run">
						<div class="deploy-panel__run-main">
							<span class="deploy-panel__run-name">{run.name}</span>
							<span class="deploy-panel__run-msg">
								<code>{run.headSha}</code> {run.headMessage}
							</span>
						</div>
						<div class="deploy-panel__run-right">
							<span
								class="deploy-panel__status"
								class:deploy-panel__status--ok={run.conclusion === "success"}
								class:deploy-panel__status--fail={run.conclusion === "failure"}
							>
								{statusLabel(run)}
							</span>
							{#if run.htmlUrl}
								<a
									class="deploy-panel__log-link"
									href={run.htmlUrl}
									target="_blank"
									rel="noopener noreferrer"
								>
									日志
								</a>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Card>
</div>

<style lang="stylus">
.deploy-panel
	display: flex
	flex-direction: column
	gap: 1.25rem

	&__head
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: 0.75rem
		margin-bottom: 1rem

	&__head-actions
		display: flex
		flex-wrap: wrap
		gap: 0.5rem

	&__title
		margin: 0
		font: var(--m3e-type-title-medium)
		color: var(--on-surface)

	&__sub
		margin: 0.25rem 0 0
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

	&__empty
		display: flex
		align-items: center
		gap: 0.5rem
		padding: 1rem
		border-radius: var(--shape-corner-m)
		background: var(--surface-container-low)
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-medium)

	&__list,
	&__runs
		list-style: none
		padding: 0
		margin: 0
		display: flex
		flex-direction: column
		gap: 0.625rem

	&__item,
	&__run
		display: flex
		align-items: center
		justify-content: space-between
		gap: 0.75rem
		padding: 0.75rem 1rem
		border-radius: var(--shape-corner-m)
		background: var(--surface-container-low)

	&__meta
		margin-left: 0.5rem
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

	&__commit-bar
		display: flex
		flex-wrap: wrap
		gap: 0.75rem
		align-items: center
		margin-top: 1rem

		:global(.m3-text-field)
			flex: 1 1 16rem

	&__progress,
	&__last-commit,
	&__warn
		margin: 0.75rem 0 0
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

		a
			color: var(--primary)
			word-break: break-all

	&__run-main
		display: flex
		flex-direction: column
		min-width: 0

	&__run-name
		font: var(--m3e-type-label-large)
		color: var(--on-surface)

	&__run-msg
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)
		overflow: hidden
		text-overflow: ellipsis
		white-space: nowrap

	&__run-right
		display: flex
		align-items: center
		gap: 0.625rem
		flex-shrink: 0

	&__status
		padding: 0.2rem 0.625rem
		border-radius: var(--shape-corner-full)
		background: var(--secondary-container)
		color: var(--on-secondary-container)
		font: var(--m3e-type-label-small)

		&--ok
			background: var(--primary-container)
			color: var(--on-primary-container)

		&--fail
			background: var(--error-container)
			color: var(--on-error-container)

	&__log-link
		color: var(--primary)
		font: var(--m3e-type-label-medium)
		text-decoration: none

		&:hover
			text-decoration: underline
</style>
