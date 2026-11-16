<script lang="ts">
import Button from "@components/atoms/action/Button.svelte";
import Card from "@components/atoms/display/Card.svelte";
import PageHeader from "@components/molecules/PageHeader.svelte";
import I18nKey from "@i18n/i18nKey";
import { t } from "@i18n/runtime.ts";
import Icon from "@iconify/svelte";
import {
	type AdminSession,
	clearAdminSession,
	getAdminSession,
	getStagedQueue,
	onAdminSessionChange,
	onStagedQueueChange,
} from "@utils/admin";
import { showSnackbar } from "@utils/snackbar";
import { url } from "@utils/url-utils";
import { onMount } from "svelte";
import AdminAlbumsPanel from "./AdminAlbumsPanel.svelte";
import AdminDataPanel from "./AdminDataPanel.svelte";
import AdminDeployPanel from "./AdminDeployPanel.svelte";
import AdminLoginCard from "./AdminLoginCard.svelte";
import AdminMomentsPanel from "./AdminMomentsPanel.svelte";
import AdminMusicPanel from "./AdminMusicPanel.svelte";
import AdminPostsPanel from "./AdminPostsPanel.svelte";
import AdminSitePanel from "./AdminSitePanel.svelte";

type AdminTab =
	| "moments"
	| "albums"
	| "music"
	| "posts"
	| "site"
	| "data"
	| "deploy";

let {
	defaultRepo = "",
	defaultBranch = "main",
	defaultContentPrefix = "",
	githubProfileUrl = "",
	initialConfigSnapshot,
}: {
	defaultRepo?: string;
	defaultBranch?: string;
	defaultContentPrefix?: string;
	githubProfileUrl?: string;
	initialConfigSnapshot: {
		siteUrl: string;
		basePath: string;
		title: string;
		subtitle: string;
		hue: number;
		style: string;
		homeSubtitles: string[];
		profileName: string;
		profileBio: string;
		profileAvatar: string;
		profileLinks: Array<{ name: string; icon: string; url: string }>;
		announcementTitle: string;
		announcementContent: string;
		announcementClosable: boolean;
		announcementLinkEnable: boolean;
		announcementLinkText: string;
		announcementLinkUrl: string;
		features: Record<string, boolean>;
		timeline?: {
			order: "desc" | "asc";
			categories: Array<{ key: string; label: string; icon?: string }>;
		};
		projects?: {
			categories: Array<{ key: string; label: string; icon?: string }>;
		};
		games?: {
			categories: Array<{
				key: string;
				label: string;
				icon?: string;
				description?: string;
			}>;
		};
	};
} = $props();

const tabs: Array<{ id: AdminTab; label: string; icon: string }> = [
	{
		id: "moments",
		label: "动态发布",
		icon: "material-symbols:auto-awesome-outline-rounded",
	},
	{
		id: "albums",
		label: "相册上传",
		icon: "material-symbols:photo-library-outline-rounded",
	},
	{
		id: "music",
		label: "音乐曲库",
		icon: "material-symbols:library-music-outline-rounded",
	},
	{
		id: "posts",
		label: "文章与关于",
		icon: "material-symbols:article-outline-rounded",
	},
	{
		id: "data",
		label: "友链与页面数据",
		icon: "material-symbols:group-outline-rounded",
	},
	{
		id: "site",
		label: "资料与站点设置",
		icon: "material-symbols:settings-outline-rounded",
	},
	{
		id: "deploy",
		label: "队列与部署状态",
		icon: "material-symbols:rocket-launch-outline-rounded",
	},
];

let session = $state<AdminSession | null>(null);
let activeTab = $state<AdminTab>("moments");
let initialEditId = $state("");
let initialAlbumId = $state("");
let stagedCount = $state(0);

function switchTab(tab: AdminTab) {
	activeTab = tab;
	if (typeof window !== "undefined") {
		const params = new URLSearchParams(window.location.search);
		params.set("tab", tab);
		params.delete("edit");
		params.delete("album");
		history.replaceState(history.state, "", `?${params.toString()}`);
	}
}

function handleLogout() {
	clearAdminSession();
	session = null;
	showSnackbar("已退出管理员身份");
}

onMount(() => {
	session = getAdminSession();
	stagedCount = getStagedQueue().length;

	const params = new URLSearchParams(window.location.search);
	const rawTab = params.get("tab") as AdminTab | null;
	if (rawTab && tabs.some((item) => item.id === rawTab)) {
		activeTab = rawTab;
	}
	initialEditId = params.get("edit") || "";
	initialAlbumId = params.get("album") || "";

	const stopSession = onAdminSessionChange((next) => {
		session = next;
	});
	const stopQueue = onStagedQueueChange((items) => {
		stagedCount = items.length;
	});
	return () => {
		stopSession();
		stopQueue();
	};
});
</script>

