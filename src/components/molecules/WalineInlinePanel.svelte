<script lang="ts">
import Button from "@components/atoms/action/Button.svelte";
import Icon from "@components/atoms/display/Icon.svelte";
import LoadingIndicator from "@components/atoms/feedback/LoadingIndicator.svelte";
import I18nKey from "@i18n/i18nKey";
import { t, uiLocale } from "@i18n/runtime.ts";
import {
	resolveWalineLang,
	type WalineInteractionOptions,
} from "@utils/waline-interactions";
import "@utils/waline-runtime";
import { onMount } from "svelte";

let {
	path,
	config,
	onCommentCountChange,
}: {
	path: string;
	config: WalineInteractionOptions;
	onCommentCountChange?: (count: number) => void;
} = $props();

let containerEl = $state<HTMLElement | undefined>();

const resolvedOptionsJson = $derived.by(() => {
	const {
		scriptUrl: _scriptUrl,
		styleUrl: _styleUrl,
		defaultLanguage,
		lang,
		...clientOptions
	} = config;
	return JSON.stringify({
		...clientOptions,
		path,
		lang: resolveWalineLang($uiLocale || defaultLanguage, lang),
		dark: false,
		comment: false,
		pageview: false,
	});
});

onMount(() => {
	if (!containerEl || !onCommentCountChange) return;
	const target = containerEl;
	let lastReported = -1;
	const syncCount = () => {
		const rawCount = target.querySelector(".wl-num")?.textContent?.trim();
		if (rawCount && /^\d+$/.test(rawCount)) {
			const count = Number.parseInt(rawCount, 10);
			if (count !== lastReported) {
				lastReported = count;
				onCommentCountChange(count);
			}
		}
	};
	const observer = new MutationObserver(syncCount);
	observer.observe(target, {
		subtree: true,
		childList: true,
		characterData: true,
	});
	return () => observer.disconnect();
});
</script>

<div class="moment-waline-host">
	<shirone-waline
		class="shirone-waline-wrapper"
		data-waline-script-url={config.scriptUrl}
		data-waline-style-url={config.styleUrl}
		data-waline-options={resolvedOptionsJson}
		data-waline-editor-label={$t(I18nKey.commentsEditor)}
		data-waline-lazy="false"
		data-waline-state="loading"
	>
		<template data-waline-icon="emoji">
			<Icon icon="material-symbols:sentiment-satisfied-outline-rounded" class="waline-icon" aria-hidden="true" />
		</template>
		<template data-waline-icon="image">
			<Icon icon="material-symbols:image-outline-rounded" class="waline-icon" aria-hidden="true" />
		</template>
		<template data-waline-icon="preview">
			<Icon icon="material-symbols:visibility-outline-rounded" class="waline-icon" aria-hidden="true" />
		</template>
		<template data-waline-icon="rss">
			<Icon icon="material-symbols:rss-feed-rounded" class="waline-icon" aria-hidden="true" />
		</template>
		<template data-waline-meta-icon="addr">
			<Icon icon="material-symbols:location-on-outline-rounded" class="waline-meta-icon" aria-hidden="true" />
		</template>
		<template data-waline-meta-icon="os">
			<Icon icon="material-symbols:devices-outline" class="waline-meta-icon" aria-hidden="true" />
		</template>
		<template data-waline-meta-icon="windows">
			<Icon icon="fa7-brands:windows" class="waline-meta-icon" aria-hidden="true" />
		</template>
		<template data-waline-meta-icon="apple">
			<Icon icon="fa7-brands:apple" class="waline-meta-icon" aria-hidden="true" />
		</template>
		<template data-waline-meta-icon="android">
			<Icon icon="fa7-brands:android" class="waline-meta-icon" aria-hidden="true" />
		</template>
		<template data-waline-meta-icon="linux">
			<Icon icon="fa7-brands:linux" class="waline-meta-icon" aria-hidden="true" />
		</template>
		<template data-waline-meta-icon="browser">
			<Icon icon="material-symbols:public" class="waline-meta-icon" aria-hidden="true" />
		</template>
		<template data-waline-meta-icon="edge">
			<Icon icon="fa7-brands:edge" class="waline-meta-icon" aria-hidden="true" />
		</template>
		<template data-waline-meta-icon="chrome">
			<Icon icon="fa7-brands:chrome" class="waline-meta-icon" aria-hidden="true" />
		</template>
		<template data-waline-meta-icon="firefox">
			<Icon icon="fa7-brands:firefox-browser" class="waline-meta-icon" aria-hidden="true" />
		</template>
		<template data-waline-meta-icon="safari">
			<Icon icon="fa7-brands:safari" class="waline-meta-icon" aria-hidden="true" />
		</template>
		<template data-waline-meta-icon="opera">
			<Icon icon="fa7-brands:opera" class="waline-meta-icon" aria-hidden="true" />
		</template>
		<template data-waline-meta-icon="weixin">
			<Icon icon="fa7-brands:weixin" class="waline-meta-icon" aria-hidden="true" />
		</template>
		<template data-waline-meta-icon="qq">
			<Icon icon="fa7-brands:qq" class="waline-meta-icon" aria-hidden="true" />
		</template>
		<div class="waline-loading" role="status">
			<span aria-hidden="true"><LoadingIndicator size={36} /></span>
			<span>{$t(I18nKey.commentsLoading)}</span>
		</div>
		<div class="waline-container" data-waline bind:this={containerEl} hidden></div>
		<div class="waline-error" hidden>
			<p role="alert">{$t(I18nKey.commentsLoadFailed)}</p>
			<Button class="waline-retry" variant="tonal" size="small" label={$t(I18nKey.retry)} />
		</div>
		<noscript>
			<p class="waline-noscript">{$t(I18nKey.commentsRequiresJavaScript)}</p>
		</noscript>
	</shirone-waline>
