<script lang="ts">
import Button from "@components/atoms/action/Button.svelte";
import I18nKey from "@i18n/i18nKey";
import { t } from "@i18n/runtime.ts";
import {
	type AdminSession,
	getAdminSession,
	onAdminSessionChange,
} from "@utils/admin";
import { url } from "@utils/url-utils";
import { onMount } from "svelte";

let { albumId }: { albumId: string } = $props();

let session = $state<AdminSession | null>(null);

onMount(() => {
	session = getAdminSession();
	return onAdminSessionChange((next) => {
		session = next;
	});
});
</script>

{#if session}
	<div class="album-admin-bar">
		<Button
			variant="tonal"
			size="small"
			icon="material-symbols:cloud-upload-outline-rounded"
			label={$t(I18nKey.adminQuickUploadPhotos)}
			href={url(`/admin/?tab=albums&album=${encodeURIComponent(albumId)}`)}
		/>
		<Button
			variant="outlined"
			size="small"
			icon="material-symbols:edit-outline-rounded"
			label={$t(I18nKey.adminQuickEdit)}
			href={url(`/admin/?tab=albums&album=${encodeURIComponent(albumId)}`)}
		/>
	</div>
{/if}

<style lang="stylus">
.album-admin-bar
	display: flex
	flex-wrap: wrap
	gap: 0.625rem
	margin-top: 1rem
</style>
