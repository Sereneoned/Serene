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
	type RepoFileChange,
	readRepoTextFile,
	SOCIAL_ICON_PRESETS,
} from "@utils/admin";
import { showSnackbar } from "@utils/snackbar";
import { onMount } from "svelte";

let {
	session,
	initialConfigSnapshot,
}: {
	session: AdminSession;
	initialConfigSnapshot: {
		siteUrl: string;
		basePath: string;
		title: string;
		subtitle: string;
		hue: number;
		style: string;
		homeSubtitles: string[];
		profileName: string;
		profileBio: string;
		profileAvatar: string;
		profileLinks: Array<{ name: string; icon: string; url: string }>;
		announcementTitle: string;
		announcementContent: string;
		announcementClosable: boolean;
		announcementLinkEnable: boolean;
		announcementLinkText: string;
		announcementLinkUrl: string;
		features: Record<string, boolean>;
		comment?: {
			enable: boolean;
			provider: string;
			lazy: boolean;
			walineServerURL: string;
			walineReaction: boolean;
			walineLogin: "enable" | "disable" | "force";
			walinePlaceholder: string;
		};
		umami?: {
			enable: boolean;
			shareUrl: string;
			websiteId: string;
			scriptUrl: string;
		};
	};
} = $props();

// Site
let siteUrl = $state("");
let basePath = $state("/");
let title = $state("");
let subtitle = $state("");
let hue = $state(315);
let style = $state("tonalSpot");
let homeSubtitlesText = $state("");
let pendingDesktopBanner = $state<{ path: string; bytes: Uint8Array } | null>(
	null,
);

// Profile
let profileName = $state("");
let profileBio = $state("");
let profileAvatar = $state("");
let profileLinks = $state<Array<{ name: string; icon: string; url: string }>>(
	[],
);
let pendingAvatarBytes = $state<Uint8Array | null>(null);

// Announcement
let announcementTitle = $state("");
let announcementContent = $state("");
let announcementClosable = $state(true);
let announcementLinkEnable = $state(false);
let announcementLinkText = $state("");
let announcementLinkUrl = $state("");

const featureLabels: Array<[string, string]> = [
	["moments", "动态 / 说说 (Moments)"],
	["albums", "相册 (Albums)"],
	["friends", "友情链接 (Friends)"],
	["anime", "番剧收藏 (Anime)"],
	["compass", "站点罗盘 (Compass)"],
	["timeline", "时间线 (Timeline)"],
	["projects", "项目展示 (Projects)"],
	["devices", "我的设备 (Devices)"],
	["games", "游戏记录 (Games)"],
	["skills", "技能树 (Skills)"],
	["series", "系列连载 (Series)"],
	["about", "关于页 (About)"],
];

// Feature toggles (pre-seeded synchronously so Switch bindings never receive undefined)
let features = $state<Record<string, boolean>>(
	Object.fromEntries(featureLabels.map(([key]) => [key, true])),
);

// Comment (Waline) & Umami analytics
let commentEnable = $state(false);
let commentLazy = $state(true);
let walineServerUrl = $state("");
let commentReaction = $state(true);
let commentLogin = $state<"enable" | "disable" | "force">("enable");
let commentPlaceholder = $state("Share your thoughts...");

let umamiEnable = $state(false);
let umamiShareUrl = $state("");
let umamiWebsiteId = $state("");
let umamiScriptUrl = $state("");

let rawOverrides = $state<Record<string, unknown>>({});

let loading = $state(false);
let saving = $state(false);

