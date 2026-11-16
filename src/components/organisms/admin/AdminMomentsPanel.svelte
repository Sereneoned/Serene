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
	formatIsoDateTimeLocal,
	listRepoDirectory,
	MOOD_ICON_PRESETS,
	type ParsedMomentDocument,
	parseMomentMarkdown,
	type RepoFileChange,
	readRepoTextFile,
	sanitizeUploadFilename,
	serializeMomentMarkdown,
	toSlug,
} from "@utils/admin";
import { showSnackbar } from "@utils/snackbar";
import { onMount } from "svelte";

let {
	session,
	initialEditId = "",
}: {
	session: AdminSession;
	initialEditId?: string;
} = $props();

interface PendingPhoto {
	readonly id: string;
	readonly src: string;
	alt: string;
	readonly previewUrl: string;
	readonly bytes?: Uint8Array;
	readonly sizeKb?: number;
}

let body = $state("");
let location = $state("");
let tagsText = $state("");
let mood = $state("material-symbols:sentiment-excited-outline-rounded");
let pinned = $state(false);
let draft = $state(false);
let encrypted = $state(false);
let password = $state("");
let passwordHint = $state("");
let published = $state(formatIsoDateTimeLocal());
let editingPath = $state<string | null>(null);
let customImageUrl = $state("");
let photos = $state<PendingPhoto[]>([]);

let publishing = $state(false);
let loadingList = $state(false);
let momentsList = $state<ParsedMomentDocument[]>([]);
let listError = $state("");
let folderSlug = $state("");

function resetComposer() {
	for (const p of photos) {
		if (p.previewUrl.startsWith("blob:")) URL.revokeObjectURL(p.previewUrl);
	}
	body = "";
	location = "";
	tagsText = "";
	mood = "material-symbols:sentiment-excited-outline-rounded";
	pinned = false;
	draft = false;
	encrypted = false;
	password = "";
	passwordHint = "";
	published = formatIsoDateTimeLocal();
	editingPath = null;
	folderSlug = "";
	photos = [];
}

async function loadMomentsFromRepo() {
	loadingList = true;
	listError = "";
	try {
		const entries = await listRepoDirectory(session, "src/content/moments");
		const mdEntries = entries
			.filter((e) => e.type === "file" && /\.(md|mdx)$/i.test(e.name))
			.sort((a, b) => b.name.localeCompare(a.name));
		const loaded: ParsedMomentDocument[] = [];
		for (const entry of mdEntries.slice(0, 40)) {
			const relPath = `src/content/moments/${entry.name}`;
			const file = await readRepoTextFile(session, relPath);
			if (file) {
				loaded.push(parseMomentMarkdown(relPath, file.content));
			}
		}
		loaded.sort((a, b) => {
			if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
			return b.published.localeCompare(a.published);
		});
		momentsList = loaded;
		if (initialEditId) {
			const target = loaded.find((m) => m.id === initialEditId);
			if (target) startEditing(target);
		}
	} catch (error) {
		listError = error instanceof Error ? error.message : "读取动态列表失败";
	} finally {
		loadingList = false;
	}
}

async function handleImageFiles(files: FileList | File[]) {
	const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
	if (arr.length === 0) return;

	if (!folderSlug) {
		const datePart =
			published.slice(0, 10) || new Date().toISOString().slice(0, 10);
		folderSlug = `${datePart}-${Date.now().toString(36).slice(-4)}`;
	}

	const next: PendingPhoto[] = [];
	for (const file of arr) {
		try {
			const compressed = await compressImageToWebP(file, {
				maxDimension: 1600,
				quality: 0.85,
			});
			const baseName = sanitizeUploadFilename(
				file.name.replace(/\.[^.]+$/, ""),
				".webp",
			).replace(/\.[^.]+$/, "");
			const fileName = `${baseName}-${Math.random().toString(36).slice(2, 5)}.webp`;
			const src = `/images/moments/${folderSlug}/${fileName}`;
			const previewBlob = new Blob([compressed.bytes.buffer as ArrayBuffer], {
				type: "image/webp",
			});
			next.push({
				id: `${Date.now()}-${Math.random()}`,
				src,
				alt: file.name.replace(/\.[^.]+$/, ""),
				previewUrl: URL.createObjectURL(previewBlob),
				bytes: compressed.bytes,
				sizeKb: Math.max(1, Math.round(compressed.size / 1024)),
			});
		} catch (error) {
			showSnackbar(
				`图片 ${file.name} 压缩失败: ${error instanceof Error ? error.message : "未知错误"}`,
			);
		}
	}
	photos = [...photos, ...next];
}

