<script lang="ts">
import Button from "@components/atoms/action/Button.svelte";
import Card from "@components/atoms/display/Card.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import Switch from "@components/atoms/selection/Switch.svelte";
import Icon from "@iconify/svelte";
import {
	type AdminSession,
	type CommitProgress,
	commitRepoChanges,
	compressImageToWebP,
	enqueueStagedBatch,
	listRepoDirectory,
	type ParsedAudioMeta,
	parseAudioFileForAdmin,
	type RepoFileChange,
	readFileBytes,
	readRepoTextFile,
	sanitizeUploadFilename,
} from "@utils/admin";
import { isSupportedAudioFilename } from "@utils/music/filename-parser";
import { showSnackbar } from "@utils/snackbar";
import { onMount } from "svelte";
import type {
	MetingServer,
	MetingType,
	MusicProvider,
	PlaybackMode,
	TrackDescriptor,
} from "@/types/musicConfig";

let { session }: { session: AdminSession } = $props();

interface PendingAudioUpload {
	readonly key: string;
	selected: boolean;
	id: string;
	title: string;
	artist: string;
	duration?: number;
	readonly file: File;
	readonly targetAudioPath: string;
	readonly targetPublicSource: string;
	readonly coverWebpBytes?: Uint8Array;
	readonly coverPublicPath?: string;
	readonly coverPreviewUrl?: string;
	readonly sizeMb: number;
}

interface EditableTrack {
	id: string;
	title: string;
	artist: string;
	source: string;
	cover: string;
	duration?: number;
}

let tracks = $state<EditableTrack[]>([]);
let excludedSources = $state<string[]>([]);
let folderAudioFiles = $state<string[]>([]);
let pendingUploads = $state<PendingAudioUpload[]>([]);
let parsingFolder = $state(false);
let loading = $state(false);
let saving = $state(false);
let uploadProgress = $state<CommitProgress | null>(null);
let deleteUnderlyingFile = $state(true);

// Add single custom track form
let newTrackTitle = $state("");
let newTrackArtist = $state("");
let newTrackSource = $state("");
let newTrackCover = $state("");
let newTrackDuration = $state("");

// Music global config (written into admin-overrides.json)
let musicEnable = $state(true);
let provider = $state<MusicProvider>("mixed");
let metingServer = $state<MetingServer>("netease");
let metingType = $state<MetingType>("playlist");
let metingId = $state("14164869977");
let metingPreload = $state<"none" | "metadata">("none");
let defaultVolume = $state(0.7);
let defaultMode = $state<PlaybackMode>("sequence");

let editingIndex = $state<number | null>(null);

const selectedPendingCount = $derived(
	pendingUploads.filter((item) => item.selected).length,
);
const selectedPendingMb = $derived(
	pendingUploads
		.filter((item) => item.selected)
		.reduce((sum, item) => sum + item.sizeMb, 0),
);

function attachDirectoryAttr(node: HTMLInputElement) {
	node.setAttribute("webkitdirectory", "");
	node.setAttribute("directory", "");
}

async function loadMusicData() {
	loading = true;
	try {
		const [musicFile, folderEntries, overridesFile] = await Promise.all([
			readRepoTextFile(session, "src/data/json/music.json"),
			listRepoDirectory(session, "public/assets/music/url"),
			readRepoTextFile(session, "src/data/json/admin-overrides.json"),
		]);

		if (musicFile) {
			const parsed = JSON.parse(musicFile.content) as {
				tracks?: TrackDescriptor[];
				excludedSources?: string[];
			};
			tracks = (parsed.tracks ?? []).map((t) => ({
				id: t.id,
				title: t.title,
				artist: t.artist || "",
				source: t.source,
				cover: t.cover || "",
				duration: t.duration,
			}));
			excludedSources = [...(parsed.excludedSources ?? [])];
		}

		folderAudioFiles = folderEntries
			.filter((e) => e.type === "file" && isSupportedAudioFilename(e.name))
			.map((e) => e.name);

		if (overridesFile) {
			const overrides = JSON.parse(overridesFile.content) as {
				music?: Record<string, unknown>;
			};
			const m = overrides.music;
			if (m) {
				if (typeof m.enable === "boolean") musicEnable = m.enable;
				if (typeof m.provider === "string")
					provider = m.provider as MusicProvider;
				if (typeof m.defaultVolume === "number")
					defaultVolume = m.defaultVolume;
				if (typeof m.defaultMode === "string")
					defaultMode = m.defaultMode as PlaybackMode;
				const meting = m.meting as Record<string, unknown> | undefined;
				if (meting) {
					if (typeof meting.server === "string")
						metingServer = meting.server as MetingServer;
					if (typeof meting.type === "string")
						metingType = meting.type as MetingType;
					if (typeof meting.id === "string") metingId = meting.id;
					if (meting.preload === "metadata" || meting.preload === "none")
						metingPreload = meting.preload;
				}
			}
		}
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "读取音乐配置失败");
	} finally {
		loading = false;
	}
}

