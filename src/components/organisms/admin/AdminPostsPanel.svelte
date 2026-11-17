<script lang="ts">
import Button from "@components/atoms/action/Button.svelte";
import Card from "@components/atoms/display/Card.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import Switch from "@components/atoms/selection/Switch.svelte";
import RichBodyEditor, {
	type UploadedInlineImage,
} from "@components/molecules/RichBodyEditor.svelte";
import Icon from "@iconify/svelte";
import {
	type AdminSession,
	commitRepoChanges,
	compressImageToWebP,
	enqueueStagedBatch,
	formatDateYYYYMMDD,
	listRepoDirectory,
	type ParsedPostDocument,
	parsePostMarkdown,
	type RepoFileChange,
	readRepoTextFile,
	serializePostMarkdown,
	toSlug,
} from "@utils/admin";
import { showSnackbar } from "@utils/snackbar";
import { onMount } from "svelte";

let { session }: { session: AdminSession } = $props();

type SubMode = "posts" | "about";
let subMode = $state<SubMode>("posts");

let posts = $state<ParsedPostDocument[]>([]);
let loading = $state(false);
let saving = $state(false);

let editingPath = $state<string | null>(null);
let slug = $state("");
let title = $state("");
let published = $state(formatDateYYYYMMDD());
let description = $state("");
let category = $state("");
let tagsText = $state("");
let series = $state("");
let image = $state("");
let pinned = $state(false);
let draft = $state(false);
let comment = $state(true);
let encrypted = $state(false);
let password = $state("");
let passwordHint = $state("");
let body = $state("");
let pendingCoverBytes = $state<Uint8Array | null>(null);
let pendingImageUploads = $state<
	Array<{
		publicUrl: string;
		path: string;
		previewUrl: string;
		bytes: Uint8Array;
	}>
>([]);

let aboutMarkdown = $state("");

const postPreviewUrlMap = $derived(
	Object.fromEntries(
		pendingImageUploads.map((item) => [item.publicUrl, item.previewUrl]),
	),
);

function resetPostForm() {
	for (const img of pendingImageUploads) {
		if (img.previewUrl.startsWith("blob:")) {
			URL.revokeObjectURL(img.previewUrl);
		}
	}
	editingPath = null;
	slug = "";
	title = "";
	published = formatDateYYYYMMDD();
	description = "";
	category = "";
	tagsText = "";
	series = "";
	image = "";
	pinned = false;
	draft = false;
	comment = true;
	encrypted = false;
	password = "";
	passwordHint = "";
	body = "";
	pendingCoverBytes = null;
	pendingImageUploads = [];
}

async function loadPostsAndAbout() {
	loading = true;
	try {
		const [entries, aboutFile] = await Promise.all([
			listRepoDirectory(session, "src/content/posts"),
			readRepoTextFile(session, "src/content/spec/about.md"),
		]);

		if (aboutFile) aboutMarkdown = aboutFile.content;

		const loaded: ParsedPostDocument[] = [];
		for (const entry of entries) {
			if (entry.type === "file" && /\.(md|mdx)$/i.test(entry.name)) {
				const path = `src/content/posts/${entry.name}`;
				const file = await readRepoTextFile(session, path);
				if (file) loaded.push(parsePostMarkdown(path, file.content));
			} else if (entry.type === "dir") {
				const indexMd = `src/content/posts/${entry.name}/index.md`;
				const mdFile = await readRepoTextFile(session, indexMd);
				if (mdFile) {
					loaded.push(parsePostMarkdown(indexMd, mdFile.content));
				} else {
					const indexMdx = `src/content/posts/${entry.name}/index.mdx`;
					const mdxFile = await readRepoTextFile(session, indexMdx);
					if (mdxFile)
						loaded.push(parsePostMarkdown(indexMdx, mdxFile.content));
				}
			}
		}
		loaded.sort((a, b) => b.published.localeCompare(a.published));
		posts = loaded;
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "读取文章列表失败");
	} finally {
		loading = false;
	}
}

