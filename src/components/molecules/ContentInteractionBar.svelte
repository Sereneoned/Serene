<script lang="ts">
import Icon from "@components/atoms/display/Icon.svelte";
import I18nKey from "@i18n/i18nKey";
import { t } from "@i18n/runtime.ts";
import {
	fetchWalineBatchCounters,
	hasLikedWalinePath,
	recordWalineViewOnce,
	toggleWalineLike,
	type WalinePathCounters,
} from "@utils/waline-interactions";
import { onMount } from "svelte";

let {
	path,
	serverURL,
	variant = "post",
	stats,
	autoFetch = variant === "post",
	commentsOpen = false,
	commentCountOverride,
	onToggleComments,
	class: className = "",
}: {
	path: string;
	serverURL: string;
	variant?: "post" | "moment";
	stats?: WalinePathCounters;
	autoFetch?: boolean;
	commentsOpen?: boolean;
	commentCountOverride?: number;
	onToggleComments?: () => void;
	class?: string;
} = $props();

let rootEl = $state<HTMLElement | undefined>();
let liked = $state(false);
let likes = $state(0);
let views = $state(0);
let comments = $state(0);
let toggling = $state(false);

let hasLocalLikeChange = false;
let hasLocalViewChange = false;

$effect(() => {
	if (!stats) return;
	if (!hasLocalLikeChange) likes = stats.likes;
	if (!hasLocalViewChange) views = stats.views;
	comments = stats.comments;
});

const displayComments = $derived(
	commentCountOverride !== undefined ? commentCountOverride : comments,
);

async function handleToggleLike() {
	if (toggling) return;
	const wasLiked = liked;
	const prevLikes = likes;
	hasLocalLikeChange = true;
	liked = !wasLiked;
	likes = Math.max(0, prevLikes + (wasLiked ? -1 : 1));
	toggling = true;
	try {
		const res = await toggleWalineLike(serverURL, path, wasLiked);
		liked = res.liked;
		if (res.likes !== null) likes = res.likes;
	} catch {
		liked = wasLiked;
		likes = prevLikes;
	} finally {
		toggling = false;
	}
}

function handleCommentClick() {
	if (onToggleComments) {
		onToggleComments();
		return;
	}
	document.getElementById("comments")?.scrollIntoView({ behavior: "smooth" });
}

onMount(() => {
	liked = hasLikedWalinePath(path);
	const controller = new AbortController();

	if (autoFetch) {
		void fetchWalineBatchCounters(serverURL, [path], controller.signal)
			.then((map) => {
				const counts = map.get(path);
				if (!counts) return;
				if (!hasLocalLikeChange) likes = counts.likes;
				if (!hasLocalViewChange) views = counts.views;
				comments = counts.comments;
			})
			.catch(() => {});
	}

	const triggerView = () => {
		void recordWalineViewOnce(serverURL, path).then((nextViews) => {
			if (nextViews !== null) {
				hasLocalViewChange = true;
				views = nextViews;
			}
		});
	};

	let observer: IntersectionObserver | undefined;
	if (rootEl && "IntersectionObserver" in window) {
		observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				observer?.disconnect();
				triggerView();
			},
			{ threshold: 0.25 },
		);
		observer.observe(rootEl);
	} else {
		triggerView();
	}

	return () => {
		controller.abort();
		observer?.disconnect();
	};
});
</script>

<div
	bind:this={rootEl}
	class="content-interaction-bar content-interaction-bar--{variant} {className}"
	data-content-interactions
	data-interaction-path={path}
>
	<button
		type="button"
		class="content-interaction-bar__pill m3-state-layer"
		class:content-interaction-bar__pill--liked={liked}
		aria-pressed={liked}
		disabled={toggling}
		onclick={handleToggleLike}
	>
		<Icon
			icon={liked
				? "material-symbols:favorite-rounded"
				: "material-symbols:favorite-outline-rounded"}
			aria-hidden="true"
		/>
		<span>{liked ? $t(I18nKey.interactionLiked) : $t(I18nKey.interactionLike)}</span>
		{#if likes > 0}
			<em>{likes}</em>
		{/if}
	</button>

	<button
		type="button"
		class="content-interaction-bar__pill m3-state-layer"
		class:content-interaction-bar__pill--active={commentsOpen}
		aria-expanded={onToggleComments ? commentsOpen : undefined}
		onclick={handleCommentClick}
	>
		<Icon icon="material-symbols:chat-bubble-outline-rounded" aria-hidden="true" />
		<span>{$t(I18nKey.comments)}</span>
		{#if displayComments > 0}
			<em>{displayComments}</em>
		{/if}
	</button>

	<span class="content-interaction-bar__metric" title={String(views)}>
		<Icon icon="material-symbols:visibility-outline-rounded" aria-hidden="true" />
		<span>{$t(I18nKey.interactionViews)}</span>
		<em>{views}</em>
	</span>
</div>

<style lang="stylus">
.content-interaction-bar
	display: flex
	flex-wrap: wrap
	align-items: center
	gap: var(--m3e-space-2)

	&--post
		gap: var(--m3e-space-3)
		padding: var(--m3e-space-3) 0

	&--moment
		margin-top: var(--m3e-space-3)
		padding-top: var(--m3e-space-2)
		border-top: 1px solid unquote("color-mix(in oklab, var(--outline-variant) 55%, transparent)")

	&__pill
		position: relative
		display: inline-flex
		align-items: center
		gap: 0.375rem
		height: 2.125rem
		padding: 0 0.85rem
		border-radius: var(--shape-corner-full)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-medium)
		cursor: pointer

		&--liked,
		&--active
			border-color: var(--primary)
			background: var(--primary-container)
			color: var(--on-primary-container)

		> :global(svg)
			width: 1.05rem
			height: 1.05rem

		em
			font-style: normal
			font-variant-numeric: tabular-nums

	&__metric
		display: inline-flex
		align-items: center
		gap: 0.3rem
		margin-left: auto
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)

		> :global(svg)
			width: 1rem
			height: 1rem

		em
			font-style: normal
			font-variant-numeric: tabular-nums
</style>