<div class="admin-studio">
	<Card color="var(--card-bg)" radius="l" class="p-5 md:p-6">
		<PageHeader
			icon="material-symbols:admin-panel-settings-outline-rounded"
			title={$t(I18nKey.adminStudio)}
			subtitle={$t(I18nKey.adminStudioSubtitle)}
		/>

		{#if session}
			<div class="admin-studio__bar">
				<div class="admin-studio__user">
					{#if session.user.avatarUrl}
						<img src={session.user.avatarUrl} alt={session.user.login} />
					{/if}
					<div>
						<strong>{session.user.name || session.user.login}</strong>
						<span>
							已连接 {session.owner}/{session.repo} ({session.branch})
						</span>
					</div>
				</div>

				<div class="admin-studio__bar-actions">
					<Button
						variant="text"
						size="xsmall"
						href={url("/moments/")}
						label="查看前台动态"
					/>
					<Button
						variant="text"
						size="xsmall"
						href={url("/albums/")}
						label="查看相册"
					/>
					<Button
						variant="outlined"
						size="xsmall"
						icon="material-symbols:logout-rounded"
						label={$t(I18nKey.adminLogout)}
						onclick={handleLogout}
					/>
				</div>
			</div>

			<nav class="admin-studio__tabs" aria-label="管理后台模块导航">
				{#each tabs as tab (tab.id)}
					<button
						type="button"
						class="admin-studio__tab m3-state-layer"
						class:admin-studio__tab--active={activeTab === tab.id}
						onclick={() => switchTab(tab.id)}
					>
						<Icon icon={tab.icon} aria-hidden="true" />
						<span>{tab.label}</span>
						{#if tab.id === "deploy" && stagedCount > 0}
							<em class="admin-studio__badge">{stagedCount}</em>
						{/if}
					</button>
				{/each}
			</nav>
		{/if}
	</Card>

	{#if !session}
		<AdminLoginCard
			{defaultRepo}
			{defaultBranch}
			{defaultContentPrefix}
			{githubProfileUrl}
			onSuccess={(next) => (session = next)}
		/>
	{:else if activeTab === "moments"}
		<AdminMomentsPanel {session} {initialEditId} />
	{:else if activeTab === "albums"}
		<AdminAlbumsPanel {session} {initialAlbumId} />
	{:else if activeTab === "music"}
		<AdminMusicPanel {session} />
	{:else if activeTab === "posts"}
		<AdminPostsPanel {session} />
	{:else if activeTab === "data"}
		<AdminDataPanel {session} {initialConfigSnapshot} />
	{:else if activeTab === "site"}
		<AdminSitePanel {session} {initialConfigSnapshot} />
	{:else if activeTab === "deploy"}
		<AdminDeployPanel {session} />
	{/if}
</div>

<style lang="stylus">
.admin-studio
	display: flex
	flex-direction: column
	gap: 1.25rem

	&__bar
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: 0.875rem
		padding: 0.75rem 1rem
		border-radius: var(--shape-corner-m)
		background: var(--surface-container-low)
		margin-bottom: 1rem

	&__user
		display: flex
		align-items: center
		gap: 0.75rem

		img
			width: 2.25rem
			height: 2.25rem
			border-radius: var(--shape-corner-full)
			object-fit: cover

		div
			display: flex
			flex-direction: column

		strong
			font: var(--m3e-type-title-small)
			color: var(--on-surface)

		span
			font: var(--m3e-type-body-small)
			color: var(--on-surface-variant)

	&__bar-actions
		display: flex
		flex-wrap: wrap
		align-items: center
		gap: 0.5rem

	&__tabs
		display: flex
		flex-wrap: wrap
		gap: 0.5rem

	&__tab
		position: relative
		display: inline-flex
		align-items: center
		gap: 0.5rem
		padding: 0.5rem 0.9rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		color: var(--on-surface)
		font: var(--m3e-type-label-large)
		cursor: pointer

		&--active
			background: var(--primary-container)
			color: var(--on-primary-container)
			border-color: var(--primary)

	&__badge
		display: inline-grid
		place-items: center
		min-width: 1.25rem
		height: 1.25rem
		padding: 0 0.35rem
		border-radius: var(--shape-corner-full)
		background: var(--primary)
		color: var(--on-primary)
		font: var(--m3e-type-label-small)
		font-style: normal
</style>