function applyDefaultsFromSnapshot() {
	siteUrl = initialConfigSnapshot.siteUrl;
	basePath = initialConfigSnapshot.basePath || "/";
	title = initialConfigSnapshot.title;
	subtitle = initialConfigSnapshot.subtitle;
	hue = initialConfigSnapshot.hue;
	style = initialConfigSnapshot.style;
	homeSubtitlesText = initialConfigSnapshot.homeSubtitles.join("\n");
	profileName = initialConfigSnapshot.profileName;
	profileBio = initialConfigSnapshot.profileBio;
	profileAvatar = initialConfigSnapshot.profileAvatar;
	profileLinks = initialConfigSnapshot.profileLinks.map((l) => ({ ...l }));
	announcementTitle = initialConfigSnapshot.announcementTitle;
	announcementContent = initialConfigSnapshot.announcementContent;
	announcementClosable = initialConfigSnapshot.announcementClosable;
	announcementLinkEnable = initialConfigSnapshot.announcementLinkEnable;
	announcementLinkText = initialConfigSnapshot.announcementLinkText;
	announcementLinkUrl = initialConfigSnapshot.announcementLinkUrl;
	features = {
		...Object.fromEntries(featureLabels.map(([key]) => [key, true])),
		...initialConfigSnapshot.features,
	};
	commentEnable = initialConfigSnapshot.comment?.enable ?? false;
	commentLazy = initialConfigSnapshot.comment?.lazy ?? true;
	walineServerUrl = initialConfigSnapshot.comment?.walineServerURL ?? "";
	commentReaction = initialConfigSnapshot.comment?.walineReaction ?? true;
	commentLogin = initialConfigSnapshot.comment?.walineLogin ?? "enable";
	commentPlaceholder =
		initialConfigSnapshot.comment?.walinePlaceholder ??
		"Share your thoughts...";
	umamiEnable = initialConfigSnapshot.umami?.enable ?? false;
	umamiShareUrl = initialConfigSnapshot.umami?.shareUrl ?? "";
	umamiWebsiteId = initialConfigSnapshot.umami?.websiteId ?? "";
	umamiScriptUrl = initialConfigSnapshot.umami?.scriptUrl ?? "";
}

async function loadFromRepo() {
	loading = true;
	applyDefaultsFromSnapshot();
	try {
		const file = await readRepoTextFile(
			session,
			"src/data/json/admin-overrides.json",
		);
		if (!file) return;
		const parsed = JSON.parse(file.content) as Record<string, unknown>;
		rawOverrides = parsed;

		const s = parsed.site as Record<string, unknown> | undefined;
		if (s) {
			if (typeof s.site === "string") siteUrl = s.site;
			if (typeof s.base === "string") basePath = s.base;
			if (typeof s.title === "string") title = s.title;
			if (typeof s.subtitle === "string") subtitle = s.subtitle;
			const tc = s.themeColor as Record<string, unknown> | undefined;
			if (tc) {
				if (typeof tc.hue === "number") hue = tc.hue;
				if (typeof tc.style === "string") style = tc.style;
			}
			const banner = s.banner as Record<string, unknown> | undefined;
			const ht = banner?.homeText as Record<string, unknown> | undefined;
			if (ht && Array.isArray(ht.subtitle)) {
				homeSubtitlesText = ht.subtitle.map(String).join("\n");
			}
		}

		const p = parsed.profile as Record<string, unknown> | undefined;
		if (p) {
			if (typeof p.name === "string") profileName = p.name;
			if (typeof p.bio === "string") profileBio = p.bio;
			if (typeof p.avatar === "string") profileAvatar = p.avatar;
			if (Array.isArray(p.links)) {
				profileLinks = p.links.map((item) => {
					const rec = item as Record<string, unknown>;
					return {
						name: String(rec.name || ""),
						icon: String(rec.icon || "material-symbols:language"),
						url: String(rec.url || ""),
					};
				});
			}
		}

		const a = parsed.announcement as Record<string, unknown> | undefined;
		if (a) {
			if (typeof a.title === "string") announcementTitle = a.title;
			if (typeof a.content === "string") announcementContent = a.content;
			if (typeof a.closable === "boolean") announcementClosable = a.closable;
			const lk = a.link as Record<string, unknown> | undefined;
			if (lk) {
				if (typeof lk.enable === "boolean") announcementLinkEnable = lk.enable;
				if (typeof lk.text === "string") announcementLinkText = lk.text;
				if (typeof lk.url === "string") announcementLinkUrl = lk.url;
			}
		}

		for (const [key] of featureLabels) {
			const domainObj = parsed[key] as Record<string, unknown> | undefined;
			if (domainObj && typeof domainObj.enable === "boolean") {
				features[key] = domainObj.enable;
			}
		}

		const c = parsed.comment as Record<string, unknown> | undefined;
		if (c) {
			if (typeof c.enable === "boolean") commentEnable = c.enable;
			if (typeof c.lazy === "boolean") commentLazy = c.lazy;
			const w = c.waline as Record<string, unknown> | undefined;
			if (w) {
				if (typeof w.serverURL === "string") walineServerUrl = w.serverURL;
				if (typeof w.reaction === "boolean") commentReaction = w.reaction;
				if (
					w.login === "enable" ||
					w.login === "disable" ||
					w.login === "force"
				) {
					commentLogin = w.login;
				}
				const loc = w.locale as Record<string, unknown> | undefined;
				if (loc && typeof loc.placeholder === "string") {
					commentPlaceholder = loc.placeholder;
				}
			}
		}

		const u = parsed.umami as Record<string, unknown> | undefined;
		if (u) {
			if (typeof u.enable === "boolean") umamiEnable = u.enable;
			if (typeof u.shareUrl === "string") umamiShareUrl = u.shareUrl;
			if (typeof u.websiteId === "string") umamiWebsiteId = u.websiteId;
			if (typeof u.scriptUrl === "string") umamiScriptUrl = u.scriptUrl;
		}
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "读取站点设置失败");
	} finally {
		loading = false;
	}
}