async function handleAudioSelection(fileList: FileList | File[]) {
	const audioFiles = Array.from(fileList).filter((file) =>
		isSupportedAudioFilename(file.name),
	);
	if (audioFiles.length === 0) {
		showSnackbar("未检测到支持的音频文件（.mp3 / .m4a / .ogg / .flac / .wav）");
		return;
	}

	parsingFolder = true;
	const existingIds = new Set([
		...tracks.map((t) => t.id),
		...pendingUploads.map((p) => p.id),
	]);

	const results: PendingAudioUpload[] = [];
	for (const file of audioFiles) {
		try {
			const meta: ParsedAudioMeta = await parseAudioFileForAdmin(file);
			let uniqueId = meta.id;
			let n = 2;
			while (existingIds.has(uniqueId)) {
				uniqueId = `${meta.id}-${n}`;
				n += 1;
			}
			existingIds.add(uniqueId);

			const safeAudioName = sanitizeUploadFilename(file.name, ".mp3");
			const targetAudioPath = `public/assets/music/url/${safeAudioName}`;
			const targetPublicSource = `/assets/music/url/${safeAudioName}`;

			let coverWebpBytes: Uint8Array | undefined;
			let coverPublicPath: string | undefined;
			let coverPreviewUrl: string | undefined;

			if (meta.coverBytes) {
				try {
					const compressed = await compressImageToWebP(
						new Blob([meta.coverBytes.buffer as ArrayBuffer], {
							type: meta.coverMimeType || "image/jpeg",
						}),
						{ maxDimension: 512, quality: 0.84 },
					);
					coverWebpBytes = compressed.bytes;
					coverPublicPath = `/assets/music/cover/${uniqueId}.webp`;
					coverPreviewUrl = URL.createObjectURL(
						new Blob([compressed.bytes.buffer as ArrayBuffer], {
							type: "image/webp",
						}),
					);
				} catch {
					// Ignore malformed embedded cover art
				}
			}

			results.push({
				key: `${Date.now()}-${Math.random()}`,
				selected: true,
				id: uniqueId,
				title: meta.title,
				artist: meta.artist || "",
				duration: meta.duration,
				file,
				targetAudioPath,
				targetPublicSource,
				coverWebpBytes,
				coverPublicPath,
				coverPreviewUrl,
				sizeMb: Math.round((file.size / (1024 * 1024)) * 100) / 100,
			});
		} catch (error) {
			showSnackbar(
				`解析 ${file.name} 失败: ${error instanceof Error ? error.message : ""}`,
			);
		}
	}

	pendingUploads = [...pendingUploads, ...results];
	parsingFolder = false;
	showSnackbar(`已解析 ${results.length} 首音频，可核对信息后一键上传`);
}

function clearPendingUploads() {
	for (const p of pendingUploads) {
		if (p.coverPreviewUrl) URL.revokeObjectURL(p.coverPreviewUrl);
	}
	pendingUploads = [];
}

