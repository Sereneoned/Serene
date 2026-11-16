<script lang="ts">
import Button from "@components/atoms/action/Button.svelte";
import Card from "@components/atoms/display/Card.svelte";
import {
	type AdminSession,
	buildPendingUploadChanges,
	commitRepoChanges,
	type EditableCategory,
	enqueueStagedBatch,
	mergeDomainConfigOverride,
	normalizeCategoryConfigs,
	normalizeCompassShelves,
	normalizeFriendItems,
	normalizeGameItems,
	normalizeProjectItems,
	normalizeTimelineItems,
	type RepoFileChange,
	readRepoTextFile,
	serializeCompassShelves,
	serializeGameItems,
	serializeProjectItems,
	serializeTimelineItems,
} from "@utils/admin";
import { showSnackbar } from "@utils/snackbar";
import { onMount } from "svelte";
import type { CompassShelf } from "@/data/compass";
import type { FriendItem } from "@/data/friends";
import type { GameItem } from "@/types/gamesConfig";
import type { ProjectItem } from "@/types/projectsConfig";
import type { TimelineItem } from "@/types/timelineConfig";
import CompassDataEditor from "./data/CompassDataEditor.svelte";
import FriendsDataEditor from "./data/FriendsDataEditor.svelte";
import GamesDataEditor from "./data/GamesDataEditor.svelte";
import ProjectsDataEditor from "./data/ProjectsDataEditor.svelte";
import TimelineDataEditor from "./data/TimelineDataEditor.svelte";

let {
	session,
	initialConfigSnapshot,
}: {
	session: AdminSession;
	initialConfigSnapshot?: {
		timeline?: {
			order: "desc" | "asc";
			categories: EditableCategory[];
		};
		projects?: {
			categories: EditableCategory[];
		};
		games?: {
			categories: EditableCategory[];
		};
	};
} = $props();

type DataDomain =
	| "timeline"
	| "projects"
	| "games"
	| "compass"
	| "friends"
	| "anime"
	| "devices"
	| "skills";

const VISUAL_DOMAINS: ReadonlySet<DataDomain> = new Set([
	"timeline",
	"projects",
	"games",
	"compass",
	"friends",
]);

const domainTabs: Array<{ id: DataDomain; label: string; path: string }> = [
	{ id: "timeline", label: "时间线", path: "src/data/json/timeline.json" },
	{ id: "projects", label: "项目展示", path: "src/data/json/projects.json" },
	{ id: "games", label: "游戏记录", path: "src/data/json/games.json" },
	{ id: "compass", label: "站点罗盘", path: "src/data/json/compass.json" },
	{ id: "friends", label: "友情链接", path: "src/data/json/friends.json" },
	{ id: "anime", label: "番剧", path: "src/data/json/anime.json" },
	{ id: "devices", label: "设备", path: "src/data/json/devices.json" },
	{ id: "skills", label: "技能", path: "src/data/json/skills.json" },
];

const DEFAULT_TIMELINE_CATEGORIES = $derived<readonly EditableCategory[]>(
	initialConfigSnapshot?.timeline?.categories ?? [],
);
const DEFAULT_PROJECTS_CATEGORIES = $derived<readonly EditableCategory[]>(
	initialConfigSnapshot?.projects?.categories ?? [],
);
const DEFAULT_GAMES_CATEGORIES = $derived<readonly EditableCategory[]>(
	initialConfigSnapshot?.games?.categories ?? [],
);

let activeDomain = $state<DataDomain>("timeline");
let editMode = $state<"visual" | "json">("visual");
let loading = $state(false);
let saving = $state(false);
let rawJsonText = $state("[]");
let jsonError = $state("");

// Visual domain states
let timelineItems = $state<TimelineItem[]>([]);
let timelineCategories = $state<EditableCategory[]>([]);
let timelineOrder = $state<"desc" | "asc">("desc");

let projectItems = $state<ProjectItem[]>([]);
let projectCategories = $state<EditableCategory[]>([]);

let gameItems = $state<GameItem[]>([]);
let gameCategories = $state<EditableCategory[]>([]);

let compassShelves = $state<CompassShelf[]>([]);
let friends = $state<FriendItem[]>([]);

