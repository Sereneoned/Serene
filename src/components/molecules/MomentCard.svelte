<script lang="ts">
/**
 * 动态卡片（分子）：单条动态的展示单元。
 * <article> 语义（非整卡链接）；头像/作者名链到作者页；
 * 正文为构建期渲染的 HTML（复用全局 .custom-md 排版）；
 * 图片交给 MomentGallery（网格 + 内联查看器两段式，灯箱走 Fancybox）。
 */
import Avatar from "@components/atoms/display/Avatar.svelte";
import Icon from "@components/atoms/display/Icon.svelte";
import ContentInteractionBar from "@components/molecules/ContentInteractionBar.svelte";
import MomentGallery from "@components/molecules/MomentGallery.svelte";
import I18nKey from "@i18n/i18nKey";
import { t } from "@i18n/runtime.ts";
import type { MomentItem } from "@utils/content-utils";
import { formatDateToYYYYMMDDHHmm } from "@utils/date-utils";
import { reveal } from "@utils/motion";
import type {
	WalineInteractionOptions,
	WalinePathCounters,
} from "@utils/waline-interactions";
import type { Snippet } from "svelte";

type InlineWalineComponent =
	typeof import("@components/molecules/WalineInlinePanel.svelte").default;

export type MomentAuthor = {
	name: string;
	avatar: string;
	avatarSrcset?: string;
	avatarWidth?: number;
	avatarHeight?: number;
	url: string;
};

let {
	moment,
	author,
	/** stagger 入场延迟 ms（由列表传入：第 i 项 i × step） */
	delay = 0,
	walineConfig = null,
	interactionPath = "",
	interactionStats,
	class: className = "",
	children,
}: {
	moment: MomentItem;
	author: MomentAuthor;
	delay?: number;
	walineConfig?: WalineInteractionOptions | null;
	interactionPath?: string;
	interactionStats?: WalinePathCounters;
	class?: string;
	children?: Snippet;
} = $props();

const publishedAt = $derived(new Date(moment.published));
const timeText = $derived(formatDateToYYYYMMDDHHmm(publishedAt));

let commentsOpen = $state(false);
let commentCountOverride = $state<number | undefined>(undefined);
let InlineWaline = $state.raw<InlineWalineComponent | null>(null);

async function toggleComments() {
	if (commentsOpen) {
		commentsOpen = false;
		return;
	}
	commentsOpen = true;
	if (!InlineWaline) {
		try {
			const mod = await import(
				"@components/molecules/WalineInlinePanel.svelte"
			);
			InlineWaline = mod.default;
		} catch {
			// Ignore transient chunk load error so the visitor can retry.
		}
	}
}
</script>

