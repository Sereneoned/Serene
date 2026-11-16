<script lang="ts">
import Button from "@components/atoms/action/Button.svelte";
import Card from "@components/atoms/display/Card.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import Switch from "@components/atoms/selection/Switch.svelte";
import Icon from "@iconify/svelte";
import {
	type AdminSession,
	commitRepoChanges,
	compressImageToWebP,
	enqueueStagedBatch,
	formatDateYYYYMMDD,
	listRepoDirectory,
	type RepoDirectoryEntry,
	type RepoFileChange,
	readRepoTextFile,
	serializeAlbumInfoJson,
	toSlug,
} from "@utils/admin";
import { showSnackbar } from "@utils/snackbar";
import { onMount } from "svelte";
import type { AlbumLayout, AlbumPhoto } from "@/types/album";

let {
	session,
	initialAlbumId = "",
}: {
	session: AdminSession;
	initialAlbumId?: string;
} = $props();

interface RepoAlbumSummary {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly date: string;
	readonly location: string;
	readonly tags: string[];
	readonly layout: AlbumLayout;
	readonly columns: 2 | 3 | 4;
	readonly hidden: boolean;
	readonly password: string;
	readonly passwordHint: string;
	readonly mode: "local" | "external";
	readonly cover: string;
	readonly photos: AlbumPhoto[];
	readonly files: RepoDirectoryEntry[];
}

interface PendingAlbumPhoto {
	readonly id: string;
	readonly fileName: string;
	readonly previewUrl: string;
	readonly bytes: Uint8Array;
	readonly sizeKb: number;
}

let albums = $state<RepoAlbumSummary[]>([]);
let loading = $state(false);
let saving = $state(false);

let isNew = $state(true);
let albumId = $state("");
let title = $state("");
let description = $state("");
let date = $state(formatDateYYYYMMDD());
let location = $state("");
let tagsText = $state("");
let layout = $state<AlbumLayout>("masonry");
let columns = $state<2 | 3 | 4>(3);
let hidden = $state(false);
let password = $state("");
let passwordHint = $state("");
let mode = $state<"local" | "external">("local");

let coverUrl = $state("");
let coverBytes = $state<Uint8Array | null>(null);
let coverPreviewUrl = $state("");

let existingFiles = $state<RepoDirectoryEntry[]>([]);
let pendingLocalPhotos = $state<PendingAlbumPhoto[]>([]);
let deletedLocalFiles = $state<Set<string>>(new Set());
let externalPhotos = $state<AlbumPhoto[]>([]);
let newExtSrc = $state("");
let newExtTitle = $state("");