let rawOverrides = $state<Record<string, unknown>>({});
let configDirtyDomains = $state<Set<"timeline" | "projects" | "games">>(
	new Set(),
);
let pendingUploadsByDomain = $state<
	Partial<Record<DataDomain, Map<string, Uint8Array>>>
>({});

const currentTab = $derived(
	domainTabs.find((d) => d.id === activeDomain) ?? domainTabs[0],
);
const supportsVisual = $derived(VISUAL_DOMAINS.has(activeDomain));
const currentPendingUploads = $derived(
	pendingUploadsByDomain[activeDomain] ?? new Map<string, Uint8Array>(),
);

function applyDefaultCategorySnapshots() {
	timelineCategories = normalizeCategoryConfigs(DEFAULT_TIMELINE_CATEGORIES);
	timelineOrder = initialConfigSnapshot?.timeline?.order ?? "desc";
	projectCategories = normalizeCategoryConfigs(DEFAULT_PROJECTS_CATEGORIES);
	gameCategories = normalizeCategoryConfigs(DEFAULT_GAMES_CATEGORIES);
}

function markConfigDirty(domain: "timeline" | "projects" | "games") {
	if (configDirtyDomains.has(domain)) return;
	const next = new Set(configDirtyDomains);
	next.add(domain);
	configDirtyDomains = next;
}

function handleUploadFile(
	domain: DataDomain,
	repoPath: string,
	bytes: Uint8Array,
) {
	const existing = new Map(pendingUploadsByDomain[domain] ?? []);
	existing.set(repoPath, bytes);
	pendingUploadsByDomain = {
		...pendingUploadsByDomain,
		[domain]: existing,
	};
}

function clearPendingUploadsForDomain(domain: DataDomain) {
	if (!pendingUploadsByDomain[domain]) return;
	const next = { ...pendingUploadsByDomain };
	delete next[domain];
	pendingUploadsByDomain = next;
}

function parseIntoVisualState(domain: DataDomain, parsed: unknown) {
	if (domain === "timeline") {
		timelineItems = normalizeTimelineItems(parsed);
	} else if (domain === "projects") {
		projectItems = normalizeProjectItems(parsed);
	} else if (domain === "games") {
		gameItems = normalizeGameItems(parsed);
	} else if (domain === "compass") {
		compassShelves = normalizeCompassShelves(parsed);
	} else if (domain === "friends") {
		friends = normalizeFriendItems(parsed);
	}
}

function serializeFromVisualState(domain: DataDomain): string {
	if (domain === "timeline") return serializeTimelineItems(timelineItems);
	if (domain === "projects") return serializeProjectItems(projectItems);
	if (domain === "games") return serializeGameItems(gameItems);
	if (domain === "compass") return serializeCompassShelves(compassShelves);
	if (domain === "friends") return `${JSON.stringify(friends, null, 2)}\n`;
	return rawJsonText;
}

function hydrateOverrides(overrides: Record<string, unknown>) {
	rawOverrides = overrides;
	const t = overrides.timeline as Record<string, unknown> | undefined;
	if (t) {
		if (Array.isArray(t.categories)) {
			timelineCategories = normalizeCategoryConfigs(t.categories);
		}
		if (t.order === "asc" || t.order === "desc") {
			timelineOrder = t.order;
		}
	}
	const p = overrides.projects as Record<string, unknown> | undefined;
	if (p && Array.isArray(p.categories)) {
		projectCategories = normalizeCategoryConfigs(p.categories);
	}
	const g = overrides.games as Record<string, unknown> | undefined;
	if (g && Array.isArray(g.categories)) {
		gameCategories = normalizeCategoryConfigs(g.categories);
	}
}

async function loadDomain(domain: DataDomain = activeDomain) {
	const tab = domainTabs.find((d) => d.id === domain);
	if (!tab) return;
	loading = true;
	jsonError = "";
	try {
		const [dataFile, overrideFile] = await Promise.all([
			readRepoTextFile(session, tab.path),
			domain === "timeline" || domain === "projects" || domain === "games"
				? readRepoTextFile(session, "src/data/json/admin-overrides.json")
				: Promise.resolve(null),
		]);

		const text = dataFile ? dataFile.content : "[]";
		rawJsonText = text;
		if (VISUAL_DOMAINS.has(domain)) {
			const parsed = JSON.parse(text) as unknown;
			parseIntoVisualState(domain, parsed);
		}
		if (overrideFile?.content) {
			hydrateOverrides(
				JSON.parse(overrideFile.content) as Record<string, unknown>,
			);
		}
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "读取数据失败");
	} finally {
		loading = false;
	}
}

