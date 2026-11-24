<script lang="ts">
import Button from "@components/atoms/action/Button.svelte";
import I18nKey from "@i18n/i18nKey";
import { t } from "@i18n/runtime.ts";
import Icon from "@iconify/svelte";
import {
	downloadAlbumAsZip,
	downloadSinglePhoto,
	resolvePhotoFilename,
} from "@utils/album-download";
import { openFancyboxGallery } from "@utils/fancybox-handler";
import { showSnackbar } from "@utils/snackbar";
import { url } from "@utils/url-utils";
import { onDestroy } from "svelte";
import type { AlbumLayout, AlbumPhoto } from "@/types/album";

let {
	albumId = "",
	albumTitle = "",
	photos = [] as AlbumPhoto[],
	layout = "masonry" as AlbumLayout,
	columns = 3,
}: {
	albumId?: string;
	albumTitle?: string;
	photos?: AlbumPhoto[];
	layout?: AlbumLayout;
	columns?: 2 | 3 | 4;
} = $props();

let measuredRatios = $state<Record<string, number>>({});
let downloadingAlbum = $state(false);
let downloadProgress = $state<{ completed: number; total: number } | null>(
	null,
);
let downloadingPhotoId = $state<string | null>(null);
let albumAbortController: AbortController | null = null;

onDestroy(() => {
	albumAbortController?.abort();
});

function photoRatio(photo: AlbumPhoto): number | undefined {
	if (photo.width && photo.height) return photo.width / photo.height;
	return measuredRatios[photo.id];
}

function orientationPriority(photo: AlbumPhoto): number {
	// Only authoritative metadata may affect ordering; measured image ratios arrive
	// asynchronously and must not reshuffle an already rendered masonry grid.
	const value =
		photo.width && photo.height ? photo.width / photo.height : undefined;
	if (value === undefined || value === 1) return 1;
	return value < 1 ? 0 : 2;
}

const visiblePhotos = $derived.by(() => {
	if (layout !== "masonry") return photos;
	return photos
		.map((photo, index) => ({ photo, index }))
		.sort(
			(a, b) =>
				orientationPriority(a.photo) - orientationPriority(b.photo) ||
				a.index - b.index,
		)
		.map(({ photo }) => photo);
});

const albumDownloadLabel = $derived.by(() => {
	if (!downloadingAlbum) {
		return $t(I18nKey.albumDownloadAll);
	}
	if (downloadProgress) {
		return `${$t(I18nKey.albumDownloading)} ${downloadProgress.completed}/${downloadProgress.total}…`;
	}
	return `${$t(I18nKey.albumDownloading)}…`;
});

function rememberNaturalRatio(photo: AlbumPhoto, event: Event) {
	if (photo.width && photo.height) return;
	const image = event.currentTarget as HTMLImageElement;
	if (!image.naturalWidth || !image.naturalHeight) return;
	measuredRatios[photo.id] = image.naturalWidth / image.naturalHeight;
}

function openPhoto(event: MouseEvent, startIndex: number) {
	event.preventDefault();
	event.stopPropagation();
	const slides = visiblePhotos.map((item, idx) => {
		const fullSrc = item.src ? url(item.src) : "";
		return {
			src: fullSrc,
			downloadSrc: fullSrc,
			downloadFilename: resolvePhotoFilename(item, idx),
			caption: item.title || item.description || undefined,
		};
	});
	void openFancyboxGallery(slides, startIndex);
}

async function handleDownloadPhoto(
	event: MouseEvent,
	photo: AlbumPhoto,
	index: number,
) {
	event.preventDefault();
	event.stopPropagation();
	if (downloadingPhotoId === photo.id) return;
	const fullSrc = photo.src ? url(photo.src) : "";
	if (!fullSrc) return;

	downloadingPhotoId = photo.id;
	try {
		await downloadSinglePhoto(photo, index, fullSrc);
	} catch {
		showSnackbar($t(I18nKey.albumDownloadFailed));
	} finally {
		if (downloadingPhotoId === photo.id) {
			downloadingPhotoId = null;
		}
	}
}