function addExternalPhoto() {
	const url = customImageUrl.trim();
	if (!url) return;
	photos = [
		...photos,
		{
			id: `${Date.now()}-${Math.random()}`,
			src: url,
			alt: "",
			previewUrl: url,
		},
	];
	customImageUrl = "";
}

function removePhoto(id: string) {
	const target = photos.find((p) => p.id === id);
	if (target?.previewUrl.startsWith("blob:")) {
		URL.revokeObjectURL(target.previewUrl);
	}
	photos = photos.filter((p) => p.id !== id);
}

function buildChanges(): {
	label: string;
	filePath: string;
	changes: RepoFileChange[];
} {
	const datePrefix = (published || formatIsoDateTimeLocal()).slice(0, 10);
	const summarySlug = toSlug(body.slice(0, 28) || "moment", "moment");
	const targetPath =
		editingPath ||
		`src/content/moments/${datePrefix}-${summarySlug}-${Date.now().toString(36).slice(-3)}.md`;

	const tags = tagsText
		.split(/[,，]/)
		.map((s) => s.trim())
		.filter(Boolean);

	const md = serializeMomentMarkdown({
		published,
		pinned,
		draft,
		location,
		mood,
		tags,
		images: photos.map((p) => ({ src: p.src, alt: p.alt })),
		encrypted,
		password,
		passwordHint,
		body,
	});

	const changes: RepoFileChange[] = [];
	for (const p of photos) {
		if (p.bytes) {
			const cleanRel = p.src.replace(/^\/+/, "");
			changes.push({
				path: `public/${cleanRel}`,
				action: "upsert",
				content: p.bytes,
			});
		}
	}
	changes.push({
		path: targetPath,
		action: "upsert",
		content: md,
	});

	return {
		label: editingPath
			? `更新动态 ${targetPath.split("/").pop()}`
			: `发布动态 (${tags[0] || datePrefix})`,
		filePath: targetPath,
		changes,
	};
}

async function handlePublish(stageOnly = false) {
	if (!body.trim() && photos.length === 0) {
		showSnackbar("请输入动态文字或上传至少一张图片");
		return;
	}
	if (encrypted && !password.trim()) {
		showSnackbar("开启加密动态时请填写访问密码");
		return;
	}

	const { label, changes } = buildChanges();
	if (stageOnly) {
		enqueueStagedBatch(label, changes);
		showSnackbar("已加入批量发布队列", {
			icon: "material-symbols:check-circle-outline-rounded",
		});
		resetComposer();
		return;
	}

	publishing = true;
	try {
		await commitRepoChanges(session, `content(moments): ${label}`, changes);
		showSnackbar("动态已提交到 GitHub，Pages 将自动重建上线", {
			icon: "material-symbols:check-circle-outline-rounded",
		});
		resetComposer();
		await loadMomentsFromRepo();
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "发布失败", {
			icon: "material-symbols:error-outline-rounded",
		});
	} finally {
		publishing = false;
	}
}