async function handleAvatarUpload(file: File) {
	const compressed = await compressImageToWebP(file, {
		maxDimension: 512,
		quality: 0.88,
	});
	pendingAvatarBytes = compressed.bytes;
	profileAvatar = "/images/admin/avatar.webp";
	showSnackbar("头像已压缩为 WebP，保存后生效");
}

async function handleBannerUpload(file: File) {
	const compressed = await compressImageToWebP(file, {
		maxDimension: 1920,
		quality: 0.85,
	});
	const fileName = `banner-${Date.now().toString(36)}.webp`;
	pendingDesktopBanner = {
		path: `public/images/admin/${fileName}`,
		bytes: compressed.bytes,
	};
	showSnackbar("新 Banner 壁纸已准备就绪，保存后替换首页横幅");
}

function addSocialLink() {
	profileLinks = [
		...profileLinks,
		{ name: "GitHub", icon: "fa7-brands:github", url: "https://github.com" },
	];
}

async function handleSaveAll(stageOnly = false) {
	const cleanWalineUrl = walineServerUrl.trim();
	const cleanUmamiShareUrl = umamiShareUrl.trim();
	if (commentEnable && !cleanWalineUrl) {
		showSnackbar("请先填写 Waline 服务端 URL 再开启评论与点赞");
		return;
	}
	if (umamiEnable && !cleanUmamiShareUrl) {
		showSnackbar("请先填写 Umami 公开分享链接 (Share URL) 再开启浏览量统计");
		return;
	}

	saving = true;
	try {
		const subtitles = homeSubtitlesText
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean);

		const prevComment =
			(rawOverrides.comment as Record<string, unknown> | undefined) ?? {};
		const prevWaline =
			(prevComment.waline as Record<string, unknown> | undefined) ?? {};
		const prevWalineLocale =
			(prevWaline.locale as Record<string, unknown> | undefined) ?? {};
		const prevUmami =
			(rawOverrides.umami as Record<string, unknown> | undefined) ?? {};

		const nextSite: Record<string, unknown> = {
			...(rawOverrides.site as Record<string, unknown> | undefined),
			site: siteUrl.trim() || initialConfigSnapshot.siteUrl,
			base: basePath.trim() || "/",
			title: title.trim() || "Shirone",
			subtitle: subtitle.trim(),
			themeColor: {
				hue: Number(hue),
				style,
			},
			banner: {
				...((rawOverrides.site as Record<string, unknown> | undefined)
					?.banner as Record<string, unknown> | undefined),
				...(pendingDesktopBanner
					? {
							src: {
								desktop: [
									`/${pendingDesktopBanner.path.replace(/^public\//, "")}`,
								],
								mobile: [
									`/${pendingDesktopBanner.path.replace(/^public\//, "")}`,
								],
							},
						}
					: {}),
				homeText: {
					title: title.trim() || "Shirone",
					subtitle: subtitles.length > 0 ? subtitles : [subtitle.trim()],
				},
			},
		};

		const nextOverrides: Record<string, unknown> = {
			...rawOverrides,
			site: nextSite,
			profile: {
				avatar: profileAvatar.trim(),
				name: profileName.trim(),
				bio: profileBio.trim(),
				links: profileLinks
					.filter((l) => l.name.trim() && l.url.trim())
					.map((l) => ({
						name: l.name.trim(),
						icon: l.icon.trim() || "material-symbols:language",
						url: l.url.trim(),
					})),
			},
			announcement: {
				title: announcementTitle.trim(),
				content: announcementContent.trim(),
				closable: announcementClosable,
				link: {
					enable: announcementLinkEnable,
					text: announcementLinkText.trim(),
					url: announcementLinkUrl.trim(),
					external: true,
				},
			},
			comment: {
				...prevComment,
				enable: commentEnable,
				provider: commentEnable || cleanWalineUrl ? "waline" : "none",
				lazy: commentLazy,
				waline: {
					...prevWaline,
					serverURL: cleanWalineUrl,
					reaction: commentReaction,
					login: commentLogin,
					locale: {
						...prevWalineLocale,
						placeholder: commentPlaceholder.trim() || "Share your thoughts...",
					},
				},
			},
			umami: {
				...prevUmami,
				enable: umamiEnable,
				shareUrl: cleanUmamiShareUrl,
				websiteId: umamiWebsiteId.trim(),
				scriptUrl: umamiScriptUrl.trim(),
			},
		};

		for (const [key] of featureLabels) {
			nextOverrides[key] = {
				...((rawOverrides[key] as Record<string, unknown> | undefined) ?? {}),
				enable: features[key] !== false,
			};
		}

		const changes: RepoFileChange[] = [];
		if (pendingAvatarBytes) {
			changes.push({
				path: "public/images/admin/avatar.webp",
				action: "upsert",
				content: pendingAvatarBytes,
			});
		}
		if (pendingDesktopBanner) {
			changes.push({
				path: pendingDesktopBanner.path,
				action: "upsert",
				content: pendingDesktopBanner.bytes,
			});
		}
		changes.push({
			path: "src/data/json/admin-overrides.json",
			action: "upsert",
			content: `${JSON.stringify(nextOverrides, null, 2)}\n`,
		});

		if (stageOnly) {
			enqueueStagedBatch("更新站点设置、资料与公告", changes);
			showSnackbar("设置已加入批量发布队列");
			return;
		}

		await commitRepoChanges(
			session,
			"chore(config): update site, profile and announcement",
			changes,
		);
		pendingAvatarBytes = null;
		pendingDesktopBanner = null;
		showSnackbar("站点与资料配置已提交，GitHub Pages 构建完成后生效", {
			icon: "material-symbols:check-circle-outline-rounded",
		});
	} catch (error) {
		showSnackbar(error instanceof Error ? error.message : "保存失败");
	} finally {
		saving = false;
	}
}