function selectPost(doc: ParsedPostDocument) {
	editingPath = doc.filePath;
	slug = doc.slug;
	title = doc.title;
	published = doc.published;
	description = doc.description || "";
	category = doc.category || "";
	tagsText = (doc.tags ?? []).join(", ");
	series = doc.series || "";
	image = doc.image || "";
	pinned = Boolean(doc.pinned);
	draft = Boolean(doc.draft);
	comment = doc.comment !== false;
	encrypted = Boolean(doc.encrypted);
	password = doc.password || "";
	passwordHint = doc.passwordHint || "";
	body = doc.body;
	pendingCoverBytes = null;
	pendingImageUploads = [];
}

async function handleCoverUpload(file: File) {
	const compressed = await compressImageToWebP(file, {
		maxDimension: 1600,
		quality: 0.85,
	});
	const resolvedSlug = toSlug(slug || title || "post", "post");
	if (!slug) slug = resolvedSlug;
	pendingCoverBytes = compressed.bytes;
	image = `/images/posts/${resolvedSlug}-cover.webp`;
	showSnackbar("封面已压缩为 WebP，提交后生效");
}

async function uploadPostInlineImages(
	files: FileList | File[],
): Promise<UploadedInlineImage[]> {
	const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
	if (arr.length === 0) return [];
	const resolvedSlug = toSlug(slug || title || "post", "post");
	if (!slug) slug = resolvedSlug;

	const added: UploadedInlineImage[] = [];
	const uploads: Array<{
		publicUrl: string;
		path: string;
		previewUrl: string;
		bytes: Uint8Array;
	}> = [];
	for (const file of arr) {
		const compressed = await compressImageToWebP(file, {
			maxDimension: 1600,
			quality: 0.85,
		});
		const fileName = `${resolvedSlug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}.webp`;
		const publicUrl = `/images/posts/${fileName}`;
		const previewUrl = URL.createObjectURL(
			new Blob([compressed.bytes.buffer as ArrayBuffer], {
				type: "image/webp",
			}),
		);
		uploads.push({
			publicUrl,
			path: `public/images/posts/${fileName}`,
			previewUrl,
			bytes: compressed.bytes,
		});
		added.push({
			src: publicUrl,
			previewUrl,
			alt: file.name.replace(/\.[^.]+$/, ""),
		});
	}
	pendingImageUploads = [...pendingImageUploads, ...uploads];
	return added;
}

async function handleSavePost(stageOnly = false) {
	if (!title.trim()) {
		showSnackbar("请填写文章标题");
		return;
	}
	const resolvedSlug = toSlug(slug || title, "post");
	const targetPath = editingPath || `src/content/posts/${resolvedSlug}.md`;
	const tags = tagsText
		.split(/[,，]/)
		.map((s) => s.trim())
		.filter(Boolean);

	const markdown = serializePostMarkdown({
		title,
		published,
		updated: editingPath ? formatDateYYYYMMDD() : undefined,
		description,
		image,
		tags,
		category,
		series,
		pinned,
		draft,
		comment,
		encrypted,
		password,
		passwordHint,
		body,
	});

	const changes: RepoFileChange[] = [];
	if (pendingCoverBytes) {
		changes.push({
			path: `public${image.startsWith("/") ? image : `/${image}`}`,
			action: "upsert",
			content: pendingCoverBytes,
		});
	}
	for (const img of pendingImageUploads) {
		if (!body.includes(img.publicUrl)) continue;
		changes.push({ path: img.path, action: "upsert", content: img.bytes });
	}
	changes.push({ path: targetPath, action: "upsert", content: markdown });

	if (stageOnly) {
		enqueueStagedBatch(`文章：${title}`, changes);
		showSnackbar("文章改动已加入发布队列");
		return;
	}

	saving = true;
	try {
		await commitRepoChanges(session, `content(posts): ${title}`, changes);
		showSnackbar("文章已提交到 GitHub");
		resetPostForm();
		await loadPostsAndAbout();
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "保存失败");
	} finally {
		saving = false;
	}
}

async function handleDeletePost(doc: ParsedPostDocument) {
	if (!window.confirm(`确定删除文章「${doc.title}」吗？`)) return;
	saving = true;
	try {
		await commitRepoChanges(session, `content(posts): delete ${doc.slug}`, [
			{ path: doc.filePath, action: "delete" },
		]);
		showSnackbar("文章已删除");
		if (editingPath === doc.filePath) resetPostForm();
		await loadPostsAndAbout();
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "删除失败");
	} finally {
		saving = false;
	}
}

