<script lang="ts">
import Button from "@components/atoms/action/Button.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import {
	collectTagsFromRecords,
	FRIEND_TAG_PRESETS,
	moveListItem,
} from "@utils/admin";
import { showSnackbar } from "@utils/snackbar";
import type { FriendItem } from "@/data/friends";
import AdminTagInput from "../AdminTagInput.svelte";

let { friends = $bindable<FriendItem[]>([]) }: { friends?: FriendItem[] } =
	$props();

let editingId = $state<number | null>(null);
let draftTitle = $state("");
let draftUrl = $state("");
let draftImg = $state("");
let draftDesc = $state("");
let draftTags = $state<string[]>([]);

const allExistingTags = $derived(
	collectTagsFromRecords(friends, (friend) => friend.tags),
);

function resetDraft() {
	editingId = null;
	draftTitle = "";
	draftUrl = "";
	draftImg = "";
	draftDesc = "";
	draftTags = [];
}

function startEdit(friend: FriendItem) {
	editingId = friend.id;
	draftTitle = friend.title;
	draftUrl = friend.siteurl;
	draftImg = friend.imgurl;
	draftDesc = friend.desc;
	draftTags = [...friend.tags];
}

function commitFriend() {
	if (!draftTitle.trim() || !draftUrl.trim()) {
		showSnackbar("请填写友链名称与网址");
		return;
	}
	if (editingId !== null) {
		friends = friends.map((f) =>
			f.id === editingId
				? {
						...f,
						title: draftTitle.trim(),
						siteurl: draftUrl.trim(),
						imgurl: draftImg.trim(),
						desc: draftDesc.trim(),
						tags: draftTags,
					}
				: f,
		);
		showSnackbar("友链已更新");
	} else {
		const nextId =
			friends.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
		friends = [
			...friends,
			{
				id: nextId,
				title: draftTitle.trim(),
				siteurl: draftUrl.trim(),
				imgurl: draftImg.trim(),
				desc: draftDesc.trim(),
				tags: draftTags,
			},
		];
		showSnackbar("已添加到友链列表");
	}
	resetDraft();
}
</script>

<div class="friends-editor">
	<div class="friends-editor__form">
		<div class="friends-editor__head">
			<strong>{editingId !== null ? `正在编辑友链 #${editingId}` : "新增友情链接"}</strong>
			{#if editingId !== null}
				<Button variant="text" size="xsmall" label="取消编辑" onclick={resetDraft} />
			{/if}
		</div>

		<div class="friends-editor__grid">
			<TextField label="站点名称" variant="outlined" bind:value={draftTitle} />
			<TextField label="站点网址 (https://...)" variant="outlined" bind:value={draftUrl} />
			<TextField label="头像链接" variant="outlined" bind:value={draftImg} />
			<TextField label="一句话简介" variant="outlined" bind:value={draftDesc} />
		</div>

		<AdminTagInput
			bind:tags={draftTags}
			label="友链标签 (Tags)"
			presets={FRIEND_TAG_PRESETS}
			existingTags={allExistingTags}
		/>

		<div class="friends-editor__end-btn">
			<Button
				variant="tonal"
				size="small"
				icon={editingId !== null ? "material-symbols:check-circle-outline-rounded" : "material-symbols:add-rounded"}
				label={editingId !== null ? "保存友链修改" : "添加友链"}
				onclick={commitFriend}
			/>
		</div>
	</div>

	<div class="friends-editor__list">
		{#each friends as friend, idx (friend.id)}
			<div class="friends-editor__row">
				<div class="friends-editor__info">
					<strong>{friend.title}</strong>
					<span>{friend.siteurl}{friend.desc ? ` — ${friend.desc}` : ""}</span>
					{#if friend.tags.length > 0}
						<div class="friends-editor__tags">
							{#each friend.tags as tag (tag)}
								<span>#{tag}</span>
							{/each}
						</div>
					{/if}
				</div>
				<div class="friends-editor__actions">
					<Button variant="text" size="xsmall" icon="material-symbols:edit-outline-rounded" label="编辑" onclick={() => startEdit(friend)} />
					<Button
						variant="text"
						size="xsmall"
						icon="material-symbols:arrow-upward-rounded"
						ariaLabel={`上移 ${friend.title}`}
						disabled={idx === 0}
						onclick={() => (friends = moveListItem(friends, idx, -1))}
					/>
					<Button
						variant="text"
						size="xsmall"
						icon="material-symbols:arrow-downward-rounded"
						ariaLabel={`下移 ${friend.title}`}
						disabled={idx === friends.length - 1}
						onclick={() => (friends = moveListItem(friends, idx, 1))}
					/>
					<Button
						variant="text"
						size="xsmall"
						icon="material-symbols:delete-outline-rounded"
						label="删除"
						onclick={() => {
							if (editingId === friend.id) resetDraft();
							friends = friends.filter((f) => f.id !== friend.id);
						}}
					/>
				</div>
			</div>
		{/each}
	</div>
</div>

<style lang="stylus">
.friends-editor
	display: flex
	flex-direction: column
	gap: 1rem

	&__form
		display: flex
		flex-direction: column
		gap: 0.75rem
		padding: 1rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)

	&__head
		display: flex
		align-items: center
		justify-content: space-between
		font: var(--m3e-type-title-small)
		color: var(--on-surface)

	&__grid
		display: grid
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr))
		gap: 0.75rem
		align-items: center

	&__end-btn
		display: flex
		justify-content: flex-end

	&__list
		display: flex
		flex-direction: column
		gap: 0.5rem

	&__row
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: 0.75rem
		padding: 0.75rem 1rem
		border-radius: var(--shape-corner-m)
		background: var(--surface-container-low)
		border: 1px solid var(--outline-variant)

	&__info
		display: flex
		flex-direction: column
		gap: 0.2rem
		min-width: 0

		strong
			font: var(--m3e-type-body-medium)
			color: var(--on-surface)

		span
			font: var(--m3e-type-body-small)
			color: var(--on-surface-variant)

	&__tags
		display: flex
		flex-wrap: wrap
		gap: 0.35rem

		span
			font: var(--m3e-type-label-small)
			color: var(--primary)

	&__actions
		display: flex
		flex-wrap: wrap
		gap: 0.25rem
</style>