</div>

<style lang="stylus">
.moment-waline-host
	margin-top: var(--m3e-space-3)
	padding-top: var(--m3e-space-3)
	border-top: 1px dashed var(--outline-variant)

	:global(.shirone-waline-wrapper)
		display: block
		min-width: 0
		font: var(--m3e-type-body-medium)
		--waline-font-size: 0.9375em
		--waline-white: var(--on-primary)
		--waline-light-grey: var(--on-surface-variant)
		--waline-dark-grey: var(--on-surface-variant)
		--waline-theme-color: var(--primary)
		--waline-active-color: var(--primary)
		--waline-color: var(--on-surface)
		--waline-bg-color: var(--card-bg)
		--waline-bg-color-light: var(--surface-container-low)
		--waline-bg-color-hover: var(--surface-container-high)
		--waline-border-color: var(--outline-variant)
		--waline-disable-bg-color: var(--surface-container-highest)
		--waline-disable-color: var(--on-surface-variant)
		--waline-code-bg-color: var(--codeblock-bg)
		--waline-warning-color: var(--on-tertiary-container)
		--waline-warning-bg-color: var(--tertiary-container)
		--waline-bq-color: var(--surface-container-high)
		--waline-badge-color: var(--primary)
		--waline-info-bg-color: var(--surface-container-high)
		--waline-info-color: var(--on-surface-variant)
		--waline-avatar-radius: var(--shape-corner-xs)
		--waline-box-shadow: none

	:global(.shirone-waline-wrapper .waline-loading:not([hidden]))
		display: flex
		align-items: center
		justify-content: center
		gap: var(--m3e-space-2)
		padding: var(--m3e-space-4) 0
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)

	:global(.shirone-waline-wrapper .waline-error:not([hidden]))
		display: flex
		flex-direction: column
		align-items: center
		gap: var(--m3e-space-2)
		padding: var(--m3e-space-3) 0
		color: var(--error)
		font: var(--m3e-type-body-small)

	:global(.shirone-waline-wrapper .wl-panel)
		border-radius: var(--shape-corner-m)
		border-color: var(--outline-variant)
		background: var(--surface-container-low)

	:global(.shirone-waline-wrapper .wl-btn)
		border-radius: var(--shape-corner-full)

	:global(.shirone-waline-wrapper .wl-action svg),
	:global(.shirone-waline-wrapper .waline-meta-icon)
		width: 1rem
		height: 1rem
</style>
