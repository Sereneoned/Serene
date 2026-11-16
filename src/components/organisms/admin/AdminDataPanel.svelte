<script lang="ts">
import Button from "@components/atoms/action/Button.svelte";
import Card from "@components/atoms/display/Card.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import {
	type AdminSession,
	commitRepoChanges,
	enqueueStagedBatch,
	readRepoTextFile,
} from "@utils/admin";
import { showSnackbar } from "@utils/snackbar";
import { onMount } from "svelte";
import type { FriendItem } from "@/data/friends";

let { session }: { session: AdminSession } = $props();

type DataDomain =
	| "friends"
	| "timeline"
	| "projects"
	| "devices"
	| "games"
	| "anime"
	| "skills"
	| "compass";

const domainTabs: Array<{ id: DataDomain; label: string; path: string }> = [
	{ id: "friends", label: "友情链接", path: "src/data/json/friends.json" },
	{ id: "timeline", label: "时间线", path: "src/data/json/timeline.json" },
	{ id: "projects", label: "项目", path: "src/data/json/projects.json" },
	{ id: "devices", label: "设备", path: "src/data/json/devices.json" },
	{ id: "games", label: "游戏", path: "src/data/json/games.json" },
	{ id: "anime", label: "番剧", path: "src/data/json/anime.json" },
	{ id: "skills", label: "技能", path: "src/data/json/skills.json" },
	{ id: "compass", label: "罗盘", path: "src/data/json/compass.json" },
];

let activeDomain = $state<DataDomain>("friends");
let loading = $state(false);
let saving = $state(false);
let rawJsonText = $state("[]");
let jsonError = $state("");

// Visual Friend editor state
let friends = $state<FriendItem[]>([]);
let newFriendTitle = $state("");
let newFriendUrl = $state("");
let newFriendImg = $state("");
let newFriendDesc = $state("");
let newFriendTags = $state("");

const currentTab = $derived(
	domainTabs.find((d) => d.id === activeDomain) ?? domainTabs[0],
);

async function loadDomain(domain: DataDomain = activeDomain) {
	const tab = domainTabs.find((d) => d.id === domain);
	if (!tab) return;
	loading = true;
	jsonError = "";
	try {
		const file = await readRepoTextFile(session, tab.path);
		const text = file ? file.content : "[]";
		rawJsonText = text;
		if (domain === "friends") {
			friends = JSON.parse(text) as FriendItem[];
		}
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "读取数据失败");
	} finally {
		loading = false;
	}
}

function addFriend() {
	if (!newFriendTitle.trim() || !newFriendUrl.trim()) {
		showSnackbar("请填写友链名称与网址");
		return;
	}
	const nextId =
		friends.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
	const item: FriendItem = {
		id: nextId,
		title: newFriendTitle.trim(),
		siteurl: newFriendUrl.trim(),
		imgurl: newFriendImg.trim(),
		desc: newFriendDesc.trim(),
		tags: newFriendTags
			.split(/[,，]/)
			.map((s) => s.trim())
			.filter(Boolean),
	};
	friends = [...friends, item];
	rawJsonText = `${JSON.stringify(friends, null, 2)}\n`;
	newFriendTitle = "";
	newFriendUrl = "";
	newFriendImg = "";
	newFriendDesc = "";
	newFriendTags = "";
}

function removeFriend(id: number) {
	friends = friends.filter((f) => f.id !== id);
	rawJsonText = `${JSON.stringify(friends, null, 2)}\n`;
}

async function handleSave(stageOnly = false) {
	jsonError = "";
	let formatted = rawJsonText;
	try {
		const parsed =
			activeDomain === "friends"
				? friends
				: (JSON.parse(rawJsonText) as unknown);
		formatted = `${JSON.stringify(parsed, null, 2)}\n`;
		rawJsonText = formatted;
	} catch (error) {
		jsonError = `JSON 语法错误：${error instanceof Error ? error.message : "无法解析"}`;
		return;
	}

	const change = {
		path: currentTab.path,
		action: "upsert" as const,
		content: formatted,
	};

	if (stageOnly) {
		enqueueStagedBatch(`更新${currentTab.label}`, [change]);
		showSnackbar("已加入批量发布队列");
		return;
	}

	saving = true;
	try {
		await commitRepoChanges(
			session,
			`content(${activeDomain}): update ${currentTab.label}`,
			[change],
		);
		showSnackbar(`${currentTab.label} 已提交到 GitHub`, {
			icon: "material-symbols:check-circle-outline-rounded",
		});
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "保存失败");
	} finally {
		saving = false;
	}
}

onMount(() => {
	void loadDomain("friends");
});
</script>

