<script lang="ts">
import Button from "@components/atoms/action/Button.svelte";
import Card from "@components/atoms/display/Card.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import Switch from "@components/atoms/selection/Switch.svelte";
import Icon from "@iconify/svelte";
import {
	type AdminSession,
	inferGitHubRepoSuggestion,
	setAdminSession,
	verifyGitHubSession,
} from "@utils/admin";
import { showSnackbar } from "@utils/snackbar";

let {
	defaultRepo = "",
	defaultBranch = "main",
	defaultContentPrefix = "",
	githubProfileUrl = "",
	compact = false,
	onSuccess,
}: {
	defaultRepo?: string;
	defaultBranch?: string;
	defaultContentPrefix?: string;
	githubProfileUrl?: string;
	compact?: boolean;
	onSuccess?: (session: AdminSession) => void;
} = $props();

const suggestedRepo = $derived(
	inferGitHubRepoSuggestion(defaultRepo, githubProfileUrl),
);

let repoInput = $state("");
let branchInput = $state("main");
let contentPrefixInput = $state("");
let tokenInput = $state("");
let rememberDevice = $state(true);
let showToken = $state(false);
let showAdvanced = $state(false);
let showGuide = $state(false);
let loading = $state(false);
let errorMessage = $state("");

$effect(() => {
	if (!repoInput && suggestedRepo) {
		repoInput = suggestedRepo;
	}
	if (defaultBranch && branchInput === "main" && defaultBranch !== "main") {
		branchInput = defaultBranch;
	}
	if (!contentPrefixInput && defaultContentPrefix) {
		contentPrefixInput = defaultContentPrefix;
	}
});