function startEditing(doc: ParsedMomentDocument) {
	resetComposer();
	editingPath = doc.filePath;
	published = doc.published;
	body = doc.body;
	location = doc.location || "";
	tagsText = (doc.tags ?? []).join(", ");
	mood = doc.mood || "material-symbols:sentiment-excited-outline-rounded";
	pinned = Boolean(doc.pinned);
	draft = Boolean(doc.draft);
	encrypted = Boolean(doc.encrypted);
	password = doc.password || "";
	passwordHint = doc.passwordHint || "";
	photos = (doc.images ?? []).map((img, index) => ({
		id: `existing-${index}-${img.src}`,
		src: img.src,
		alt: img.alt || "",
		previewUrl: img.src,
	}));
}

async function handleDeleteMoment(doc: ParsedMomentDocument) {
	if (!window.confirm(`确定删除动态 ${doc.id} 吗？`)) return;
	publishing = true;
	try {
		await commitRepoChanges(session, `content(moments): delete ${doc.id}`, [
			{ path: doc.filePath, action: "delete" },
		]);
		showSnackbar("动态已从仓库删除", {
			icon: "material-symbols:check-circle-outline-rounded",
		});
		if (editingPath === doc.filePath) resetComposer();
		await loadMomentsFromRepo();
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "删除失败", {
			icon: "material-symbols:error-outline-rounded",
		});
	} finally {
		publishing = false;
	}
}

onMount(() => {
	void loadMomentsFromRepo();
});
</script>

