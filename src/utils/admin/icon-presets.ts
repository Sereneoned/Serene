/**
 * Curated static Iconify icon presets used by Admin pickers.
 * Keeping every preset name as a static literal guarantees
 * `src/integration/vite/icon/collections.ts` bundles them offline at build time.
 */

export interface IconPresetItem {
	readonly icon: string;
	readonly label: string;
}

export const MOOD_ICON_PRESETS: readonly IconPresetItem[] = [
	{ icon: "material-symbols:sentiment-excited-outline-rounded", label: "开心" },
	{
		icon: "material-symbols:sentiment-satisfied-outline-rounded",
		label: "惬意",
	},
	{ icon: "material-symbols:favorite-outline-rounded", label: "心动" },
	{ icon: "material-symbols:auto-awesome-outline-rounded", label: "灵感" },
	{ icon: "material-symbols:local-cafe-outline-rounded", label: "摸鱼" },
	{ icon: "material-symbols:headphones-rounded", label: "听歌" },
	{ icon: "material-symbols:code-rounded", label: "写代码" },
	{ icon: "material-symbols:dark-mode-outline-rounded", label: "深夜" },
	{ icon: "material-symbols:photo-camera-outline-rounded", label: "摄影" },
	{ icon: "material-symbols:travel-explore-rounded", label: "出行" },
	{ icon: "material-symbols:sports-esports-outline-rounded", label: "游戏" },
	{ icon: "material-symbols:rainy-outline", label: "雨天" },
];

export const SOCIAL_ICON_PRESETS: readonly IconPresetItem[] = [
	{ icon: "fa7-brands:github", label: "GitHub" },
	{ icon: "fa7-brands:x-twitter", label: "X / Twitter" },
	{ icon: "fa7-brands:bilibili", label: "Bilibili" },
	{ icon: "simple-icons:xiaohongshu", label: "小红书" },
	{ icon: "fa7-brands:tiktok", label: "抖音 / TikTok" },
	{ icon: "fa7-brands:zhihu", label: "知乎" },
	{ icon: "fa7-brands:qq", label: "QQ" },
	{ icon: "fa7-brands:steam", label: "Steam" },
	{ icon: "fa7-brands:telegram", label: "Telegram" },
	{ icon: "fa7-brands:discord", label: "Discord" },
	{ icon: "fa7-brands:youtube", label: "YouTube" },
	{ icon: "material-symbols:mail-outline-rounded", label: "Email" },
	{ icon: "material-symbols:rss-feed-rounded", label: "RSS" },
	{ icon: "material-symbols:language", label: "Website" },
];

export const ADMIN_UI_ICONS: readonly string[] = [
	"material-symbols:admin-panel-settings-outline-rounded",
	"material-symbols:login-rounded",
	"material-symbols:logout-rounded",
	"material-symbols:key-outline-rounded",
	"material-symbols:edit-outline-rounded",
	"material-symbols:delete-outline-rounded",
	"material-symbols:add-rounded",
	"material-symbols:cloud-upload-outline-rounded",
	"material-symbols:folder-open-outline-rounded",
	"material-symbols:library-music-outline-rounded",
	"material-symbols:photo-library-outline-rounded",
	"material-symbols:article-outline-rounded",
	"material-symbols:group-outline-rounded",
	"material-symbols:settings-outline-rounded",
	"material-symbols:rocket-launch-outline-rounded",
	"material-symbols:check-circle-outline-rounded",
	"material-symbols:error-outline-rounded",
	"material-symbols:refresh-rounded",
	"material-symbols:arrow-upward-rounded",
	"material-symbols:arrow-downward-rounded",
	"material-symbols:visibility-outline-rounded",
	"material-symbols:visibility-off-outline-rounded",
	"material-symbols:lock-outline-rounded",
	"material-symbols:keep-outline-rounded",
	"material-symbols:location-on-outline-rounded",
	"material-symbols:campaign-outline-rounded",
];