async function handleSubmit(event: SubmitEvent) {
	event.preventDefault();
	errorMessage = "";

	const cleanRepo = repoInput
		.trim()
		.replace(/^https?:\/\/github\.com\//i, "")
		.replace(/\.git$/i, "")
		.replace(/^\/+|\/+$/g, "");
	const parts = cleanRepo.split("/").filter(Boolean);
	if (parts.length !== 2) {
		errorMessage = "仓库格式需为 owner/repo（例如：YourName/Shirone）";
		return;
	}

	const [owner, repo] = parts;
	const branch = branchInput.trim() || "main";
	const token = tokenInput.trim();
	if (!token) {
		errorMessage = "请输入具有仓库读写权限的 GitHub Token";
		return;
	}

	loading = true;
	try {
		const verified = await verifyGitHubSession({
			token,
			owner,
			repo,
			branch,
		});
		const session: AdminSession = {
			owner,
			repo,
			branch,
			contentPrefix: contentPrefixInput.trim().replace(/^\/+|\/+$/g, ""),
			token,
			user: verified.user,
			remember: rememberDevice,
			verifiedAt: new Date().toISOString(),
		};
		setAdminSession(session);
		showSnackbar(`欢迎回来，${verified.user.name || verified.user.login}`, {
			icon: "material-symbols:check-circle-outline-rounded",
		});
		onSuccess?.(session);
	} catch (error) {
		errorMessage =
			error instanceof Error ? error.message : "验证失败，请检查仓库与 Token";
	} finally {
		loading = false;
	}
}
</script>

<Card
	color="var(--card-bg)"
	radius="l"
	class={compact ? "p-1" : "p-6 md:p-8"}
>
<div class="admin-login">
	<div class="admin-login__header">
		<div class="admin-login__badge">
			<Icon icon="material-symbols:admin-panel-settings-outline-rounded" />
		</div>
		<div>
			<h2 class="admin-login__title">管理员身份认证</h2>
			<p class="admin-login__desc">
				使用你的 GitHub 仓库权限登录。凭据仅缓存在你自己的浏览器中，提交后自动触发 GitHub Pages 构建。
			</p>
		</div>
	</div>

	<form class="admin-login__form" onsubmit={handleSubmit}>
		<TextField
			label="GitHub 仓库 (owner/repo)"
			placeholder="例如：username/Shirone"
			variant="outlined"
			bind:value={repoInput}
		>
			<Icon slot="leading" icon="fa7-brands:github" aria-hidden="true" />
		</TextField>

		<div class="admin-login__token-row">
			<TextField
				type={showToken ? "text" : "password"}
				label="GitHub Personal Access Token"
				placeholder="github_pat_... 或 ghp_..."
				variant="outlined"
				bind:value={tokenInput}
			>
				<Icon slot="leading" icon="material-symbols:key-outline-rounded" aria-hidden="true" />
				<button
					slot="trailing"
					type="button"
					class="admin-login__eye"
					aria-label={showToken ? "隐藏 Token" : "显示 Token"}
					onclick={() => (showToken = !showToken)}
				>
					<Icon
						icon={showToken
							? "material-symbols:visibility-off-outline-rounded"
							: "material-symbols:visibility-outline-rounded"}
					/>
				</button>
			</TextField>
		</div>

		<div class="admin-login__toggles">
			<label class="admin-login__remember">
				<Switch bind:checked={rememberDevice} label="在此设备上记住登录" icons />
				<span>在此设备上记住登录（关闭浏览器后仍保持管理员模式）</span>
			</label>

			<button
				type="button"
				class="admin-login__link-btn"
				onclick={() => (showAdvanced = !showAdvanced)}
			>
				{showAdvanced ? "收起分支/双仓设置" : "分支与双仓高级设置"}
			</button>
		</div>

		{#if showAdvanced}
			<div class="admin-login__advanced">
				<TextField
					label="目标分支 (Branch)"
					placeholder="main"
					variant="outlined"
					bind:value={branchInput}
				/>
				<TextField
					label="内容前缀路径 (单仓留空)"
					placeholder="单仓默认留空，双仓填目录前缀"
					variant="outlined"
					bind:value={contentPrefixInput}
				/>
			</div>
		{/if}

		{#if errorMessage}
			<div class="admin-login__error" role="alert">
				<Icon icon="material-symbols:error-outline-rounded" aria-hidden="true" />
				<span>{errorMessage}</span>
			</div>
		{/if}

		<div class="admin-login__actions">
			<Button
				type="submit"
				variant="filled"
				size="medium"
				icon="material-symbols:login-rounded"
				label={loading ? "正在验证仓库权限..." : "验证并进入管理员模式"}
				disabled={loading}
				full
			/>
		</div>
	</form>

	<div class="admin-login__guide">
		<button
			type="button"
			class="admin-login__guide-toggle"
			onclick={() => (showGuide = !showGuide)}
		>
			<Icon icon="material-symbols:key-outline-rounded" aria-hidden="true" />
			<span>{showGuide ? "收起 Token 获取教程" : "没有 Token？1 分钟获取 Fine-grained Token 教程"}</span>
		</button>

		{#if showGuide}
			<ol class="admin-login__guide-steps">
				<li>
					打开
					<a
						href="https://github.com/settings/personal-access-tokens/new"
						target="_blank"
						rel="noopener noreferrer"
					>
						GitHub Fine-grained Tokens 页面
					</a>
					，填写一个 Token 名称并选择过期时间。
				</li>
				<li>
					在 <strong>Repository access</strong> 选择 <strong>Only select repositories</strong>，只勾选你的博客仓库。
				</li>
				<li>
					在 <strong>Permissions → Repository permissions</strong> 中开启：
					<code>Contents: Read and write</code>（必需，用于提交内容），以及可选的
					<code>Actions: Read and write</code>（用于查看 GitHub Pages 部署进度）。
				</li>
				<li>生成后复制以 <code>github_pat_</code> 开头的令牌粘贴到上方即可。</li>
			</ol>
		{/if}
	</div>
</div>
</Card>

<style lang="stylus">
.admin-login
	display: flex
	flex-direction: column
	gap: 1.25rem

	&--compact
		padding: 0.25rem

	&__header
		display: flex
		align-items: flex-start
		gap: 1rem

	&__badge
		display: grid
		place-items: center
		width: 3rem
		height: 3rem
		flex-shrink: 0
		border-radius: var(--shape-corner-m)
		background: var(--primary-container)
		color: var(--on-primary-container)
		font-size: 1.5rem

	&__title
		margin: 0
		font: var(--m3e-type-title-large)
		color: var(--on-surface)

	&__desc
		margin: 0.25rem 0 0
		font: var(--m3e-type-body-medium)
		color: var(--on-surface-variant)

	&__form
		display: flex
		flex-direction: column
		gap: 1rem

	&__eye
		display: inline-flex
		align-items: center
		justify-content: center
		border: 0
		background: transparent
		color: var(--on-surface-variant)
		cursor: pointer
		padding: 0.25rem
		border-radius: var(--shape-corner-s)
		font-size: 1.25rem

		&:hover
			color: var(--on-surface)

	&__toggles
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: 0.75rem

	&__remember
		display: inline-flex
		align-items: center
		gap: 0.625rem
		font: var(--m3e-type-body-medium)
		color: var(--on-surface)
		cursor: pointer

	&__link-btn
		border: 0
		background: transparent
		color: var(--primary)
		font: var(--m3e-type-label-large)
		cursor: pointer
		padding: 0.25rem 0.5rem
		border-radius: var(--shape-corner-s)

		&:hover
			background: unquote("color-mix(in oklab, var(--primary) 8%, transparent)")

	&__advanced
		display: grid
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr))
		gap: 0.875rem
		padding: 1rem
		border-radius: var(--shape-corner-m)
		background: var(--surface-container-low)

	&__error
		display: flex
		align-items: center
		gap: 0.5rem
		padding: 0.75rem 1rem
		border-radius: var(--shape-corner-m)
		background: var(--error-container)
		color: var(--on-error-container)
		font: var(--m3e-type-body-medium)

	&__guide
		border-top: 1px solid var(--outline-variant)
		padding-top: 0.75rem

	&__guide-toggle
		display: inline-flex
		align-items: center
		gap: 0.5rem
		border: 0
		background: transparent
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-large)
		cursor: pointer
		padding: 0.25rem 0

		&:hover
			color: var(--primary)

	&__guide-steps
		margin: 0.75rem 0 0
		padding-left: 1.25rem
		display: flex
		flex-direction: column
		gap: 0.5rem
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

		a
			color: var(--primary)
			text-decoration: underline

		code
			padding: 0.125rem 0.375rem
			border-radius: var(--shape-corner-xs)
			background: var(--surface-container-highest)
			color: var(--on-surface)
</style>