<article class="moment-card {className}" id="moment-{moment.id}" use:reveal={{ delay }}>
	<header class="moment-card__header">
		<a class="moment-card__author" href={author.url}>
			<!-- 作者名紧邻头像可读，头像按装饰图处理（避免与 aria-label 冗余） -->
			<Avatar
				src={author.avatar}
				srcset={author.avatarSrcset}
				sizes="40px"
				width={author.avatarWidth}
				height={author.avatarHeight}
				alt=""
				size={40}
				shape="circle"
			/>
			<span class="moment-card__name">{author.name}</span>
		</a>

		<div class="moment-card__badges">
			{#if moment.encrypted}
				<span class="moment-card__badge moment-card__badge--encrypted">
					<Icon icon="material-symbols:lock-rounded" aria-hidden="true" />
					{$t(I18nKey.postEncryptedBadge)}
				</span>
			{/if}
			{#if moment.mood}
				<span class="moment-card__badge" aria-hidden="true">
					<Icon icon={moment.mood} />
				</span>
			{/if}
			{#if moment.pinned}
				<span class="moment-card__badge moment-card__badge--pinned">
					<Icon icon="material-symbols:keep-rounded" aria-hidden="true" />
					{$t(I18nKey.pinned)}
				</span>
			{/if}
		</div>

		<time class="moment-card__time" datetime={moment.published}>{timeText}</time>
	</header>

	{#if children}
		{@render children()}
	{:else}
		{#if moment.html.trim()}
			<div class="moment-card__content custom-md">
				<!-- 正文为构建期渲染产物（站点 markdown 插件链），非用户输入 -->
				{@html moment.html}
			</div>
		{/if}

		{#if moment.images.length > 0}
			<MomentGallery images={moment.images} />
		{/if}

		{#if moment.location || moment.tags.length > 0}
			<footer class="moment-card__footer">
				{#if moment.location}
					<span class="moment-card__location">
						<Icon icon="material-symbols:location-on-outline-rounded" aria-hidden="true" />
						{moment.location}
					</span>
				{/if}
				{#if moment.tags.length > 0}
					<div class="moment-card__tags">
						{#each moment.tags as tag (tag)}
							<span class="moment-card__tag">#{tag}</span>
						{/each}
					</div>
				{/if}
			</footer>
		{/if}

		{#if walineConfig && interactionPath}
			<ContentInteractionBar
				variant="moment"
				path={interactionPath}
				serverURL={walineConfig.serverURL}
				stats={interactionStats}
				autoFetch={false}
				{commentsOpen}
				{commentCountOverride}
				onToggleComments={toggleComments}
			/>
			{#if commentsOpen && InlineWaline}
				<InlineWaline
					path={interactionPath}
					config={walineConfig}
					onCommentCountChange={(count) => {
						commentCountOverride = count;
					}}
				/>
			{/if}
		{/if}
	{/if}
</article>

<style lang="stylus">
@import "../../styles/breakpoints.styl"

.moment-card
	display: flex
	flex-direction: column
	box-sizing: border-box
	width: 100%
	/* 网格项自动最小尺寸归零：卡片随轨道收缩，长内容由正文自行换行 */
	min-width: 0
	padding: var(--m3e-space-4) var(--m3e-space-5)
	border-radius: var(--shape-corner-l)
	background: var(--card-bg)
	border: 1px solid var(--outline-variant)
	color: var(--on-surface)

	&__header
		display: flex
		align-items: center
		gap: var(--m3e-space-3)

	&__author
		display: inline-flex
		align-items: center
		gap: var(--m3e-space-2)
		min-width: 0
		text-decoration: none
		border-radius: var(--shape-corner-full)
		&:focus-visible
			outline: 2px solid var(--primary)
			outline-offset: 2px

	&__name
		overflow: hidden
		text-overflow: ellipsis
		white-space: nowrap
		color: var(--on-surface)
		font: var(--m3e-type-title-small)
		font-weight: 600

	&__badges
		display: inline-flex
		align-items: center
		gap: var(--m3e-space-1)
		flex-shrink: 0

	&__badge
		display: inline-flex
		align-items: center
		gap: var(--m3e-space-1)
		padding: 0.1875rem 0.5rem
		border-radius: var(--shape-corner-full)
		background: var(--surface-container-high)
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-small)
		> :global(svg)
			width: 1rem
			height: 1rem

		&--pinned
			background: var(--primary-container)
			color: var(--on-primary-container)

		&--encrypted
			background: var(--secondary-container)
			color: var(--on-secondary-container)

	&__time
		margin-left: auto
		flex-shrink: 0
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)

	&__content
		margin-top: var(--m3e-space-3)
		color: var(--on-surface)
		font: var(--m3e-type-body-medium)
		line-height: 1.75
		/* anywhere：换行同时参与 min-content 计算，窄宽度下长链接才不会溢出 */
		overflow-wrap: anywhere
		:global(p:first-child)
			margin-top: 0
		:global(p:last-child)
			margin-bottom: 0
		:global(strong)
			font-weight: 700
		:global(mark)
			padding: 0.05em 0.25em
			border-radius: var(--shape-corner-xs)
			background: unquote("color-mix(in oklab, var(--primary) 22%, transparent)")
			color: inherit
		:global(.markdown-image-figure)
			margin: var(--m3e-space-3) 0
		:global(.markdown-image-caption)
			margin-top: var(--m3e-space-1)
			color: var(--on-surface-variant)
			font: var(--m3e-type-body-small)
			text-align: center
		:global(.markdown-image-figure--left .markdown-image-caption)
			text-align: left
		:global(.markdown-image-figure--right .markdown-image-caption)
			text-align: right

	&__footer
		display: flex
		align-items: center
		justify-content: space-between
		gap: var(--m3e-space-3)
		flex-wrap: wrap
		margin-top: var(--m3e-space-3)

	&__location
		display: inline-flex
		align-items: center
		gap: 0.25rem
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-small)
		> :global(svg)
			width: 1rem
			height: 1rem

	&__tags
		display: flex
		flex-wrap: wrap
		gap: 0.375rem

	&__tag
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-small)

	@media (max-width: bp-sm - 1px)
		padding: 0.875rem 1rem
</style>