function resetToNew() {
	for (const p of pendingLocalPhotos) {
		URL.revokeObjectURL(p.previewUrl);
	}
	if (coverPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(coverPreviewUrl);
	isNew = true;
	albumId = "";
	title = "";
	description = "";
	date = formatDateYYYYMMDD();
	location = "";
	tagsText = "";
	layout = "masonry";
	columns = 3;
	hidden = false;
	password = "";
	passwordHint = "";
	mode = "local";
	coverUrl = "";
	coverBytes = null;
	coverPreviewUrl = "";
	existingFiles = [];
	pendingLocalPhotos = [];
	deletedLocalFiles = new Set();
	externalPhotos = [];
}

function selectAlbum(item: RepoAlbumSummary) {
	resetToNew();
	isNew = false;
	albumId = item.id;
	title = item.title;
	description = item.description;
	date = item.date;
	location = item.location;
	tagsText = item.tags.join(", ");
	layout = item.layout;
	columns = item.columns;
	hidden = item.hidden;
	password = item.password;
	passwordHint = item.passwordHint;
	mode = item.mode;
	coverUrl = item.cover;
	coverPreviewUrl = item.cover;
	existingFiles = item.files.filter(
		(f) =>
			f.type === "file" && f.name !== "info.json" && !/^cover\./i.test(f.name),
	);
	externalPhotos = [...item.photos];
}

async function loadAlbums() {
	loading = true;
	try {
		const dirs = await listRepoDirectory(session, "public/images/albums");
		const loaded: RepoAlbumSummary[] = [];
		for (const dir of dirs.filter((d) => d.type === "dir")) {
			const infoFile = await readRepoTextFile(
				session,
				`public/images/albums/${dir.name}/info.json`,
			);
			if (!infoFile) continue;
			try {
				const raw = JSON.parse(infoFile.content) as Record<string, unknown>;
				const files = await listRepoDirectory(
					session,
					`public/images/albums/${dir.name}`,
				);
				const albumMode = raw.mode === "external" ? "external" : "local";
				const hasCoverWebp = files.some((f) => f.name === "cover.webp");
				const hasCoverJpg = files.some((f) => f.name === "cover.jpg");
				const resolvedCover =
					albumMode === "external"
						? String(raw.cover || "")
						: hasCoverWebp
							? `/images/albums/${dir.name}/cover.webp`
							: hasCoverJpg
								? `/images/albums/${dir.name}/cover.jpg`
								: "";
				loaded.push({
					id: dir.name,
					title: String(raw.title || dir.name),
					description: String(raw.description || ""),
					date: String(raw.date || formatDateYYYYMMDD()),
					location: String(raw.location || ""),
					tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
					layout: raw.layout === "grid" ? "grid" : "masonry",
					columns: raw.columns === 2 || raw.columns === 4 ? raw.columns : 3,
					hidden: raw.hidden === true,
					password: String(raw.password || ""),
					passwordHint: String(raw.passwordHint || ""),
					mode: albumMode,
					cover: resolvedCover,
					photos: Array.isArray(raw.photos) ? (raw.photos as AlbumPhoto[]) : [],
					files,
				});
			} catch {
				// Skip malformed info.json
			}
		}
		loaded.sort((a, b) => b.date.localeCompare(a.date));
		albums = loaded;
		if (initialAlbumId) {
			const matched = loaded.find((a) => a.id === initialAlbumId);
			if (matched) selectAlbum(matched);
		}
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "读取相册列表失败");
	} finally {
		loading = false;
	}
}