<div class="data-admin">
	<div class="data-admin__tabs">
		{#each domainTabs as tab (tab.id)}
			<button
				type="button"
				class="data-admin__tab"
				class:data-admin__tab--active={activeDomain === tab.id}
				onclick={() => {
					activeDomain = tab.id;
					void loadDomain(tab.id);
				}}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<Card color="var(--card-bg)" radius="l" class="p-5 md:p-6">
		<div class="data-admin__head">
			<div>
				<h2 class="data-admin__title">{currentTab.label} ({currentTab.path})</h2>
				<p class="data-admin__sub">
					{activeDomain === "friends"
						? "可视化增删友情链接，保存后提交到仓库。"
						: "直接在线编辑结构化 JSON 数据（自动校验语法格式），省去本地翻找源码文件。"}
				</p>
			</div>
			<Button
				variant="outlined"
				size="xsmall"
				icon="material-symbols:refresh-rounded"
				label={loading ? "同步中..." : "重新读取"}
				onclick={() => loadDomain(activeDomain)}
			/>
		</div>

		{#if activeDomain === "friends"}
			<div class="data-admin__friend-form">
				<TextField label="站点名称" variant="outlined" bind:value={newFriendTitle} />
				<TextField label="站点网址 (https://...)" variant="outlined" bind:value={newFriendUrl} />
				<TextField label="头像链接" variant="outlined" bind:value={newFriendImg} />
				<TextField label="一句话简介" variant="outlined" bind:value={newFriendDesc} />
				<TextField label="标签 (逗号分隔)" variant="outlined" bind:value={newFriendTags} />
				<Button variant="tonal" size="small" icon="material-symbols:add-rounded" label="添加友链" onclick={addFriend} />
			</div>

			<div class="data-admin__friend-list">
				{#each friends as friend (friend.id)}
					<div class="data-admin__friend-row">
						<div class="data-admin__friend-info">
							<strong>{friend.title}</strong>
							<span>{friend.siteurl} — {friend.desc}</span>
						</div>
						<Button
							variant="text"
							size="xsmall"
							icon="material-symbols:delete-outline-rounded"
							label="删除"
							onclick={() => removeFriend(friend.id)}
						/>
					</div>
				{/each}
			</div>
		{:else}
			<textarea class="data-admin__textarea" rows="18" bind:value={rawJsonText}></textarea>
		{/if}

		{#if jsonError}
			<p class="data-admin__error">{jsonError}</p>
		{/if}

		<div class="data-admin__actions">
			<Button variant="outlined" size="medium" label="加入批量队列" disabled={saving} onclick={() => handleSave(true)} />
			<Button
				variant="filled"
				size="medium"
				icon="material-symbols:rocket-launch-outline-rounded"
				label={saving ? "提交中..." : `保存 ${currentTab.label}`}
				disabled={saving}
				onclick={() => handleSave(false)}
			/>
		</div>
	</Card>
</div>

<style lang="stylus">
.data-admin
	display: flex
	flex-direction: column
	gap: 1rem

	&__tabs
		display: flex
		flex-wrap: wrap
		gap: 0.5rem

	&__tab
		padding: 0.4rem 0.875rem
		border-radius: var(--shape-corner-full)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		color: var(--on-surface)
		font: var(--m3e-type-label-large)
		cursor: pointer

		&--active
			background: var(--primary-container)
			color: var(--on-primary-container)
			border-color: var(--primary)

	&__head
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: 0.75rem
		margin-bottom: 1rem

	&__title
		margin: 0
		font: var(--m3e-type-title-medium)
		color: var(--on-surface)

	&__sub
		margin: 0.25rem 0 0
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

	&__friend-form
		display: grid
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr))
		gap: 0.75rem
		align-items: center
		margin-bottom: 1rem

	&__friend-list
		display: flex
		flex-direction: column
		gap: 0.5rem

	&__friend-row
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: 0.75rem
		padding: 0.75rem 1rem
		border-radius: var(--shape-corner-m)
		background: var(--surface-container-low)

	&__friend-info
		display: flex
		flex-direction: column
		min-width: 0

		strong
			font: var(--m3e-type-body-medium)
			color: var(--on-surface)

		span
			font: var(--m3e-type-body-small)
			color: var(--on-surface-variant)

	&__textarea
		width: 100%
		padding: 0.875rem 1rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		color: var(--on-surface)
		font: var(--m3e-type-body-small)
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace
		box-sizing: border-box

	&__error
		margin: 0.75rem 0 0
		color: var(--error)
		font: var(--m3e-type-body-medium)

	&__actions
		display: flex
		flex-wrap: wrap
		justify-content: flex-end
		gap: 0.75rem
		margin-top: 1.25rem
</style>