async function handleUploadPendingBatch() {
	const chosen = pendingUploads.filter((p) => p.selected);
	if (chosen.length === 0) return;

	saving = true;
	uploadProgress = null;
	try {
		const changes: RepoFileChange[] = [];
		const nextTracks = [...tracks];

		for (const item of chosen) {
			const audioBytes = await readFileBytes(item.file);
			changes.push({
				path: item.targetAudioPath,
				action: "upsert",
				content: audioBytes,
			});
			if (item.coverWebpBytes && item.coverPublicPath) {
				changes.push({
					path: `public${item.coverPublicPath}`,
					action: "upsert",
					content: item.coverWebpBytes,
				});
			}

			const existingIdx = nextTracks.findIndex(
				(t) => t.source === item.targetPublicSource,
			);
			const entry: EditableTrack = {
				id: item.id.trim() || `track-${Date.now()}`,
				title: item.title.trim() || item.file.name,
				artist: item.artist.trim(),
				source: item.targetPublicSource,
				cover: item.coverPublicPath || "",
				...(item.duration ? { duration: item.duration } : {}),
			};
			if (existingIdx >= 0) nextTracks[existingIdx] = entry;
			else nextTracks.push(entry);
		}

		const nextExcluded = excludedSources.filter(
			(src) => !chosen.some((c) => c.targetPublicSource === src),
		);
		changes.push({
			path: "src/data/json/music.json",
			action: "upsert",
			content: buildMusicJsonString(nextTracks, nextExcluded),
		});

		await commitRepoChanges(
			session,
			`feat(music): upload ${chosen.length} MP3 track(s)`,
			changes,
			(p) => (uploadProgress = p),
		);

		clearPendingUploads();
		showSnackbar(`成功上传 ${chosen.length} 首曲目到歌单`, {
			icon: "material-symbols:check-circle-outline-rounded",
		});
		await loadMusicData();
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "上传失败", {
			icon: "material-symbols:error-outline-rounded",
		});
	} finally {
		saving = false;
	}
}

function buildMusicJsonString(
	list: readonly EditableTrack[],
	excluded: readonly string[],
): string {
	const serializedTracks = list.map((t) => ({
		id: t.id.trim(),
		title: t.title.trim(),
		...(t.artist.trim() ? { artist: t.artist.trim() } : {}),
		...(t.cover.trim() ? { cover: t.cover.trim() } : {}),
		source: t.source.trim(),
		...(typeof t.duration === "number" && t.duration > 0
			? { duration: Math.round(t.duration) }
			: {}),
	}));
	return `${JSON.stringify({ tracks: serializedTracks, excludedSources: excluded }, null, 2)}\n`;
}

function addExternalTrack() {
	if (!newTrackTitle.trim() || !newTrackSource.trim()) {
		showSnackbar("请填写曲目标题与音频 URL");
		return;
	}
	const dur = Number(newTrackDuration);
	tracks = [
		...tracks,
		{
			id: `track-${Date.now().toString(36)}`,
			title: newTrackTitle.trim(),
			artist: newTrackArtist.trim(),
			source: newTrackSource.trim(),
			cover: newTrackCover.trim(),
			...(Number.isFinite(dur) && dur > 0 ? { duration: Math.round(dur) } : {}),
		},
	];
	newTrackTitle = "";
	newTrackArtist = "";
	newTrackSource = "";
	newTrackCover = "";
	newTrackDuration = "";
}

function moveTrack(index: number, delta: -1 | 1) {
	const target = index + delta;
	if (target < 0 || target >= tracks.length) return;
	const copy = [...tracks];
	const [item] = copy.splice(index, 1);
	copy.splice(target, 0, item);
	tracks = copy;
}

async function removeTrack(index: number) {
	if (saving) return;
	const target = tracks[index];
	if (!target) return;
	const nextTracks = tracks.filter((_, i) => i !== index);
	const changes: RepoFileChange[] = [];
	const nextExcluded = [...excludedSources];

	const isLocalManaged = target.source.startsWith("/assets/music/url/");
	if (isLocalManaged) {
		const fileName = decodeURIComponent(
			target.source.replace(/^\/assets\/music\/url\//, ""),
		);
		if (deleteUnderlyingFile && folderAudioFiles.includes(fileName)) {
			changes.push({
				path: `public/assets/music/url/${fileName}`,
				action: "delete",
			});
		} else if (!nextExcluded.includes(target.source)) {
			nextExcluded.push(target.source);
		}
	}

	saving = true;
	try {
		changes.push({
			path: "src/data/json/music.json",
			action: "upsert",
			content: buildMusicJsonString(nextTracks, nextExcluded),
		});
		await commitRepoChanges(
			session,
			`chore(music): remove track ${target.title}`,
			changes,
		);
		tracks = nextTracks;
		excludedSources = nextExcluded;
		showSnackbar(`已删除「${target.title}」并提交到仓库`);
		await loadMusicData();
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "删除失败");
	} finally {
		saving = false;
	}
}

