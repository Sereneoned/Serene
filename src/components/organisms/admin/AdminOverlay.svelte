<script lang="ts">
import Dialog from "@components/atoms/overlay/Dialog.svelte";
import I18nKey from "@i18n/i18nKey";
import { t } from "@i18n/runtime.ts";
import Icon from "@iconify/svelte";
import {
	ADMIN_OPEN_LOGIN_EVENT,
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
import AdminLoginCard from "./AdminLoginCard.svelte";

let {
	shortcutEnabled = true,
	defaultRepo = "",
	defaultBranch = "main",
	defaultContentPrefix = "",
	githubProfileUrl = "",
}: {
	shortcutEnabled?: boolean;
	defaultRepo?: string;
	defaultBranch?: string;
	defaultContentPrefix?: string;
	githubProfileUrl?: string;
} = $props();

let session = $state<AdminSession | null>(null);
let loginOpen = $state(false);
let expanded = $state(false);
let stagedCount = $state(0);

function handleKeydown(event: KeyboardEvent) {
	if (!shortcutEnabled) return;
	if (
		(event.ctrlKey || event.metaKey) &&
		event.shiftKey &&
		event.key.toLowerCase() === "a"
	) {
		event.preventDefault();
		if (session) {
			expanded = !expanded;
		} else {
			loginOpen = true;
		}
	}
}

function logout() {
	clearAdminSession();
	expanded = false;
	showSnackbar("已退出管理员模式");
}

onMount(() => {
	session = getAdminSession();
	stagedCount = getStagedQueue().length;

	const stopSession = onAdminSessionChange((next) => {
		session = next;
	});
	const stopQueue = onStagedQueueChange((items) => {
		stagedCount = items.length;
	});
	const onOpenLogin = () => {
		if (session) {
			window.location.href = url("/admin/");
		} else {
			loginOpen = true;
		}
	};

	window.addEventListener("keydown", handleKeydown);
	window.addEventListener(ADMIN_OPEN_LOGIN_EVENT, onOpenLogin);
	return () => {
		stopSession();
		stopQueue();
		window.removeEventListener("keydown", handleKeydown);
		window.removeEventListener(ADMIN_OPEN_LOGIN_EVENT, onOpenLogin);
	};
});
</script>

{#if session}
	<aside class="admin-dock" aria-label="管理员快捷工具栏">
		{#if expanded}
			<div class="admin-dock__menu">
				<a href={url("/admin/?tab=moments")} class="admin-dock__item m3-state-layer" onclick={() => (expanded = false)}>
					<Icon icon="material-symbols:auto-awesome-outline-rounded" aria-hidden="true" />
					<span>{$t(I18nKey.adminQuickNewMoment)}</span>
				</a>
				<a href={url("/admin/?tab=albums")} class="admin-dock__item m3-state-layer" onclick={() => (expanded = false)}>
					<Icon icon="material-symbols:photo-library-outline-rounded" aria-hidden="true" />
					<span>{$t(I18nKey.adminQuickNewAlbum)}</span>
				</a>
				<a href={url("/admin/?tab=music")} class="admin-dock__item m3-state-layer" onclick={() => (expanded = false)}>
					<Icon icon="material-symbols:library-music-outline-rounded" aria-hidden="true" />
					<span>{$t(I18nKey.adminQuickManageMusic)}</span>
				</a>
				<a href={url("/admin/?tab=posts")} class="admin-dock__item m3-state-layer" onclick={() => (expanded = false)}>
					<Icon icon="material-symbols:article-outline-rounded" aria-hidden="true" />
					<span>文章管理</span>
				</a>
				<a href={url("/admin/?tab=data&domain=timeline")} class="admin-dock__item m3-state-layer" onclick={() => (expanded = false)}>
					<Icon icon="material-symbols:timeline-rounded" aria-hidden="true" />
					<span>时间线编辑</span>
				</a>
				<a href={url("/admin/?tab=data&domain=projects")} class="admin-dock__item m3-state-layer" onclick={() => (expanded = false)}>
					<Icon icon="material-symbols:deployed-code-outline-rounded" aria-hidden="true" />
					<span>项目展示编辑</span>
				</a>
				<a href={url("/admin/?tab=data&domain=games")} class="admin-dock__item m3-state-layer" onclick={() => (expanded = false)}>
					<Icon icon="material-symbols:sports-esports-outline-rounded" aria-hidden="true" />
					<span>游戏记录编辑</span>
				</a>
				<a href={url("/admin/?tab=data&domain=compass")} class="admin-dock__item m3-state-layer" onclick={() => (expanded = false)}>
					<Icon icon="material-symbols:explore-rounded" aria-hidden="true" />
					<span>站点罗盘编辑</span>
				</a>
				<a href={url("/admin/?tab=data&domain=friends")} class="admin-dock__item m3-state-layer" onclick={() => (expanded = false)}>
					<Icon icon="material-symbols:handshake-outline-rounded" aria-hidden="true" />
					<span>友链与其他数据</span>
				</a>
				<a href={url("/admin/?tab=deploy")} class="admin-dock__item m3-state-layer" onclick={() => (expanded = false)}>
					<Icon icon="material-symbols:rocket-launch-outline-rounded" aria-hidden="true" />
					<span>发布队列{stagedCount > 0 ? ` (${stagedCount})` : ""}</span>
				</a>
				<a href={url("/admin/")} class="admin-dock__item m3-state-layer" onclick={() => (expanded = false)}>
					<Icon icon="material-symbols:admin-panel-settings-outline-rounded" aria-hidden="true" />
					<span>{$t(I18nKey.adminStudio)}</span>
				</a>
				<button type="button" class="admin-dock__item admin-dock__item--danger m3-state-layer" onclick={logout}>
					<Icon icon="material-symbols:logout-rounded" aria-hidden="true" />
					<span>{$t(I18nKey.adminLogout)}</span>
				</button>
			</div>
		{/if}

		<button
			type="button"
			class="admin-dock__pill m3-state-layer"
			aria-expanded={expanded}
			onclick={() => (expanded = !expanded)}
		>
			{#if session.user.avatarUrl}
				<img class="admin-dock__avatar" src={session.user.avatarUrl} alt="" />
			{:else}
				<Icon icon="material-symbols:admin-panel-settings-outline-rounded" aria-hidden="true" />
			{/if}
			<span>{$t(I18nKey.adminModeActive)}</span>
			{#if stagedCount > 0}
				<em class="admin-dock__badge">{stagedCount}</em>
			{/if}
		</button>
	</aside>
{/if}

{#if loginOpen}
	<Dialog bind:open={loginOpen} title={$t(I18nKey.adminLogin)}>
		<AdminLoginCard
			compact
			{defaultRepo}
			{defaultBranch}
			{defaultContentPrefix}
			{githubProfileUrl}
			onSuccess={() => {
				loginOpen = false;
			}}
		/>
	</Dialog>
{/if}

<style lang="stylus">
.admin-dock
	position: fixed
	left: 1rem
	bottom: 1rem
	z-index: 60
	display: flex
	flex-direction: column
	align-items: flex-start
	gap: 0.5rem

	&__pill
		display: inline-flex
		align-items: center
		gap: 0.5rem
		height: 2.5rem
		padding: 0 0.875rem 0 0.5rem
		border-radius: var(--shape-corner-full)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-high)
		color: var(--on-surface)
		box-shadow: var(--m3e-elevation-2)
		font: var(--m3e-type-label-large)
		cursor: pointer

	&__avatar
		width: 1.625rem
		height: 1.625rem
		border-radius: var(--shape-corner-full)
		object-fit: cover

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

	&__menu
		display: flex
		flex-direction: column
		min-width: 11.5rem
		max-height: min(72vh, 28rem)
		overflow-y: auto
		padding: 0.375rem
		border-radius: var(--shape-corner-l)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-high)
		box-shadow: var(--m3e-elevation-3)

	&__item
		display: flex
		align-items: center
		gap: 0.625rem
		padding: 0.5rem 0.75rem
		border-radius: var(--shape-corner-m)
		border: 0
		background: transparent
		color: var(--on-surface)
		font: var(--m3e-type-label-large)
		text-decoration: none
		cursor: pointer
		text-align: left

		&--danger
			color: var(--error)
</style>