async function handleSaveAbout() {
	saving = true;
	try {
		await commitRepoChanges(session, "content(about): update about page", [
			{
				path: "src/content/spec/about.md",
				action: "upsert",
				content: aboutMarkdown,
			},
		]);
		showSnackbar("关于页已提交更新");
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "保存失败");
	} finally {
		saving = false;
	}
}

onMount(() => {
	void loadPostsAndAbout();
});
</script>

<div class="posts-admin">
	<div class="posts-admin__subtabs">
		<button
			type="button"
			class="posts-admin__subtab"
			class:posts-admin__subtab--active={subMode === "posts"}
			onclick={() => (subMode = "posts")}
		>
			博客文章 ({posts.length})
		</button>
		<button
			type="button"
			class="posts-admin__subtab"
			class:posts-admin__subtab--active={subMode === "about"}
			onclick={() => (subMode = "about")}
		>
			关于页 (about.md)
		</button>
	</div>

	{#if subMode === "posts"}
		<Card color="var(--card-bg)" radius="l" class="p-5 md:p-6">
			<div class="posts-admin__head">
				<h2 class="posts-admin__title">
					{editingPath ? `编辑文章：${title}` : "撰写新文章"}
				</h2>
				<div class="posts-admin__head-btns">
					<Button
						variant="outlined"
						size="xsmall"
						icon="material-symbols:refresh-rounded"
						label={loading ? "读取中..." : "刷新"}
						onclick={loadPostsAndAbout}
					/>
					{#if editingPath}
						<Button variant="text" size="xsmall" label="新建空白文章" onclick={resetPostForm} />
					{/if}
				</div>
			</div>

			<div class="posts-admin__grid">
				<TextField label="文章标题" variant="outlined" bind:value={title} />
				{#if !editingPath}
					<TextField label="文件名 Slug (英文建议)" placeholder="my-first-post" variant="outlined" bind:value={slug} />
				{/if}
				<TextField label="发布日期 (YYYY-MM-DD)" variant="outlined" bind:value={published} />
				<TextField label="分类 (Category)" variant="outlined" bind:value={category} />
				<TextField label="标签 (逗号分隔)" variant="outlined" bind:value={tagsText} />
				<TextField label="所属系列 Slug (可选)" variant="outlined" bind:value={series} />
			</div>

			<div class="posts-admin__grid">
				<TextField label="摘要描述" variant="outlined" bind:value={description} />
				<TextField label="封面图路径 / URL" variant="outlined" bind:value={image} />
			</div>

			<div class="posts-admin__upload-bar">
				<label class="posts-admin__upload-btn m3-state-layer">
					<Icon icon="material-symbols:photo-library-outline-rounded" aria-hidden="true" />
					<span>上传封面图 (转 WebP)</span>
					<input
						type="file"
						accept="image/*"
						hidden
						onchange={(e) => {
							const f = (e.currentTarget as HTMLInputElement).files?.[0];
							if (f) void handleCoverUpload(f);
							(e.currentTarget as HTMLInputElement).value = "";
						}}
					/>
				</label>
			</div>

			<RichBodyEditor
				bind:value={body}
				rows={12}
				placeholder="使用 Markdown 编写文章正文（支持字号、加粗、字体颜色；点击工具栏「插图到光标处」或粘贴截图可在任意位置插图并调大小）..."
				previewUrlMap={postPreviewUrlMap}
				onUploadImages={uploadPostInlineImages}
			/>

			<div class="posts-admin__switches">
				<label class="posts-admin__switch"><Switch bind:checked={pinned} label="置顶" icons /><span>置顶</span></label>
				<label class="posts-admin__switch"><Switch bind:checked={draft} label="草稿" icons /><span>草稿</span></label>
				<label class="posts-admin__switch"><Switch bind:checked={comment} label="评论" icons /><span>开启评论</span></label>
				<label class="posts-admin__switch"><Switch bind:checked={encrypted} label="加密" icons /><span>加密文章</span></label>
			</div>

			{#if encrypted}
				<div class="posts-admin__grid">
					<TextField label="文章密码" variant="outlined" bind:value={password} />
					<TextField label="密码提示" variant="outlined" bind:value={passwordHint} />
				</div>
			{/if}

			<div class="posts-admin__actions">
				<Button variant="outlined" size="medium" label="加入批量队列" disabled={saving} onclick={() => handleSavePost(true)} />
				<Button
					variant="filled"
					size="medium"
					icon="material-symbols:rocket-launch-outline-rounded"
					label={saving ? "正在提交..." : editingPath ? "保存修改并提交" : "发布文章"}
					disabled={saving}
					onclick={() => handleSavePost(false)}
				/>
			</div>
		</Card>

		<Card color="var(--card-bg)" radius="l" class="p-5 md:p-6">
			<h2 class="posts-admin__title">已有文章列表</h2>
			<div class="posts-admin__list">
				{#each posts as post (post.filePath)}
					<div class="posts-admin__row">
						<div class="posts-admin__row-main">
							<strong>{post.title}</strong>
							<span>{post.published.slice(0, 10)} · {post.category || "未分类"} {post.draft ? "· [草稿]" : ""}</span>
						</div>
						<div class="posts-admin__row-btns">
							<Button variant="tonal" size="xsmall" icon="material-symbols:edit-outline-rounded" label="编辑" onclick={() => selectPost(post)} />
							<Button variant="text" size="xsmall" icon="material-symbols:delete-outline-rounded" label="删除" disabled={saving} onclick={() => handleDeletePost(post)} />
						</div>
					</div>
				{/each}
			</div>
		</Card>
	{:else}
		<Card color="var(--card-bg)" radius="l" class="p-5 md:p-6">
			<h2 class="posts-admin__title">编辑关于页 (src/content/spec/about.md)</h2>
			<textarea class="posts-admin__textarea" rows="14" bind:value={aboutMarkdown}></textarea>
			<div class="posts-admin__actions">
				<Button
					variant="filled"
					size="medium"
					icon="material-symbols:rocket-launch-outline-rounded"
					label={saving ? "保存中..." : "保存关于页到 GitHub"}
					disabled={saving}
					onclick={handleSaveAbout}
				/>
			</div>
		</Card>
	{/if}
</div>

<style lang="stylus">
.posts-admin
	display: flex
	flex-direction: column
	gap: 1.25rem

	&__subtabs
		display: flex
		gap: 0.5rem

	&__subtab
		padding: 0.5rem 1rem
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

	&__head-btns,
	&__row-btns
		display: flex
		gap: 0.5rem

	&__title
		margin: 0
		font: var(--m3e-type-title-medium)
		color: var(--on-surface)

	&__grid
		display: grid
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr))
		gap: 0.75rem
		margin-top: 0.75rem

	&__upload-bar
		display: flex
		flex-wrap: wrap
		gap: 0.75rem
		margin: 1rem 0

	&__upload-btn
		display: inline-flex
		align-items: center
		gap: 0.5rem
		padding: 0.5rem 0.875rem
		border-radius: var(--shape-corner-m)
		border: 1px dashed var(--outline)
		background: var(--surface-container-low)
		color: var(--primary)
		font: var(--m3e-type-label-large)
		cursor: pointer

	&__textarea
		width: 100%
		margin-top: 0.75rem
		padding: 0.875rem 1rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		color: var(--on-surface)
		font: var(--m3e-type-body-medium)
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace
		resize: vertical
		box-sizing: border-box

	&__switches
		display: flex
		flex-wrap: wrap
		gap: 1.25rem
		margin-top: 1rem

	&__switch
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
		gap: 0.625rem
		margin-top: 0.75rem

	&__row
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: 0.75rem
		padding: 0.75rem 1rem
		border-radius: var(--shape-corner-m)
		background: var(--surface-container-low)

	&__row-main
		display: flex
		flex-direction: column
		gap: 0.25rem

		strong
			font: var(--m3e-type-body-medium)
			color: var(--on-surface)

		span
			font: var(--m3e-type-body-small)
			color: var(--on-surface-variant)
</style>