async function handleSavePlaylistAndSettings(stageOnly = false) {
	saving = true;
	try {
		const overridesFile = await readRepoTextFile(
			session,
			"src/data/json/admin-overrides.json",
		);
		const existingOverrides = overridesFile
			? (JSON.parse(overridesFile.content) as Record<string, unknown>)
			: {};
		const nextOverrides = {
			...existingOverrides,
			music: {
				enable: musicEnable,
				provider,
				meting: {
					server: metingServer,
					type: metingType,
					id: metingId.trim(),
					preload: metingPreload,
				},
				defaultVolume: Number(defaultVolume),
				defaultMode,
			},
		};

		const changes: RepoFileChange[] = [
			{
				path: "src/data/json/music.json",
				action: "upsert",
				content: buildMusicJsonString(tracks, excludedSources),
			},
			{
				path: "src/data/json/admin-overrides.json",
				action: "upsert",
				content: `${JSON.stringify(nextOverrides, null, 2)}\n`,
			},
		];

		if (stageOnly) {
			enqueueStagedBatch("更新音乐歌单与播放器配置", changes);
			showSnackbar("已加入批量发布队列");
			return;
		}

		await commitRepoChanges(
			session,
			"feat(music): update playlist and player settings",
			changes,
		);
		showSnackbar("音乐歌单与设置已提交，GitHub Pages 重建后生效", {
			icon: "material-symbols:check-circle-outline-rounded",
		});
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "保存失败");
	} finally {
		saving = false;
	}
}

onMount(() => {
	void loadMusicData();
});
</script>