async function handleCoverUpload(file: File) {
	const compressed = await compressImageToWebP(file, {
		maxDimension: 1600,
		quality: 0.86,
	});
	coverBytes = compressed.bytes;
	if (coverPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(coverPreviewUrl);
	coverPreviewUrl = URL.createObjectURL(
		new Blob([compressed.bytes.buffer as ArrayBuffer], { type: "image/webp" }),
	);
}

function nextPhotoNumberStart(): number {
	let maxNum = 0;
	for (const f of existingFiles) {
		const m = f.name.match(/^(\d+)/);
		if (m) maxNum = Math.max(maxNum, Number.parseInt(m[1], 10));
	}
	for (const p of pendingLocalPhotos) {
		const m = p.fileName.match(/^(\d+)/);
		if (m) maxNum = Math.max(maxNum, Number.parseInt(m[1], 10));
	}
	return maxNum + 1;
}

async function handlePhotoFiles(files: FileList | File[]) {
	const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
	if (arr.length === 0) return;

	let counter = nextPhotoNumberStart();
	const added: PendingAlbumPhoto[] = [];
	for (const file of arr) {
		const compressed = await compressImageToWebP(file, {
			maxDimension: 1920,
			quality: 0.86,
		});
		const fileName = `${String(counter).padStart(2, "0")}.webp`;
		counter += 1;
		added.push({
			id: `${Date.now()}-${Math.random()}`,
			fileName,
			previewUrl: URL.createObjectURL(
				new Blob([compressed.bytes.buffer as ArrayBuffer], {
					type: "image/webp",
				}),
			),
			bytes: compressed.bytes,
			sizeKb: Math.max(1, Math.round(compressed.size / 1024)),
		});
		if (isNew && !coverBytes && added.length === 1) {
			coverBytes = compressed.bytes;
			coverPreviewUrl = added[0].previewUrl;
		}
	}
	pendingLocalPhotos = [...pendingLocalPhotos, ...added];
}

function addExternalPhoto() {
	const src = newExtSrc.trim();
	if (!src) return;
	externalPhotos = [
		...externalPhotos,
		{
			id: `ext-${Date.now().toString(36)}`,
			src,
			alt: newExtTitle.trim() || "Photo",
			tags: [],
			...(newExtTitle.trim() ? { title: newExtTitle.trim() } : {}),
		},
	];
	newExtSrc = "";
	newExtTitle = "";
}

function buildAlbumChanges(): {
	label: string;
	id: string;
	changes: RepoFileChange[];
} {
	const resolvedId = (
		isNew ? toSlug(albumId || title || "album", "album") : albumId
	).trim();
	const tags = tagsText
		.split(/[,，]/)
		.map((s) => s.trim())
		.filter(Boolean);
	const infoJson = serializeAlbumInfoJson({
		id: resolvedId,
		mode,
		title: title || resolvedId,
		description,
		date,
		location,
		tags,
		layout,
		columns,
		hidden,
		password,
		passwordHint,
		cover: mode === "external" ? coverUrl : undefined,
		photos: mode === "external" ? externalPhotos : undefined,
	});

	const baseDir = `public/images/albums/${resolvedId}`;
	const changes: RepoFileChange[] = [
		{ path: `${baseDir}/info.json`, action: "upsert", content: infoJson },
	];

	if (mode === "local") {
		if (coverBytes) {
			changes.push({
				path: `${baseDir}/cover.webp`,
				action: "upsert",
				content: coverBytes,
			});
		}
		for (const p of pendingLocalPhotos) {
			changes.push({
				path: `${baseDir}/${p.fileName}`,
				action: "upsert",
				content: p.bytes,
			});
		}
		for (const delName of deletedLocalFiles) {
			changes.push({
				path: `${baseDir}/${delName}`,
				action: "delete",
			});
		}
	}

	return {
		label: `${isNew ? "新建相册" : "更新相册"} ${title || resolvedId}`,
		id: resolvedId,
		changes,
	};
}

async function handleSaveAlbum(stageOnly = false) {
	if (!title.trim() && !albumId.trim()) {
		showSnackbar("请填写相册名称");
		return;
	}
	if (
		mode === "local" &&
		isNew &&
		!coverBytes &&
		pendingLocalPhotos.length === 0
	) {
		showSnackbar("本地相册至少需要上传一张封面或照片");
		return;
	}

	const { label, changes } = buildAlbumChanges();
	if (stageOnly) {
		enqueueStagedBatch(label, changes);
		showSnackbar("相册改动已加入发布队列");
		return;
	}

	saving = true;
	try {
		await commitRepoChanges(session, `content(albums): ${label}`, changes);
		showSnackbar("相册已提交到 GitHub，构建完成后生效", {
			icon: "material-symbols:check-circle-outline-rounded",
		});
		await loadAlbums();
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "保存相册失败", {
			icon: "material-symbols:error-outline-rounded",
		});
	} finally {
		saving = false;
	}
}

async function handleDeleteAlbum(item: RepoAlbumSummary) {
	if (
		!window.confirm(
			`确定删除相册「${item.title}」及其全部 ${item.files.length} 个文件吗？此操作不可撤回。`,
		)
	) {
		return;
	}
	saving = true;
	try {
		const changes: RepoFileChange[] = item.files
			.filter((f) => f.type === "file")
			.map((f) => ({
				path: `public/images/albums/${item.id}/${f.name}`,
				action: "delete",
			}));
		await commitRepoChanges(
			session,
			`content(albums): delete ${item.id}`,
			changes,
		);
		showSnackbar("相册已删除");
		resetToNew();
		await loadAlbums();
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "删除相册失败");
	} finally {
		saving = false;
	}
}

onMount(() => {
	void loadAlbums();
});
</script>