<div class="moments-admin">
	<Card color="var(--card-bg)" radius="l" class="p-5 md:p-6">
		<div class="moments-admin__head">
			<div>
				<h2 class="moments-admin__title">
					{editingPath ? `编辑动态：${editingPath.split("/").pop()}` : "发布新动态（类似 QQ 说说）"}
				</h2>
				<p class="moments-admin__sub">
					支持 Markdown、多图自动压缩转 WebP、心情图标、位置、标签、置顶与加密说说。
				</p>
			</div>
			{#if editingPath}
				<Button variant="text" size="xsmall" label="取消编辑" onclick={resetComposer} />
			{/if}
		</div>

		<textarea
			class="moments-admin__textarea"
			rows="4"
			placeholder="写下此刻的想法、碎碎念或实验记录（支持 Markdown 语法）..."
			bind:value={body}
		></textarea>

		<div class="moments-admin__upload-bar">
			<label class="moments-admin__upload-btn m3-state-layer">
				<Icon icon="material-symbols:cloud-upload-outline-rounded" aria-hidden="true" />
				<span>上传配图（多选，自动转 WebP）</span>
				<input
					type="file"
					accept="image/*"
					multiple
					hidden
					onchange={(e) => {
						const files = (e.currentTarget as HTMLInputElement).files;
						if (files) void handleImageFiles(files);
						(e.currentTarget as HTMLInputElement).value = "";
					}}
				/>
			</label>
			<div class="moments-admin__ext-img">
				<TextField
					label="或添加外链图片 URL"
					placeholder="https://..."
					variant="outlined"
					bind:value={customImageUrl}
				/>
				<Button variant="tonal" size="small" label="添加图片" onclick={addExternalPhoto} />
			</div>
		</div>

		{#if photos.length > 0}
			<div class="moments-admin__photo-grid">
				{#each photos as p (p.id)}
					<div class="moments-admin__photo-item">
						<img src={p.previewUrl} alt={p.alt || "preview"} />
						<input
							type="text"
							class="moments-admin__photo-alt"
							placeholder="图片描述 alt"
							bind:value={p.alt}
						/>
						<div class="moments-admin__photo-foot">
							<span>{p.sizeKb ? `${p.sizeKb} KB` : "已引用"}</span>
							<button
								type="button"
								class="moments-admin__photo-del"
								onclick={() => removePhoto(p.id)}
							>
								移除
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<div class="moments-admin__moods">
			<span class="moments-admin__label">心情图标：</span>
			<div class="moments-admin__mood-list">
				{#each MOOD_ICON_PRESETS as preset (preset.icon)}
					<button
						type="button"
						class="moments-admin__mood-chip"
						class:moments-admin__mood-chip--active={mood === preset.icon}
						onclick={() => (mood = preset.icon)}
						title={preset.label}
					>
						<Icon icon={preset.icon} aria-hidden="true" />
						<span>{preset.label}</span>
					</button>
				{/each}
			</div>
		</div>

		<div class="moments-admin__fields">
			<TextField label="位置 (可选)" placeholder="例如：杭州 / 桌面前" variant="outlined" bind:value={location}>
				<Icon slot="leading" icon="material-symbols:location-on-outline-rounded" aria-hidden="true" />
			</TextField>
			<TextField label="标签 (逗号分隔)" placeholder="例如：日常, 摄影" variant="outlined" bind:value={tagsText} />
			<TextField label="发布时间 (ISO)" variant="outlined" bind:value={published} />
		</div>

		<div class="moments-admin__switches">
			<label class="moments-admin__switch-item">
				<Switch bind:checked={pinned} label="置顶" icons />
				<span>置顶动态</span>
			</label>
			<label class="moments-admin__switch-item">
				<Switch bind:checked={draft} label="草稿" icons />
				<span>存为草稿（线上隐藏）</span>
			</label>
			<label class="moments-admin__switch-item">
				<Switch bind:checked={encrypted} label="加密" icons />
				<span>加密说说（访客需密码解锁）</span>
			</label>
		</div>

		{#if encrypted}
			<div class="moments-admin__fields">
				<TextField label="解锁密码" variant="outlined" bind:value={password}>
					<Icon slot="leading" icon="material-symbols:lock-outline-rounded" aria-hidden="true" />
				</TextField>
				<TextField label="密码提示 (可选)" variant="outlined" bind:value={passwordHint} />
			</div>
		{/if}

		<div class="moments-admin__actions">
			<Button
				variant="outlined"
				size="medium"
				label="加入批量发布队列"
				disabled={publishing}
				onclick={() => handlePublish(true)}
			/>
			<Button
				variant="filled"
				size="medium"
				icon="material-symbols:rocket-launch-outline-rounded"
				label={publishing ? "正在提交..." : editingPath ? "保存并提交修改" : "立即发布动态"}
				disabled={publishing}
				onclick={() => handlePublish(false)}
			/>
		</div>
	</Card>

	<Card color="var(--card-bg)" radius="l" class="p-5 md:p-6">
		<div class="moments-admin__head">
			<div>
				<h2 class="moments-admin__title">仓库已有动态 ({momentsList.length})</h2>
				<p class="moments-admin__sub">直接读取自 {session.owner}/{session.repo} 的 src/content/moments/</p>
			</div>
			<Button
				variant="outlined"
				size="xsmall"
				icon="material-symbols:refresh-rounded"
				label={loadingList ? "读取中..." : "刷新列表"}
				disabled={loadingList}
				onclick={loadMomentsFromRepo}
			/>
		</div>

		{#if listError}
			<p class="moments-admin__error">{listError}</p>
		{:else if momentsList.length === 0 && !loadingList}
			<p class="moments-admin__sub">暂无动态记录。</p>
		{:else}
			<div class="moments-admin__list">
				{#each momentsList as item (item.filePath)}
					<div class="moments-admin__row">
						<div class="moments-admin__row-main">
							<div class="moments-admin__row-meta">
								<span>{item.published.slice(0, 16).replace("T", " ")}</span>
								{#if item.pinned}<span class="moments-admin__tag">置顶</span>{/if}
								{#if item.draft}<span class="moments-admin__tag">草稿</span>{/if}
								{#if item.encrypted}<span class="moments-admin__tag">加密</span>{/if}
								{#if item.images?.length}<span class="moments-admin__tag">{item.images.length} 图</span>{/if}
							</div>
							<p class="moments-admin__row-body">{item.body || "(仅图片动态)"}</p>
						</div>
						<div class="moments-admin__row-actions">
							<Button
								variant="tonal"
								size="xsmall"
								icon="material-symbols:edit-outline-rounded"
								label="编辑"
								onclick={() => startEditing(item)}
							/>
							<Button
								variant="text"
								size="xsmall"
								icon="material-symbols:delete-outline-rounded"
								label="删除"
								onclick={() => handleDeleteMoment(item)}
							/>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</Card>
</div>

<style lang="stylus">
.moments-admin
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

	&__sub
		margin: 0.25rem 0 0
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

	&__textarea
		width: 100%
		min-height: 7rem
		padding: 0.875rem 1rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		color: var(--on-surface)
		font: var(--m3e-type-body-large)
		resize: vertical
		box-sizing: border-box

		&:focus
			outline: 2px solid var(--primary)
			border-color: transparent

	&__upload-bar
		display: flex
		flex-wrap: wrap
		align-items: center
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

	&__ext-img
		display: flex
		flex: 1 1 18rem
		gap: 0.5rem
		align-items: center

		:global(.m3-text-field)
			flex: 1

	&__photo-grid
		display: grid
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr))
		gap: 0.75rem
		margin-top: 1rem

	&__photo-item
		display: flex
		flex-direction: column
		gap: 0.375rem
		padding: 0.5rem
		border-radius: var(--shape-corner-m)
		background: var(--surface-container-low)

		img
			width: 100%
			aspect-ratio: 4 / 3
			object-fit: cover
			border-radius: var(--shape-corner-s)

	&__photo-alt
		width: 100%
		padding: 0.25rem 0.5rem
		border-radius: var(--shape-corner-xs)
		border: 1px solid var(--outline-variant)
		background: var(--surface)
		color: var(--on-surface)
		font: var(--m3e-type-body-small)

	&__photo-foot
		display: flex
		align-items: center
		justify-content: space-between
		font: var(--m3e-type-label-small)
		color: var(--on-surface-variant)

	&__photo-del
		border: 0
		background: transparent
		color: var(--error)
		cursor: pointer
		font: inherit

	&__moods
		display: flex
		flex-direction: column
		gap: 0.5rem
		margin-top: 1rem

	&__label
		font: var(--m3e-type-label-medium)
		color: var(--on-surface-variant)

	&__mood-list
		display: flex
		flex-wrap: wrap
		gap: 0.5rem

	&__mood-chip
		display: inline-flex
		align-items: center
		gap: 0.375rem
		padding: 0.375rem 0.75rem
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

	&__fields
		display: grid
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr))
		gap: 0.75rem
		margin-top: 1rem

	&__switches
		display: flex
		flex-wrap: wrap
		gap: 1.25rem
		margin-top: 1rem

	&__switch-item
		display: inline-flex
		align-items: center
		gap: 0.5rem
		font: var(--m3e-type-body-medium)
		color: var(--on-surface)
		cursor: pointer

	&__actions
		display: flex
		flex-wrap: wrap
		justify-content: flex-end
		gap: 0.75rem
		margin-top: 1.25rem

	&__list
		display: flex
		flex-direction: column
		gap: 0.75rem

	&__row
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: 0.75rem
		padding: 0.875rem 1rem
		border-radius: var(--shape-corner-m)
		background: var(--surface-container-low)

	&__row-main
		flex: 1 1 20rem
		min-width: 0

	&__row-meta
		display: flex
		flex-wrap: wrap
		align-items: center
		gap: 0.5rem
		font: var(--m3e-type-label-small)
		color: var(--on-surface-variant)

	&__tag
		padding: 0.1rem 0.45rem
		border-radius: var(--shape-corner-xs)
		background: var(--secondary-container)
		color: var(--on-secondary-container)

	&__row-body
		margin: 0.375rem 0 0
		font: var(--m3e-type-body-medium)
		color: var(--on-surface)
		display: -webkit-box
		-webkit-line-clamp: 2
		-webkit-box-orient: vertical
		overflow: hidden

	&__row-actions
		display: flex
		gap: 0.375rem

	&__error
		color: var(--error)
		font: var(--m3e-type-body-medium)
</style>