onMount(() => {
	void loadFromRepo();
});
</script>

<div class="site-admin">
	<Card color="var(--card-bg)" radius="l" class="p-5 md:p-6">
		<div class="site-admin__head">
			<h2 class="site-admin__title">博主资料 (Profile)</h2>
			<Button
				variant="outlined"
				size="xsmall"
				icon="material-symbols:refresh-rounded"
				label={loading ? "同步中..." : "同步仓库配置"}
				onclick={loadFromRepo}
			/>
		</div>
		<div class="site-admin__grid">
			<TextField label="博主昵称" variant="outlined" bind:value={profileName} />
			<TextField label="个性签名 (Bio)" variant="outlined" bind:value={profileBio} />
			<TextField label="头像路径 / URL" variant="outlined" bind:value={profileAvatar} />
		</div>
		<div class="site-admin__upload-row">
			<label class="site-admin__upload-btn m3-state-layer">
				<Icon icon="material-symbols:cloud-upload-outline-rounded" aria-hidden="true" />
				<span>上传新头像 (自动压成 WebP)</span>
				<input
					type="file"
					accept="image/*"
					hidden
					onchange={(e) => {
						const f = (e.currentTarget as HTMLInputElement).files?.[0];
						if (f) void handleAvatarUpload(f);
					}}
				/>
			</label>
		</div>

		<div class="site-admin__links-head">
			<h3>社交链接</h3>
			<Button variant="tonal" size="xsmall" icon="material-symbols:add-rounded" label="添加社交链接" onclick={addSocialLink} />
		</div>
		<div class="site-admin__links-list">
			{#each profileLinks as link, idx (idx)}
				<div class="site-admin__link-row">
					<TextField label="名称" variant="outlined" bind:value={link.name} />
					<TextField label="网址 URL" variant="outlined" bind:value={link.url} />
					<select class="site-admin__select" bind:value={link.icon} aria-label="选择图标">
						{#each SOCIAL_ICON_PRESETS as preset (preset.icon)}
							<option value={preset.icon}>{preset.label} ({preset.icon})</option>
						{/each}
					</select>
					<Button
						variant="text"
						size="xsmall"
						icon="material-symbols:delete-outline-rounded"
						ariaLabel="删除链接"
						onclick={() => (profileLinks = profileLinks.filter((_, i) => i !== idx))}
					/>
				</div>
			{/each}
		</div>
	</Card>

	<Card color="var(--card-bg)" radius="l" class="p-5 md:p-6">
		<h2 class="site-admin__title">侧栏公告栏 (Announcement)</h2>
		<div class="site-admin__grid">
			<TextField label="公告标题 (留空用默认)" variant="outlined" bind:value={announcementTitle} />
			<TextField label="公告正文" variant="outlined" bind:value={announcementContent} />
		</div>
		<div class="site-admin__switches">
			<label class="site-admin__switch"><Switch bind:checked={announcementClosable} label="允许关闭" icons /><span>允许访客关闭公告</span></label>
			<label class="site-admin__switch"><Switch bind:checked={announcementLinkEnable} label="启用链接" icons /><span>显示跳转链接</span></label>
		</div>
		{#if announcementLinkEnable}
			<div class="site-admin__grid">
				<TextField label="链接文案" variant="outlined" bind:value={announcementLinkText} />
				<TextField label="链接 URL" variant="outlined" bind:value={announcementLinkUrl} />
			</div>
		{/if}
	</Card>

	<Card color="var(--card-bg)" radius="l" class="p-5 md:p-6">
		<h2 class="site-admin__title">站点标识、主题与 GitHub Pages 部署设置</h2>
		<div class="site-admin__grid">
			<TextField label="站点标题" variant="outlined" bind:value={title} />
			<TextField label="站点副标题" variant="outlined" bind:value={subtitle} />
			<TextField label="线上域名 (site)" placeholder="https://username.github.io" variant="outlined" bind:value={siteUrl} />
			<TextField label="部署路径 (base，根域名填 /，子路径填 /Shirone/)" variant="outlined" bind:value={basePath} />
		</div>

		<div class="site-admin__hue-row">
			<label class="site-admin__hue-label">
				<span>默认主题色相 Hue：{hue}°</span>
				<span class="site-admin__swatch" style={`background: oklch(0.68 0.16 ${hue});`}></span>
				<input type="range" min="0" max="360" bind:value={hue} />
			</label>
			<label class="site-admin__style-select">
				<span>调色风格：</span>
				<select bind:value={style}>
					<option value="tonalSpot">TonalSpot (默认)</option>
					<option value="vibrant">Vibrant (鲜艳)</option>
					<option value="expressive">Expressive (表现力)</option>
					<option value="rainbow">Rainbow</option>
					<option value="fruitSalad">FruitSalad</option>
					<option value="content">Content</option>
					<option value="monochrome">Monochrome</option>
				</select>
			</label>
			<label class="site-admin__upload-btn m3-state-layer">
				<Icon icon="material-symbols:photo-library-outline-rounded" aria-hidden="true" />
				<span>{pendingDesktopBanner ? "已选择新壁纸 ✓" : "更换首页横幅壁纸 (Banner)"}</span>
				<input
					type="file"
					accept="image/*"
					hidden
					onchange={(e) => {
						const f = (e.currentTarget as HTMLInputElement).files?.[0];
						if (f) void handleBannerUpload(f);
					}}
				/>
			</label>
		</div>

		<label class="site-admin__textarea-label">
			<span>首页打字机轮播句子（每行一句）：</span>
			<textarea class="site-admin__textarea" rows="4" bind:value={homeSubtitlesText}></textarea>
		</label>
	</Card>

	<Card color="var(--card-bg)" radius="l" class="p-5 md:p-6">
		<div id="analytics-comment"></div>
		<h2 class="site-admin__title">评论互动与浏览量统计 (Waline + Umami)</h2>
		<p class="site-admin__sub">
			开启后，文章详情页与每一条动态都将具备独立「赞 / 评论 / 浏览量」互动条，并同步显示 Umami 统计。配置会写入 <code>admin-overrides.json</code>。
		</p>

		<div class="site-admin__subpanel">
			<h3 class="site-admin__subtitle">1. Waline 评论与点赞（支持访客匿名/免 GitHub 登录）</h3>
			<div class="site-admin__switches">
				<label class="site-admin__switch"><Switch bind:checked={commentEnable} label="启用 Waline" icons /><span>启用评论与点赞 (Waline)</span></label>
				<label class="site-admin__switch"><Switch bind:checked={commentReaction} label="启用点赞反应" icons /><span>启用点赞 / 表情反应</span></label>
				<label class="site-admin__switch"><Switch bind:checked={commentLazy} label="视口懒加载" icons /><span>进入视口再加载评论区</span></label>
			</div>
			<div class="site-admin__grid">
				<TextField label="Waline 服务端地址 (serverURL)" placeholder="https://your-waline.vercel.app" variant="outlined" bind:value={walineServerUrl} />
				<TextField label="评论框占位文字 (placeholder)" placeholder="Share your thoughts..." variant="outlined" bind:value={commentPlaceholder} />
				<label class="site-admin__style-select">
					<span>登录要求：</span>
					<select bind:value={commentLogin}>
						<option value="enable">可选登录 (支持游客匿名)</option>
						<option value="disable">纯匿名评论 (关闭登录)</option>
						<option value="force">必须登录才能评论</option>
					</select>
				</label>
			</div>
			<p class="site-admin__hint">
				部署指引：<a href="https://waline.js.org/guide/get-started/" target="_blank" rel="noopener noreferrer">Waline + Vercel 免费部署文档 ↗</a>（部署完成后将域名填入上方 <code>serverURL</code> 即可，无需改动代码）。
			</p>
		</div>

		<div class="site-admin__subpanel">
			<h3 class="site-admin__subtitle">2. Umami 浏览量统计（全站 + 文章页 + 动态页）</h3>
			<div class="site-admin__switches">
				<label class="site-admin__switch"><Switch bind:checked={umamiEnable} label="启用 Umami" icons /><span>启用 Umami 浏览量统计</span></label>
			</div>
			<div class="site-admin__grid">
				<TextField label="Umami 公开分享链接 (shareUrl)" placeholder="https://cloud.umami.is/share/..." variant="outlined" bind:value={umamiShareUrl} />
				<TextField label="Umami Website ID" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" variant="outlined" bind:value={umamiWebsiteId} />
				<TextField label="Umami 采集脚本地址 (scriptUrl)" placeholder="https://cloud.umami.is/script.js" variant="outlined" bind:value={umamiScriptUrl} />
			</div>
			<p class="site-admin__hint">
				推荐使用免费 <a href="https://cloud.umami.is/" target="_blank" rel="noopener noreferrer">Umami Cloud ↗</a>：新建站点并开启 Share URL，将 Share URL、Website ID 与 scriptUrl 填入即可实时展示 Page Views 与 Visits。
			</p>
		</div>
	</Card>

	<Card color="var(--card-bg)" radius="l" class="p-5 md:p-6">
		<h2 class="site-admin__title">功能页面总开关</h2>
		<p class="site-admin__sub">关闭某个功能页后，对应路由会返回 404 且顶部导航入口自动隐藏。</p>
		<div class="site-admin__toggles-grid">
			{#each featureLabels as [key, label] (key)}
				<label class="site-admin__switch">
					<Switch bind:checked={features[key]} label={label} icons />
					<span>{label}</span>
				</label>
			{/each}
		</div>

		<div class="site-admin__actions">
			<Button variant="outlined" size="medium" label="加入批量队列" disabled={saving} onclick={() => handleSaveAll(true)} />
			<Button
				variant="filled"
				size="medium"
				icon="material-symbols:rocket-launch-outline-rounded"
				label={saving ? "正在保存..." : "保存全站配置到 GitHub"}
				disabled={saving}
				onclick={() => handleSaveAll(false)}
			/>
		</div>
	</Card>
</div>

<style lang="stylus">
.site-admin
	display: flex
	flex-direction: column
	gap: 1.25rem

	&__head
		display: flex
		align-items: center
		justify-content: space-between
		gap: 0.75rem
		margin-bottom: 0.75rem

	&__title
		margin: 0
		font: var(--m3e-type-title-medium)
		color: var(--on-surface)

	&__sub
		margin: 0.25rem 0 0.75rem
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

	&__subpanel
		padding: 0.875rem 1rem
		margin-top: 0.875rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)

	&__subtitle
		margin: 0
		font: var(--m3e-type-title-small)
		color: var(--on-surface)

	&__hint
		margin: 0.625rem 0 0
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

		a
			color: var(--primary)
			text-decoration: underline

	&__grid
		display: grid
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr))
		gap: 0.75rem
		margin-top: 0.75rem

	&__upload-row
		margin-top: 0.875rem

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

	&__links-head
		display: flex
		align-items: center
		justify-content: space-between
		margin: 1.25rem 0 0.5rem

		h3
			margin: 0
			font: var(--m3e-type-title-small)
			color: var(--on-surface)

	&__links-list
		display: flex
		flex-direction: column
		gap: 0.625rem

	&__link-row
		display: grid
		grid-template-columns: minmax(7rem, 1fr) minmax(11rem, 1.5fr) minmax(10rem, 1.2fr) auto
		gap: 0.5rem
		align-items: center

		@media (max-width: 767px)
			grid-template-columns: 1fr

	&__select,
	&__style-select select
		padding: 0.5rem 0.625rem
		border-radius: var(--shape-corner-s)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		color: var(--on-surface)
		font: var(--m3e-type-body-small)

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

	&__hue-row
		display: flex
		flex-wrap: wrap
		align-items: center
		gap: 1rem 1.5rem
		margin-top: 1rem

	&__hue-label,
	&__style-select
		display: inline-flex
		align-items: center
		gap: 0.625rem
		font: var(--m3e-type-body-medium)
		color: var(--on-surface)

	&__swatch
		width: 1.5rem
		height: 1.5rem
		border-radius: var(--shape-corner-full)
		border: 1px solid var(--outline-variant)

	&__textarea-label
		display: flex
		flex-direction: column
		gap: 0.5rem
		margin-top: 1rem
		font: var(--m3e-type-label-large)
		color: var(--on-surface)

	&__textarea
		width: 100%
		padding: 0.75rem 1rem
		border-radius: var(--shape-corner-m)
		border: 1px solid var(--outline-variant)
		background: var(--surface-container-low)
		color: var(--on-surface)
		font: var(--m3e-type-body-medium)
		box-sizing: border-box

	&__toggles-grid
		display: grid
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr))
		gap: 0.75rem

	&__actions
		display: flex
		flex-wrap: wrap
		justify-content: flex-end
		gap: 0.75rem
		margin-top: 1.25rem
</style>