<div class="albums-admin">
	<Card color="var(--card-bg)" radius="l" class="p-5 md:p-6">
		<div class="albums-admin__head">
			<div>
				<h2 class="albums-admin__title">已有相册 ({albums.length})</h2>
				<p class="albums-admin__sub">点击任意相册即可追加上传照片或修改设置</p>
			</div>
			<div class="albums-admin__head-btns">
				<Button
					variant="outlined"
					size="xsmall"
					icon="material-symbols:refresh-rounded"
					label={loading ? "读取中..." : "刷新"}
					disabled={loading}
					onclick={loadAlbums}
				/>
				<Button
					variant="tonal"
					size="xsmall"
					icon="material-symbols:add-rounded"
					label="新建相册"
					onclick={resetToNew}
				/>
			</div>
		</div>

		<div class="albums-admin__chips">
			{#each albums as item (item.id)}
				<div
					class="albums-admin__album-pill"
					class:albums-admin__album-pill--active={!isNew && albumId === item.id}
				>
					<button
						type="button"
						class="albums-admin__album-select"
						onclick={() => selectAlbum(item)}
					>
						<Icon icon="material-symbols:photo-library-outline-rounded" aria-hidden="true" />
						<span>{item.title}</span>
						{#if item.hidden}<small>隐藏</small>{/if}
						{#if item.password}<small>加密</small>{/if}
					</button>
					<button
						type="button"
						class="albums-admin__album-del"
						aria-label={`删除相册 ${item.title}`}
						onclick={() => handleDeleteAlbum(item)}
					>
						<Icon icon="material-symbols:delete-outline-rounded" aria-hidden="true" />
					</button>
				</div>
			{/each}
		</div>
	</Card>

	<Card color="var(--card-bg)" radius="l" class="p-5 md:p-6">
		<div class="albums-admin__head">
			<h2 class="albums-admin__title">
				{isNew ? "新建相册" : `编辑相册：${title} (${albumId})`}
			</h2>
			<div class="albums-admin__mode-btns">
				<button
					type="button"
					class="albums-admin__mode"
					class:albums-admin__mode--active={mode === "local"}
					onclick={() => (mode = "local")}
				>
					本地上传模式
				</button>
				<button
					type="button"
					class="albums-admin__mode"
					class:albums-admin__mode--active={mode === "external"}
					onclick={() => (mode = "external")}
				>
					外链图床模式
				</button>
			</div>
		</div>

		<div class="albums-admin__grid">
			<TextField label="相册标题" variant="outlined" bind:value={title} />
			{#if isNew}
				<TextField
					label="目录 ID (英文/数字，可留空自动生成)"
					placeholder="例如：tokyo-2026"
					variant="outlined"
					bind:value={albumId}
				/>
			{/if}
			<TextField label="日期 (YYYY-MM-DD)" variant="outlined" bind:value={date} />
			<TextField label="拍摄地点" variant="outlined" bind:value={location} />
			<TextField label="标签 (逗号分隔)" variant="outlined" bind:value={tagsText} />
			<TextField label="简短描述" variant="outlined" bind:value={description} />
		</div>

		<div class="albums-admin__options">
			<label class="albums-admin__select">
				<span>布局：</span>
				<select bind:value={layout}>
					<option value="masonry">瀑布流 (masonry)</option>
					<option value="grid">等高网格 (grid)</option>
				</select>
			</label>
			<label class="albums-admin__select">
				<span>列数：</span>
				<select bind:value={columns}>
					<option value={2}>2 列</option>
					<option value={3}>3 列</option>
					<option value={4}>4 列</option>
				</select>
			</label>
			<label class="albums-admin__switch">
				<Switch bind:checked={hidden} label="隐藏相册" icons />
				<span>隐藏（仅直链访问）</span>
			</label>
		</div>

		<div class="albums-admin__grid">
			<TextField label="相册访问密码 (留空不加密)" variant="outlined" bind:value={password} />
			<TextField label="密码提示 (可选)" variant="outlined" bind:value={passwordHint} />
		</div>

		{#if mode === "local"}
			<div class="albums-admin__upload-zone">
				<label class="albums-admin__upload-btn m3-state-layer">
					<Icon icon="material-symbols:photo-library-outline-rounded" aria-hidden="true" />
					<span>更换封面 (cover.webp)</span>
					<input
						type="file"
						accept="image/*"
						hidden
						onchange={(e) => {
							const file = (e.currentTarget as HTMLInputElement).files?.[0];
							if (file) void handleCoverUpload(file);
						}}
					/>
				</label>
				<label class="albums-admin__upload-btn m3-state-layer">
					<Icon icon="material-symbols:cloud-upload-outline-rounded" aria-hidden="true" />
					<span>批量上传照片（自动压缩 WebP + 自动编号）</span>
					<input
						type="file"
						accept="image/*"
						multiple
						hidden
						onchange={(e) => {
							const files = (e.currentTarget as HTMLInputElement).files;
							if (files) void handlePhotoFiles(files);
							(e.currentTarget as HTMLInputElement).value = "";
						}}
					/>
				</label>
			</div>

			{#if coverPreviewUrl}
				<p class="albums-admin__sub">
					当前封面：{coverBytes ? "待上传新封面 (cover.webp)" : coverPreviewUrl}
				</p>
			{/if}

			{#if pendingLocalPhotos.length > 0}
				<p class="albums-admin__section-label">待上传新照片 ({pendingLocalPhotos.length})</p>
				<div class="albums-admin__photo-grid">
					{#each pendingLocalPhotos as p (p.id)}
						<div class="albums-admin__photo-card">
							<img src={p.previewUrl} alt={p.fileName} />
							<div class="albums-admin__photo-meta">
								<span>{p.fileName} ({p.sizeKb} KB)</span>
								<button
									type="button"
									onclick={() =>
										(pendingLocalPhotos = pendingLocalPhotos.filter((x) => x.id !== p.id))}
								>
									移除
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			{#if existingFiles.length > 0}
				<p class="albums-admin__section-label">相册已有文件 ({existingFiles.length})</p>
				<div class="albums-admin__existing-list">
					{#each existingFiles as f (f.name)}
						{@const markedDelete = deletedLocalFiles.has(f.name)}
						<div class="albums-admin__existing-item" class:albums-admin__existing-item--del={markedDelete}>
							<span>{f.name} ({Math.round(f.size / 1024)} KB)</span>
							<button
								type="button"
								onclick={() => {
									const next = new Set(deletedLocalFiles);
									if (next.has(f.name)) next.delete(f.name);
									else next.add(f.name);
									deletedLocalFiles = next;
								}}
							>
								{markedDelete ? "撤销删除" : "标记删除"}
							</button>
						</div>
					{/each}
				</div>
			{/if}
		{:else}
			<div class="albums-admin__grid">
				<TextField label="封面图 URL" variant="outlined" bind:value={coverUrl} />
			</div>
			<div class="albums-admin__ext-add">
				<TextField label="新增外链照片 URL" placeholder="https://..." variant="outlined" bind:value={newExtSrc} />
				<TextField label="标题 (可选)" variant="outlined" bind:value={newExtTitle} />
				<Button variant="tonal" size="small" label="添加外链照片" onclick={addExternalPhoto} />
			</div>
			{#if externalPhotos.length > 0}
				<div class="albums-admin__existing-list">
					{#each externalPhotos as photo, idx (photo.id || idx)}
						<div class="albums-admin__existing-item">
							<span>{photo.title || photo.alt} — {photo.src}</span>
							<button
								type="button"
								onclick={() => (externalPhotos = externalPhotos.filter((_, i) => i !== idx))}
							>
								删除
							</button>
						</div>
					{/each}
				</div>
			{/if}
		{/if}

		<div class="albums-admin__actions">
			<Button
				variant="outlined"
				size="medium"
				label="加入批量队列"
				disabled={saving}
				onclick={() => handleSaveAlbum(true)}
			/>
			<Button
				variant="filled"
				size="medium"
				icon="material-symbols:rocket-launch-outline-rounded"
				label={saving ? "正在上传..." : "提交相册修改到 GitHub"}
				disabled={saving}
				onclick={() => handleSaveAlbum(false)}
			/>
		</div>
	</Card>
</div>

<style lang="stylus">
.albums-admin
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

	&__head-btns,
	&__mode-btns
		display: flex
		flex-wrap: wrap
		gap: 0.5rem

	&__title
		margin: 0
		font: var(--m3e-type-title-medium)
		color: var(--on-surface)

	&__sub
		margin: 0.25rem 0 0
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

	&__chips
		display: flex
		flex-wrap: wrap
		gap: 0.5rem

	&__album-pill
		display: inline-flex
		align-items: center
		border-radius: var(--shape-corner-full)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		overflow: hidden

		&--active
			background: var(--primary-container)
			border-color: var(--primary)

	&__album-select
		display: inline-flex
		align-items: center
		gap: 0.375rem
		border: 0
		background: transparent
		color: var(--on-surface)
		padding: 0.375rem 0.625rem
		font: var(--m3e-type-label-medium)
		cursor: pointer

		small
			opacity: 0.75

	&__album-del
		display: inline-flex
		align-items: center
		border: 0
		background: transparent
		color: var(--error)
		padding: 0.375rem 0.5rem 0.375rem 0
		cursor: pointer

	&__mode
		padding: 0.375rem 0.875rem
		border-radius: var(--shape-corner-full)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		color: var(--on-surface)
		font: var(--m3e-type-label-medium)
		cursor: pointer

		&--active
			background: var(--primary-container)
			color: var(--on-primary-container)
			border-color: var(--primary)

	&__grid
		display: grid
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr))
		gap: 0.75rem
		margin-top: 0.75rem

	&__options
		display: flex
		flex-wrap: wrap
		align-items: center
		gap: 1.25rem
		margin: 1rem 0

	&__select
		display: inline-flex
		align-items: center
		gap: 0.5rem
		font: var(--m3e-type-body-medium)
		color: var(--on-surface)

		select
			padding: 0.375rem 0.625rem
			border-radius: var(--shape-corner-s)
			border: 1px solid var(--outline-variant)
			background: var(--surface-container-low)
			color: var(--on-surface)

	&__switch
		display: inline-flex
		align-items: center
		gap: 0.5rem
		font: var(--m3e-type-body-medium)
		color: var(--on-surface)
		cursor: pointer

	&__upload-zone
		display: flex
		flex-wrap: wrap
		gap: 0.75rem
		margin-top: 1rem

	&__upload-btn
		display: inline-flex
		align-items: center
		gap: 0.5rem
		padding: 0.625rem 1rem
		border-radius: var(--shape-corner-m)
		border: 1px dashed var(--outline)
		background: var(--surface-container-low)
		color: var(--primary)
		font: var(--m3e-type-label-large)
		cursor: pointer

	&__section-label
		margin: 1rem 0 0.5rem
		font: var(--m3e-type-label-large)
		color: var(--on-surface)

	&__photo-grid
		display: grid
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr))
		gap: 0.75rem

	&__photo-card
		display: flex
		flex-direction: column
		gap: 0.375rem
		padding: 0.5rem
		border-radius: var(--shape-corner-m)
		background: var(--surface-container-low)

		img
			width: 100%
			aspect-ratio: 1 / 1
			object-fit: cover
			border-radius: var(--shape-corner-s)

	&__photo-meta
		display: flex
		justify-content: space-between
		font: var(--m3e-type-label-small)
		color: var(--on-surface-variant)

		button
			border: 0
			background: transparent
			color: var(--error)
			cursor: pointer

	&__existing-list
		display: flex
		flex-direction: column
		gap: 0.5rem
		margin-top: 0.5rem

	&__existing-item
		display: flex
		align-items: center
		justify-content: space-between
		gap: 0.75rem
		padding: 0.5rem 0.75rem
		border-radius: var(--shape-corner-s)
		background: var(--surface-container-low)
		font: var(--m3e-type-body-small)
		color: var(--on-surface)

		&--del
			opacity: 0.55
			text-decoration: line-through

		button
			border: 0
			background: transparent
			color: var(--primary)
			cursor: pointer
			flex-shrink: 0

	&__ext-add
		display: flex
		flex-wrap: wrap
		gap: 0.75rem
		align-items: center
		margin-top: 0.75rem

		:global(.m3-text-field)
			flex: 1 1 12rem

	&__actions
		display: flex
		flex-wrap: wrap
		justify-content: flex-end
		gap: 0.75rem
		margin-top: 1.25rem
</style>