<div class="music-admin">
	<Card color="var(--card-bg)" radius="l" class="p-5 md:p-6">
		<div class="music-admin__head">
			<div>
				<h2 class="music-admin__title">导入本地 MP3 文件夹 / 批量上传歌曲</h2>
				<p class="music-admin__sub">
					直接选中你电脑里全是 .mp3 的文件夹，自动提取 ID3 歌名、歌手、时长与内嵌专辑封面（自动压成 WebP），一次性打包提交到仓库。
				</p>
			</div>
			<Button
				variant="outlined"
				size="xsmall"
				icon="material-symbols:refresh-rounded"
				label={loading ? "同步中..." : "刷新歌单"}
				disabled={loading}
				onclick={loadMusicData}
			/>
		</div>

		<div
			class="music-admin__dropzone"
			role="region"
			aria-label="拖入 MP3 文件"
			ondragover={(e) => e.preventDefault()}
			ondrop={(e) => {
				e.preventDefault();
				const files = e.dataTransfer?.files;
				if (files) void handleAudioSelection(files);
			}}
		>
			<Icon icon="material-symbols:folder-open-outline-rounded" class="music-admin__drop-icon" />
			<p class="music-admin__drop-title">
				{parsingFolder ? "正在读取 MP3 元数据与封面..." : "拖入 MP3 歌曲，或直接选择整个文件夹"}
			</p>
			<div class="music-admin__drop-btns">
				<label class="music-admin__pick-btn music-admin__pick-btn--primary m3-state-layer">
					<Icon icon="material-symbols:folder-open-outline-rounded" aria-hidden="true" />
					<span>选择整个 MP3 文件夹</span>
					<input
						type="file"
						multiple
						hidden
						use:attachDirectoryAttr
						onchange={(e) => {
							const files = (e.currentTarget as HTMLInputElement).files;
							if (files) void handleAudioSelection(files);
							(e.currentTarget as HTMLInputElement).value = "";
						}}
					/>
				</label>
				<label class="music-admin__pick-btn m3-state-layer">
					<Icon icon="material-symbols:library-music-outline-rounded" aria-hidden="true" />
					<span>多选音频文件</span>
					<input
						type="file"
						accept=".mp3,.m4a,.ogg,.wav,.flac,.aac,audio/*"
						multiple
						hidden
						onchange={(e) => {
							const files = (e.currentTarget as HTMLInputElement).files;
							if (files) void handleAudioSelection(files);
							(e.currentTarget as HTMLInputElement).value = "";
						}}
					/>
				</label>
			</div>
		</div>

		{#if pendingUploads.length > 0}
			<div class="music-admin__pending">
				<div class="music-admin__pending-head">
					<span>
						待上传队列：已选 <strong>{selectedPendingCount}</strong> 首（约
						<strong>{selectedPendingMb.toFixed(1)} MB</strong>）
						{#if selectedPendingMb > 45}
							<em class="music-admin__warn-inline">
								· 体积较大，建议每次勾选 10~15 首分批上传以保持 GitHub 提交稳定
							</em>
						{/if}
					</span>
					<div class="music-admin__pending-actions">
						<Button variant="text" size="xsmall" label="清空待传" onclick={clearPendingUploads} />
						<Button
							variant="filled"
							size="small"
							icon="material-symbols:cloud-upload-outline-rounded"
							label={saving ? "上传中..." : `上传 ${selectedPendingCount} 首并加入歌单`}
							disabled={saving || selectedPendingCount === 0}
							onclick={handleUploadPendingBatch}
						/>
					</div>
				</div>

				{#if uploadProgress}
					<p class="music-admin__progress">
						正在上传 ({uploadProgress.completed}/{uploadProgress.total})：{uploadProgress.currentPath ?? ""}
					</p>
				{/if}

				<div class="music-admin__pending-list">
					{#each pendingUploads as item (item.key)}
						<div class="music-admin__pending-row">
							<input type="checkbox" bind:checked={item.selected} aria-label={`选择 ${item.title}`} />
							{#if item.coverPreviewUrl}
								<img class="music-admin__thumb" src={item.coverPreviewUrl} alt={item.title} />
							{:else}
								<div class="music-admin__thumb music-admin__thumb--empty">
									<Icon icon="material-symbols:library-music-outline-rounded" />
								</div>
							{/if}
							<div class="music-admin__pending-inputs">
								<input type="text" placeholder="歌曲标题" bind:value={item.title} />
								<input type="text" placeholder="歌手" bind:value={item.artist} />
							</div>
							<span class="music-admin__size">
								{item.sizeMb} MB{item.duration ? ` · ${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, "0")}` : ""}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</Card>

	<Card color="var(--card-bg)" radius="l" class="p-5 md:p-6">
		<div class="music-admin__head">
			<div>
				<h2 class="music-admin__title">当前本地歌单 ({tracks.length} 首)</h2>
				<p class="music-admin__sub">
					支持编辑信息、拖拽/上下排序、删除歌曲，以及直接把 MP3 放进仓库 <code>public/assets/music/url/</code> 目录自动扫描。
				</p>
			</div>
			<label class="music-admin__switch-row">
				<Switch bind:checked={deleteUnderlyingFile} label="同时删除仓库里的 MP3 文件" icons />
				<span>删歌时同步删库里对应 MP3</span>
			</label>
		</div>

		<div class="music-admin__track-list">
			{#each tracks as track, idx (track.id + idx)}
				<div class="music-admin__track-row">
					<div class="music-admin__track-main">
						<strong>{idx + 1}. {track.title}</strong>
						<span>{track.artist || "未知歌手"} · <code>{track.source}</code></span>
					</div>
					<div class="music-admin__track-btns">
						<Button
							variant="text"
							size="xsmall"
							icon="material-symbols:arrow-upward-rounded"
							ariaLabel="上移"
							disabled={idx === 0}
							onclick={() => moveTrack(idx, -1)}
						/>
						<Button
							variant="text"
							size="xsmall"
							icon="material-symbols:arrow-downward-rounded"
							ariaLabel="下移"
							disabled={idx === tracks.length - 1}
							onclick={() => moveTrack(idx, 1)}
						/>
						<Button
							variant="text"
							size="xsmall"
							icon="material-symbols:edit-outline-rounded"
							ariaLabel="编辑"
							onclick={() => (editingIndex = editingIndex === idx ? null : idx)}
						/>
						<Button
							variant="text"
							size="xsmall"
							icon="material-symbols:delete-outline-rounded"
							ariaLabel="删除"
							disabled={saving}
							onclick={() => removeTrack(idx)}
						/>
					</div>
				</div>

				{#if editingIndex === idx}
					<div class="music-admin__track-edit">
						<TextField label="歌名" variant="outlined" bind:value={track.title} />
						<TextField label="歌手" variant="outlined" bind:value={track.artist} />
						<TextField label="音频路径 / URL" variant="outlined" bind:value={track.source} />
						<TextField label="封面路径 / URL" variant="outlined" bind:value={track.cover} />
					</div>
				{/if}
			{/each}
		</div>

		<div class="music-admin__add-ext">
			<h3 class="music-admin__sub-title">添加外链曲目</h3>
			<div class="music-admin__grid">
				<TextField label="歌名" variant="outlined" bind:value={newTrackTitle} />
				<TextField label="歌手" variant="outlined" bind:value={newTrackArtist} />
				<TextField label="音频 URL (https://...)" variant="outlined" bind:value={newTrackSource} />
				<TextField label="封面 URL (可选)" variant="outlined" bind:value={newTrackCover} />
				<TextField label="时长秒数 (可选)" variant="outlined" bind:value={newTrackDuration} />
			</div>
			<div class="music-admin__right">
				<Button variant="tonal" size="small" icon="material-symbols:add-rounded" label="添加到歌单" onclick={addExternalTrack} />
			</div>
		</div>
	</Card>

	<Card color="var(--card-bg)" radius="l" class="p-5 md:p-6">
		<h2 class="music-admin__title">播放器模式与云端歌单配置</h2>
		<div class="music-admin__settings-grid">
			<label class="music-admin__switch-row">
				<Switch bind:checked={musicEnable} label="启用侧栏音乐播放器" icons />
				<span>启用侧栏音乐播放器</span>
			</label>
			<label class="music-admin__select">
				<span>音源模式：</span>
				<select bind:value={provider}>
					<option value="local">local（仅本地 MP3 歌单）</option>
					<option value="mixed">mixed（本地 + 云端歌单合并）</option>
					<option value="meting">meting（仅网易云/QQ云端歌单）</option>
					<option value="custom">custom（自定义列表）</option>
				</select>
			</label>
			<label class="music-admin__select">
				<span>播放模式：</span>
				<select bind:value={defaultMode}>
					<option value="sequence">顺序循环 (sequence)</option>
					<option value="repeat-one">单曲循环 (repeat-one)</option>
					<option value="shuffle">随机播放 (shuffle)</option>
				</select>
			</label>
			<label class="music-admin__select">
				<span>默认音量 ({Math.round(defaultVolume * 100)}%)：</span>
				<input type="range" min="0" max="1" step="0.05" bind:value={defaultVolume} />
			</label>
		</div>

		{#if provider === "meting" || provider === "mixed"}
			<div class="music-admin__grid">
				<label class="music-admin__select">
					<span>云端平台：</span>
					<select bind:value={metingServer}>
						<option value="netease">网易云音乐 (netease)</option>
						<option value="tencent">QQ 音乐 (tencent)</option>
						<option value="kugou">酷狗 (kugou)</option>
					</select>
				</label>
				<label class="music-admin__select">
					<span>类型：</span>
					<select bind:value={metingType}>
						<option value="playlist">歌单 (playlist)</option>
						<option value="album">专辑 (album)</option>
						<option value="song">单曲 (song)</option>
					</select>
				</label>
				<TextField label="云端歌单 ID" variant="outlined" bind:value={metingId} />
			</div>
		{/if}

		<div class="music-admin__actions">
			<Button
				variant="outlined"
				size="medium"
				label="加入批量队列"
				disabled={saving}
				onclick={() => handleSavePlaylistAndSettings(true)}
			/>
			<Button
				variant="filled"
				size="medium"
				icon="material-symbols:rocket-launch-outline-rounded"
				label={saving ? "保存中..." : "保存歌单与播放器配置"}
				disabled={saving}
				onclick={() => handleSavePlaylistAndSettings(false)}
			/>
		</div>
	</Card>
</div>

<style lang="stylus">
.music-admin
	display: flex
	flex-direction: column
	gap: 1.25rem

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

	&__sub-title
		margin: 1rem 0 0.5rem
		font: var(--m3e-type-label-large)
		color: var(--on-surface)

	&__sub
		margin: 0.25rem 0 0
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

	&__dropzone
		display: flex
		flex-direction: column
		align-items: center
		justify-content: center
		gap: 0.75rem
		padding: 1.75rem 1rem
		border-radius: var(--shape-corner-l)
		border: 2px dashed var(--outline)
		background: var(--surface-container-low)
		text-align: center

	:global(&__drop-icon)
		font-size: 2.25rem
		color: var(--primary)

	&__drop-title
		margin: 0
		font: var(--m3e-type-title-small)
		color: var(--on-surface)

	&__drop-btns
		display: flex
		flex-wrap: wrap
		gap: 0.75rem
		justify-content: center

	&__pick-btn
		display: inline-flex
		align-items: center
		gap: 0.5rem
		padding: 0.625rem 1.125rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline)
		background: var(--surface)
		color: var(--on-surface)
		font: var(--m3e-type-label-large)
		cursor: pointer

		&--primary
			background: var(--primary)
			color: var(--on-primary)
			border-color: transparent

	&__pending
		margin-top: 1rem
		padding: 1rem
		border-radius: var(--shape-corner-m)
		background: var(--surface-container-low)

	&__pending-head
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: 0.75rem
		margin-bottom: 0.75rem
		font: var(--m3e-type-body-medium)

	&__pending-actions
		display: flex
		gap: 0.5rem
		align-items: center

	&__warn-inline
		color: var(--error)
		font-style: normal

	&__progress
		margin: 0 0 0.75rem
		font: var(--m3e-type-body-small)
		color: var(--primary)

	&__pending-list
		display: flex
		flex-direction: column
		gap: 0.5rem
		max-height: 22rem
		overflow-y: auto

	&__pending-row
		display: flex
		align-items: center
		gap: 0.625rem
		padding: 0.5rem
		border-radius: var(--shape-corner-s)
		background: var(--surface)

	&__thumb
		width: 2.5rem
		height: 2.5rem
		border-radius: var(--shape-corner-xs)
		object-fit: cover
		flex-shrink: 0

		&--empty
			display: grid
			place-items: center
			background: var(--secondary-container)
			color: var(--on-secondary-container)

	&__pending-inputs
		display: flex
		flex-wrap: wrap
		gap: 0.5rem
		flex: 1 1 auto
		min-width: 0

		input
			flex: 1 1 8rem
			min-width: 0
			padding: 0.35rem 0.5rem
			border-radius: var(--shape-corner-xs)
			border: 1px solid var(--outline-variant)
			background: var(--surface-container-low)
			color: var(--on-surface)
			font: var(--m3e-type-body-small)

	&__size
		font: var(--m3e-type-label-small)
		color: var(--on-surface-variant)
		white-space: nowrap

	&__track-list
		display: flex
		flex-direction: column
		gap: 0.5rem

	&__track-row
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: 0.5rem
		padding: 0.625rem 0.875rem
		border-radius: var(--shape-corner-m)
		background: var(--surface-container-low)

	&__track-main
		display: flex
		flex-direction: column
		min-width: 0
		flex: 1 1 14rem

		strong
			font: var(--m3e-type-body-medium)
			color: var(--on-surface)

		span
			font: var(--m3e-type-body-small)
			color: var(--on-surface-variant)
			overflow: hidden
			text-overflow: ellipsis
			white-space: nowrap

	&__track-btns
		display: flex
		align-items: center
		gap: 0.125rem

	&__track-edit
		display: grid
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr))
		gap: 0.625rem
		padding: 0.75rem
		border-radius: var(--shape-corner-m)
		background: var(--surface-container)

	&__grid
		display: grid
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr))
		gap: 0.75rem
		margin-top: 0.75rem

	&__settings-grid
		display: flex
		flex-wrap: wrap
		gap: 1rem 1.5rem
		align-items: center
		margin-top: 0.75rem

	&__switch-row
		display: inline-flex
		align-items: center
		gap: 0.5rem
		font: var(--m3e-type-body-medium)
		color: var(--on-surface)
		cursor: pointer

	&__select
		display: inline-flex
		align-items: center
		gap: 0.5rem
		font: var(--m3e-type-body-medium)
		color: var(--on-surface)

		select
			padding: 0.4rem 0.625rem
			border-radius: var(--shape-corner-s)
			border: 1px solid var(--outline-variant)
			background: var(--surface-container-low)
			color: var(--on-surface)

	&__right
		display: flex
		justify-content: flex-end
		margin-top: 0.75rem

	&__actions
		display: flex
		flex-wrap: wrap
		justify-content: flex-end
		gap: 0.75rem
		margin-top: 1.25rem
</style>