async function handleDownloadAlbum() {
	if (downloadingAlbum || visiblePhotos.length === 0) return;

	albumAbortController?.abort();
	const controller = new AbortController();
	albumAbortController = controller;
	downloadingAlbum = true;
	downloadProgress = { completed: 0, total: visiblePhotos.length };

	try {
		const result = await downloadAlbumAsZip({
			albumTitle,
			albumId,
			photos: visiblePhotos,
			resolveUrl: (src) => url(src),
			onProgress: (progress) => {
				downloadProgress = progress;
			},
			signal: controller.signal,
		});
		if (result.failed > 0) {
			showSnackbar(
				`${$t(I18nKey.albumDownloadPartial)} (${result.downloaded}/${visiblePhotos.length})`,
			);
		} else {
			showSnackbar(
				`${$t(I18nKey.albumDownloadComplete)} (${result.downloaded} ${$t(I18nKey.albumsPhotos)})`,
			);
		}
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") return;
		showSnackbar($t(I18nKey.albumDownloadFailed));
	} finally {
		if (albumAbortController === controller) {
			albumAbortController = null;
		}
		downloadingAlbum = false;
		downloadProgress = null;
	}
}

function ratio(photo: AlbumPhoto): string {
	const value = photoRatio(photo);
	return value === undefined ? "4 / 3" : String(value);
}
</script>