function toggleEditMode(nextMode: "visual" | "json") {
	if (nextMode === editMode) return;
	jsonError = "";
	if (nextMode === "json") {
		rawJsonText = serializeFromVisualState(activeDomain);
		editMode = "json";
		return;
	}
	try {
		const parsed = JSON.parse(rawJsonText) as unknown;
		parseIntoVisualState(activeDomain, parsed);
		editMode = "visual";
	} catch (error) {
		jsonError = `JSON 语法错误，请修正后再切换回可视化编辑：${error instanceof Error ? error.message : "无法解析"}`;
	}
}

async function handleSave(stageOnly = false) {
	jsonError = "";
	let formatted = rawJsonText;
	try {
		if (supportsVisual && editMode === "visual") {
			formatted = serializeFromVisualState(activeDomain);
		} else {
			const parsed = JSON.parse(rawJsonText) as unknown;
			if (supportsVisual) {
				parseIntoVisualState(activeDomain, parsed);
				formatted = serializeFromVisualState(activeDomain);
			} else {
				formatted = `${JSON.stringify(parsed, null, 2)}\n`;
			}
		}
		rawJsonText = formatted;
	} catch (error) {
		jsonError = `JSON 语法错误：${error instanceof Error ? error.message : "无法解析"}`;
		return;
	}

	const changes: RepoFileChange[] = [
		...buildPendingUploadChanges(currentPendingUploads),
		{
			path: currentTab.path,
			action: "upsert",
			content: formatted,
		},
	];

	const shouldWriteOverrides =
		(activeDomain === "timeline" ||
			activeDomain === "projects" ||
			activeDomain === "games") &&
		configDirtyDomains.has(activeDomain);

	if (shouldWriteOverrides) {
		let latestOverrides = rawOverrides;
		try {
			const latestFile = await readRepoTextFile(
				session,
				"src/data/json/admin-overrides.json",
			);
			if (latestFile?.content) {
				latestOverrides = JSON.parse(latestFile.content) as Record<
					string,
					unknown
				>;
			}
		} catch {
			// Fall back to in-memory snapshot if override fetch fails.
		}

		let merged = latestOverrides;
		if (activeDomain === "timeline") {
			merged = mergeDomainConfigOverride(merged, "timeline", {
				categories: timelineCategories,
				order: timelineOrder,
			});
		} else if (activeDomain === "projects") {
			merged = mergeDomainConfigOverride(merged, "projects", {
				categories: projectCategories,
			});
		} else if (activeDomain === "games") {
			merged = mergeDomainConfigOverride(merged, "games", {
				categories: gameCategories,
			});
		}
		rawOverrides = merged;
		changes.push({
			path: "src/data/json/admin-overrides.json",
			action: "upsert",
			content: `${JSON.stringify(merged, null, 2)}\n`,
		});
	}

	if (stageOnly) {
		enqueueStagedBatch(`更新${currentTab.label}`, changes);
		clearPendingUploadsForDomain(activeDomain);
		if (
			shouldWriteOverrides &&
			activeDomain !== "compass" &&
			activeDomain !== "friends"
		) {
			const nextDirty = new Set(configDirtyDomains);
			nextDirty.delete(activeDomain as "timeline" | "projects" | "games");
			configDirtyDomains = nextDirty;
		}
		showSnackbar("已加入批量发布队列");
		return;
	}

	saving = true;
	try {
		await commitRepoChanges(
			session,
			`content(${activeDomain}): update ${currentTab.label}`,
			changes,
		);
		clearPendingUploadsForDomain(activeDomain);
		if (
			shouldWriteOverrides &&
			(activeDomain === "timeline" ||
				activeDomain === "projects" ||
				activeDomain === "games")
		) {
			const nextDirty = new Set(configDirtyDomains);
			nextDirty.delete(activeDomain);
			configDirtyDomains = nextDirty;
		}
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
	applyDefaultCategorySnapshots();
	void loadDomain("timeline");
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
					if (!VISUAL_DOMAINS.has(tab.id)) editMode = "json";
					else editMode = "visual";
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
					{#if supportsVisual}
						支持可视化增改删排序、UI 图标选取与 Tag 管理；也可随时切换到底层 JSON 源码校验编辑。
					{:else}
						直接在线编辑结构化 JSON 数据（自动校验语法格式），省去本地翻找源码文件。
					{/if}
				</p>
			</div>

			<div class="data-admin__head-actions">
				{#if supportsVisual}
					<div class="data-admin__mode-switch" role="group" aria-label="编辑模式">
						<button
							type="button"
							class="data-admin__mode-btn"
							class:data-admin__mode-btn--active={editMode === "visual"}
							onclick={() => toggleEditMode("visual")}
						>
							可视化编辑
						</button>
						<button
							type="button"
							class="data-admin__mode-btn"
							class:data-admin__mode-btn--active={editMode === "json"}
							onclick={() => toggleEditMode("json")}
						>
							JSON 源码
						</button>
					</div>
				{/if}
				<Button
					variant="outlined"
					size="xsmall"
					icon="material-symbols:refresh-rounded"
					label={loading ? "同步中..." : "重新读取"}
					onclick={() => loadDomain(activeDomain)}
				/>
			</div>
		</div>

		{#if supportsVisual && editMode === "visual"}
			{#if activeDomain === "timeline"}
				<TimelineDataEditor
					bind:items={timelineItems}
					bind:categories={timelineCategories}
					defaultCategories={DEFAULT_TIMELINE_CATEGORIES}
					bind:order={timelineOrder}
					onConfigChange={() => markConfigDirty("timeline")}
				/>
			{:else if activeDomain === "projects"}
				<ProjectsDataEditor
					bind:items={projectItems}
					bind:categories={projectCategories}
					defaultCategories={DEFAULT_PROJECTS_CATEGORIES}
					onUploadFile={(path, bytes) => handleUploadFile("projects", path, bytes)}
					onConfigChange={() => markConfigDirty("projects")}
				/>
			{:else if activeDomain === "games"}
				<GamesDataEditor
					bind:items={gameItems}
					bind:categories={gameCategories}
					defaultCategories={DEFAULT_GAMES_CATEGORIES}
					onUploadFile={(path, bytes) => handleUploadFile("games", path, bytes)}
					onConfigChange={() => markConfigDirty("games")}
				/>
			{:else if activeDomain === "compass"}
				<CompassDataEditor
					bind:shelves={compassShelves}
					onUploadFile={(path, bytes) => handleUploadFile("compass", path, bytes)}
				/>
			{:else if activeDomain === "friends"}
				<FriendsDataEditor bind:friends />
			{/if}
		{:else}
			<textarea
				class="data-admin__textarea"
				rows="18"
				bind:value={rawJsonText}
				aria-label={`${currentTab.label} JSON 源码编辑器`}
			></textarea>
		{/if}

		{#if jsonError}
			<p class="data-admin__error">{jsonError}</p>
		{/if}

		{#if currentPendingUploads.size > 0}
			<p class="data-admin__upload-note">
				已暂存 {currentPendingUploads.size} 个本地图片上传任务，将在点击保存/提交时随数据一起写入仓库。
			</p>
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

	&__head-actions
		display: flex
		flex-wrap: wrap
		align-items: center
		gap: 0.5rem

	&__mode-switch
		display: inline-flex
		padding: 0.15rem
		border-radius: var(--shape-corner-full)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)

	&__mode-btn
		padding: 0.25rem 0.7rem
		border-radius: var(--shape-corner-full)
		border: none
		background: transparent
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-medium)
		cursor: pointer

		&--active
			background: var(--primary)
			color: var(--on-primary)

	&__title
		margin: 0
		font: var(--m3e-type-title-medium)
		color: var(--on-surface)

	&__sub
		margin: 0.25rem 0 0
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

	&__upload-note
		margin: 0.75rem 0 0
		color: var(--primary)
		font: var(--m3e-type-body-small)

	&__actions
		display: flex
		flex-wrap: wrap
		justify-content: flex-end
		gap: 0.75rem
		margin-top: 1.25rem
</style>