{#if visiblePhotos.length > 0}
	<div class="album-gallery__toolbar">
		<span class="album-gallery__count">
			<Icon icon="material-symbols:photo-library-outline-rounded" aria-hidden="true" />
			<span>{visiblePhotos.length} {$t(I18nKey.albumsPhotos)}</span>
		</span>
		<div class="album-gallery__actions" data-album-download-all>
			<Button
				variant="tonal"
				size="small"
				radius="full"
				icon={downloadingAlbum
					? "material-symbols:downloading-rounded"
					: "material-symbols:folder-zip-outline-rounded"}
				label={albumDownloadLabel}
				disabled={downloadingAlbum}
				onclick={handleDownloadAlbum}
			/>
		</div>
	</div>

	<div
		class="album-gallery album-gallery--{layout}"
		style={`--album-columns: ${columns}`}
		role="list"
		aria-label={$t(I18nKey.imageViewer)}
	>
		{#each visiblePhotos as photo, index (photo.id)}
			<div
				class="album-gallery__item"
				role="listitem"
				style={`--album-photo-ratio: ${ratio(photo)}`}
			>
				<button
					type="button"
					class="album-gallery__trigger"
					aria-label={`${$t(I18nKey.openImage)} ${index + 1}: ${photo.alt}`}
					onclick={(event) => openPhoto(event, index)}
				>
					<img
						src={url(photo.thumbnail || photo.src)}
						alt={photo.alt}
						width={photo.width}
						height={photo.height}
						loading="lazy"
						decoding="async"
						referrerpolicy="no-referrer"
						onload={(event) => rememberNaturalRatio(photo, event)}
					/>
				</button>
				<button
					type="button"
					class="album-gallery__download"
					class:album-gallery__download--busy={downloadingPhotoId === photo.id}
					data-album-download-photo
					aria-label={`${$t(I18nKey.albumDownloadPhoto)} ${index + 1}: ${photo.alt}`}
					title={$t(I18nKey.albumDownloadPhoto)}
					disabled={downloadingPhotoId === photo.id}
					onclick={(event) => handleDownloadPhoto(event, photo, index)}
				>
					<Icon
						icon={downloadingPhotoId === photo.id
							? "material-symbols:downloading-rounded"
							: "material-symbols:download-rounded"}
						aria-hidden="true"
					/>
				</button>
			</div>
		{/each}
	</div>
{:else}
	<div class="album-gallery__empty">
		<Icon icon="material-symbols:photo-library-outline-rounded" aria-hidden="true" />
		<span>{$t(I18nKey.noData)}</span>
	</div>
{/if}

<style lang="stylus">
.album-gallery
	--album-gap: var(--m3e-space-3, 0.75rem)
	width: 100%

	&__toolbar
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: 0.75rem
		margin-bottom: 1rem
		padding-bottom: 0.75rem
		border-bottom: 1px solid unquote("color-mix(in oklab, var(--outline-variant) 55%, transparent)")

	&__count
		display: inline-flex
		align-items: center
		gap: 0.375rem
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-medium)
		font-weight: 500
		> :global(svg)
			width: 1.125rem
			height: 1.125rem

	&__actions
		display: inline-flex
		align-items: center
		gap: 0.5rem

	&--grid
		display: grid
		grid-template-columns: repeat(var(--album-columns), minmax(0, 1fr))
		gap: var(--album-gap)

	&--masonry
		direction: ltr
		column-width: 240px
		column-gap: var(--album-gap)
		column-fill: balance

	&__item
		position: relative
		display: block
		width: 100%
		margin: 0 0 var(--album-gap)
		padding: 0
		overflow: hidden
		border-radius: var(--shape-corner-m)
		background: var(--surface-container-high)
		break-inside: avoid

	&__trigger
		display: block
		width: 100%
		margin: 0
		padding: 0
		border: 0
		background: transparent
		color: inherit
		cursor: zoom-in
		font: inherit
		text-align: start
		&:focus-visible
			outline: 2px solid var(--primary)
			outline-offset: -2px
		> img
			display: block
			width: 100%
			max-width: 100%
			aspect-ratio: var(--album-photo-ratio)
			object-fit: cover
			transition: transform var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate), filter var(--m3e-duration-medium) var(--m3e-easing-standard)
		.album-gallery--masonry & > img
			aspect-ratio: auto
			object-fit: cover

	&__item:hover &__trigger > img
		transform: scale(1.025)
		filter: brightness(0.92)

	&__download
		position: absolute
		right: 0.5rem
		bottom: 0.5rem
		z-index: 2
		display: inline-flex
		align-items: center
		justify-content: center
		width: 2.25rem
		height: 2.25rem
		padding: 0
		border: 1px solid unquote("rgb(255 255 255 / 0.24)")
		border-radius: var(--shape-corner-full)
		background: unquote("rgb(18 18 22 / 0.64)")
		backdrop-filter: blur(8px)
		color: #fff
		cursor: pointer
		transition: opacity var(--m3e-duration-short) var(--m3e-easing-standard), transform var(--m3e-duration-short) var(--m3e-easing-standard), background-color var(--m3e-duration-short) var(--m3e-easing-standard), border-color var(--m3e-duration-short) var(--m3e-easing-standard), color var(--m3e-duration-short) var(--m3e-easing-standard)
		> :global(svg)
			width: 1.125rem
			height: 1.125rem
		&:hover:not(:disabled)
			background: var(--primary)
			border-color: var(--primary)
			color: var(--on-primary)
			transform: scale(1.06)
		&:focus-visible
			opacity: 1
			transform: translateY(0)
			outline: 2px solid #fff
			outline-offset: 2px
		&:disabled
			cursor: wait
			opacity: 0.88

	&__empty
		display: grid
		place-items: center
		gap: 0.5rem
		min-height: 12rem
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-medium)
		> :global(svg)
			width: 2rem
			height: 2rem

@media (hover: hover)
	.album-gallery__download
		opacity: 0
		transform: translateY(4px)

	.album-gallery__item:hover .album-gallery__download,
	.album-gallery__item:focus-within .album-gallery__download,
	.album-gallery__download--busy
		opacity: 1
		transform: translateY(0)

@media (hover: none), (pointer: coarse)
	.album-gallery__download
		opacity: 0.92

@media (max-width: 47.99rem)
	.album-gallery--masonry
		column-width: 180px

@media (max-width: 29.99rem)
	.album-gallery--masonry
		column-width: 140px
	.album-gallery--grid
		grid-template-columns: repeat(2, minmax(0, 1fr))

:global(html.motion-reduced) .album-gallery__trigger > img,
:global(html.motion-reduced) .album-gallery__download
	transition: none

@media (prefers-reduced-motion: reduce)
	.album-gallery__trigger > img,
	.album-gallery__download
		transition: none
</style>
