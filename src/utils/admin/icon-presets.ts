/**
 * Curated static Iconify icon presets used by Admin pickers.
 * Keeping every preset name as a static literal guarantees
 * `src/integration/vite/icon/collections.ts` bundles them offline at build time.
 */

export interface IconPresetItem {
	readonly icon: string;
	readonly label: string;
}

export type UiIconGroup =
	| "timeline"
	| "projects"
	| "games"
	| "compass"
	| "brands"
	| "tags";

export interface CategorizedIconPreset extends IconPresetItem {
	readonly group: UiIconGroup;
	readonly keywords: string;
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

export const UI_ICON_GROUP_LABELS: Readonly<Record<UiIconGroup, string>> = {
	timeline: "时间线 / 经历",
	projects: "项目 / 技术",
	games: "游戏 / 娱乐",
	compass: "罗盘 / 工具",
	brands: "站点 / 品牌",
	tags: "标签 / 状态",
};

export const UI_ICON_PRESETS: readonly CategorizedIconPreset[] = [
	// ── 时间线 / 经历 ──
	{
		icon: "material-symbols:timeline-rounded",
		label: "时间线",
		group: "timeline",
		keywords: "timeline history 轨迹",
	},
	{
		icon: "material-symbols:flag-rounded",
		label: "里程碑",
		group: "timeline",
		keywords: "milestone flag 纪念 节点",
	},
	{
		icon: "material-symbols:rocket-launch-rounded",
		label: "发布上线",
		group: "timeline",
		keywords: "launch rocket release 起飞 发布",
	},
	{
		icon: "material-symbols:work-rounded",
		label: "工作职业",
		group: "timeline",
		keywords: "work career job 实习 职场",
	},
	{
		icon: "material-symbols:school-rounded",
		label: "教育学习",
		group: "timeline",
		keywords: "school education university 学校 毕业",
	},
	{
		icon: "material-symbols:favorite-rounded",
		label: "生活日常",
		group: "timeline",
		keywords: "life love heart 热爱",
	},
	{
		icon: "material-symbols:edit-note-rounded",
		label: "写作笔记",
		group: "timeline",
		keywords: "blog write note 记录 文章",
	},
	{
		icon: "material-symbols:calendar-month-rounded",
		label: "日期日程",
		group: "timeline",
		keywords: "calendar date 日历 时间",
	},
	{
		icon: "material-symbols:event-note-rounded",
		label: "重要事件",
		group: "timeline",
		keywords: "event agenda 活动 安排",
	},
	{
		icon: "material-symbols:history-edu-rounded",
		label: "回忆随笔",
		group: "timeline",
		keywords: "history story 随笔 历程",
	},
	{
		icon: "material-symbols:celebration-rounded",
		label: "庆祝时刻",
		group: "timeline",
		keywords: "celebration party 纪念日",
	},
	{
		icon: "material-symbols:trophy-outline-rounded",
		label: "奖项成就",
		group: "timeline",
		keywords: "trophy award 奖杯 荣誉",
	},
	{
		icon: "material-symbols:workspace-premium-rounded",
		label: "证书荣誉",
		group: "timeline",
		keywords: "certificate badge 证书 勋章",
	},
	{
		icon: "material-symbols:award-star-outline-rounded",
		label: "高光亮点",
		group: "timeline",
		keywords: "award star highlight",
	},
	{
		icon: "material-symbols:flight-takeoff-rounded",
		label: "启程旅行",
		group: "timeline",
		keywords: "travel flight journey 出发",
	},
	{
		icon: "material-symbols:location-on-outline-rounded",
		label: "地点坐标",
		group: "timeline",
		keywords: "location place 城市",
	},
	{
		icon: "material-symbols:domain-rounded",
		label: "机构组织",
		group: "timeline",
		keywords: "company organization school 组织",
	},

	// ── 项目 / 技术 ──
	{
		icon: "material-symbols:deployed-code-outline-rounded",
		label: "开源项目",
		group: "projects",
		keywords: "project code deploy 工程",
	},
	{
		icon: "material-symbols:deployed-code-rounded",
		label: "成品应用",
		group: "projects",
		keywords: "project app package",
	},
	{
		icon: "material-symbols:code-rounded",
		label: "程序开发",
		group: "projects",
		keywords: "code dev programming 代码",
	},
	{
		icon: "material-symbols:terminal-rounded",
		label: "命令行 CLI",
		group: "projects",
		keywords: "terminal cli shell 终端",
	},
	{
		icon: "material-symbols:integration-instructions-outline-rounded",
		label: "源码文档",
		group: "projects",
		keywords: "source docs code sdk",
	},
	{
		icon: "material-symbols:palette-outline-rounded",
		label: "主题与 UI",
		group: "projects",
		keywords: "theme design ui color 美化",
	},
	{
		icon: "material-symbols:android-rounded",
		label: "Android",
		group: "projects",
		keywords: "android mobile 安卓",
	},
	{
		icon: "material-symbols:phone-android-rounded",
		label: "移动端 App",
		group: "projects",
		keywords: "mobile phone app 手机",
	},
	{
		icon: "material-symbols:laptop-mac-outline-rounded",
		label: "桌面软件",
		group: "projects",
		keywords: "desktop laptop client 电脑",
	},
	{
		icon: "material-symbols:web-rounded",
		label: "Web 网页",
		group: "projects",
		keywords: "web website frontend 前端",
	},
	{
		icon: "material-symbols:extension-outline-rounded",
		label: "插件扩展",
		group: "projects",
		keywords: "plugin extension addon 扩展",
	},
	{
		icon: "material-symbols:widgets-rounded",
		label: "组件模块",
		group: "projects",
		keywords: "widgets components 沙盒 模块",
	},
	{
		icon: "material-symbols:construction-rounded",
		label: "开发构建",
		group: "projects",
		keywords: "build tools 开发中",
	},
	{
		icon: "material-symbols:bug-report-outline-rounded",
		label: "调试测试",
		group: "projects",
		keywords: "debug test bug",
	},
	{
		icon: "material-symbols:database-outline",
		label: "数据库",
		group: "projects",
		keywords: "database sql storage",
	},
	{
		icon: "material-symbols:dns-outline-rounded",
		label: "后端服务",
		group: "projects",
		keywords: "server backend api 运维",
	},
	{
		icon: "material-symbols:cloud-outline",
		label: "云原生",
		group: "projects",
		keywords: "cloud serverless edge",
	},
	{
		icon: "material-symbols:security-rounded",
		label: "安全架构",
		group: "projects",
		keywords: "security shield auth",
	},
	{
		icon: "material-symbols:bolt-rounded",
		label: "高性能",
		group: "projects",
		keywords: "fast speed performance 闪电",
	},
	{
		icon: "material-symbols:smart-toy-outline-rounded",
		label: "AI / Agent",
		group: "projects",
		keywords: "ai bot agent llm 智能体",
	},
	{
		icon: "material-symbols:neurology-outline-rounded",
		label: "算法模型",
		group: "projects",
		keywords: "ml brain algorithm ai",
	},
	{
		icon: "material-symbols:api-rounded",
		label: "接口 API",
		group: "projects",
		keywords: "api interface webhook",
	},
	{
		icon: "material-symbols:data-object-rounded",
		label: "数据结构",
		group: "projects",
		keywords: "json data schema",
	},
	{
		icon: "material-symbols:layers-outline-rounded",
		label: "系统分层",
		group: "projects",
		keywords: "layers stack architecture",
	},
	{
		icon: "material-symbols:memory-rounded",
		label: "底层内核",
		group: "projects",
		keywords: "kernel hardware chip cpu",
	},

	// ── 游戏 / 娱乐 ──
	{
		icon: "material-symbols:sports-esports-outline-rounded",
		label: "电子游戏",
		group: "games",
		keywords: "game controller esports 手柄",
	},
	{
		icon: "material-symbols:sports-esports-rounded",
		label: "手柄实心",
		group: "games",
		keywords: "game pad controller",
	},
	{
		icon: "material-symbols:videogame-asset-outline-rounded",
		label: "复古掌机",
		group: "games",
		keywords: "retro game console",
	},
	{
		icon: "material-symbols:joystick-outline-rounded",
		label: "街机摇杆",
		group: "games",
		keywords: "arcade joystick",
	},
	{
		icon: "material-symbols:stadia-controller-outline-rounded",
		label: "云游戏",
		group: "games",
		keywords: "controller gamepad",
	},
	{
		icon: "material-symbols:swords-outline-rounded",
		label: "动作战斗",
		group: "games",
		keywords: "action combat rpg 刀剑",
	},
	{
		icon: "material-symbols:shield-outline-rounded",
		label: "角色扮演",
		group: "games",
		keywords: "rpg shield 防御 冒险",
	},
	{
		icon: "material-symbols:explore-outline-rounded",
		label: "开放世界",
		group: "games",
		keywords: "open world adventure 探索",
	},
	{
		icon: "material-symbols:casino-outline-rounded",
		label: "肉鸽卡牌",
		group: "games",
		keywords: "roguelike dice board",
	},
	{
		icon: "material-symbols:sports-mma-outline-rounded",
		label: "格斗竞技",
		group: "games",
		keywords: "fighting arena pvp",
	},
	{
		icon: "material-symbols:music-note-rounded",
		label: "音乐节奏",
		group: "games",
		keywords: "music rhythm 音游",
	},
	{
		icon: "material-symbols:live-tv-outline-rounded",
		label: "番剧动画",
		group: "games",
		keywords: "anime tv stream",
	},
	{
		icon: "material-symbols:movie-outline-rounded",
		label: "剧情演出",
		group: "games",
		keywords: "story cinema movie",
	},
	{
		icon: "fa7-solid:gamepad",
		label: "经典手柄",
		group: "games",
		keywords: "gamepad console",
	},

	// ── 罗盘 / 工具 / 阅读 ──
	{
		icon: "material-symbols:explore-rounded",
		label: "站点罗盘",
		group: "compass",
		keywords: "compass explore 导航",
	},
	{
		icon: "material-symbols:compass-calibration-rounded",
		label: "方位指针",
		group: "compass",
		keywords: "compass navigation",
	},
	{
		icon: "material-symbols:public-rounded",
		label: "网站地球",
		group: "compass",
		keywords: "web site public globe",
	},
	{
		icon: "material-symbols:language",
		label: "网址域名",
		group: "compass",
		keywords: "url website domain",
	},
	{
		icon: "material-symbols:link-rounded",
		label: "快捷链接",
		group: "compass",
		keywords: "link url 链接",
	},
	{
		icon: "material-symbols:open-in-new-rounded",
		label: "外部访问",
		group: "compass",
		keywords: "external open link",
	},
	{
		icon: "material-symbols:build-outline-rounded",
		label: "实用工具",
		group: "compass",
		keywords: "tools wrench utility",
	},
	{
		icon: "material-symbols:auto-stories-outline-rounded",
		label: "阅读刊物",
		group: "compass",
		keywords: "reading book blog 书籍",
	},
	{
		icon: "material-symbols:menu-book-rounded",
		label: "参考文档",
		group: "compass",
		keywords: "docs manual reference 百科",
	},
	{
		icon: "material-symbols:article-outline-rounded",
		label: "技术专栏",
		group: "compass",
		keywords: "article post blog",
	},
	{
		icon: "material-symbols:newspaper-rounded",
		label: "资讯日报",
		group: "compass",
		keywords: "news daily feed",
	},
	{
		icon: "material-symbols:forum-outline-rounded",
		label: "交流社区",
		group: "compass",
		keywords: "community forum bbs",
	},
	{
		icon: "material-symbols:lightbulb-outline-rounded",
		label: "灵感创意",
		group: "compass",
		keywords: "idea inspiration",
	},
	{
		icon: "material-symbols:science-outline-rounded",
		label: "实验研究",
		group: "compass",
		keywords: "lab research science",
	},
	{
		icon: "material-symbols:brush-rounded",
		label: "画笔设计",
		group: "compass",
		keywords: "design art draw",
	},
	{
		icon: "material-symbols:image-outline-rounded",
		label: "图库素材",
		group: "compass",
		keywords: "image gallery media",
	},
	{
		icon: "material-symbols:video-library-outline-rounded",
		label: "视频资源",
		group: "compass",
		keywords: "video media",
	},
	{
		icon: "material-symbols:translate-rounded",
		label: "翻译词典",
		group: "compass",
		keywords: "translate dict language",
	},
	{
		icon: "material-symbols:calculate-outline-rounded",
		label: "计算工具",
		group: "compass",
		keywords: "math calc tool",
	},
	{
		icon: "material-symbols:travel-explore-rounded",
		label: "搜索发现",
		group: "compass",
		keywords: "search discover seo",
	},
	{
		icon: "material-symbols:hub-outline-rounded",
		label: "节点网络",
		group: "compass",
		keywords: "network hub graph",
	},
	{
		icon: "material-symbols:bookmark-star-outline-rounded",
		label: "收藏精选",
		group: "compass",
		keywords: "bookmark favorite",
	},
	{
		icon: "material-symbols:shopping-bag-outline-rounded",
		label: "好物清单",
		group: "compass",
		keywords: "shop store gear",
	},

	// ── 品牌 / 平台 ──
	{
		icon: "fa7-brands:github",
		label: "GitHub",
		group: "brands",
		keywords: "github git repo",
	},
	{
		icon: "fa7-brands:gitlab",
		label: "GitLab",
		group: "brands",
		keywords: "gitlab git",
	},
	{
		icon: "fa7-brands:bilibili",
		label: "Bilibili",
		group: "brands",
		keywords: "bilibili b站 视频",
	},
	{
		icon: "simple-icons:xiaohongshu",
		label: "小红书",
		group: "brands",
		keywords: "xiaohongshu xhs red",
	},
	{
		icon: "fa7-brands:tiktok",
		label: "抖音 / TikTok",
		group: "brands",
		keywords: "douyin tiktok",
	},
	{
		icon: "fa7-brands:zhihu",
		label: "知乎",
		group: "brands",
		keywords: "zhihu 知乎 qa",
	},
	{
		icon: "fa7-brands:x-twitter",
		label: "X / Twitter",
		group: "brands",
		keywords: "twitter x",
	},
	{
		icon: "fa7-brands:youtube",
		label: "YouTube",
		group: "brands",
		keywords: "youtube video",
	},
	{
		icon: "fa7-brands:discord",
		label: "Discord",
		group: "brands",
		keywords: "discord chat",
	},
	{
		icon: "fa7-brands:telegram",
		label: "Telegram",
		group: "brands",
		keywords: "telegram tg",
	},
	{
		icon: "fa7-brands:qq",
		label: "QQ",
		group: "brands",
		keywords: "qq tencent",
	},
	{
		icon: "fa7-brands:weixin",
		label: "微信 WeChat",
		group: "brands",
		keywords: "wechat weixin",
	},
	{
		icon: "fa7-brands:steam",
		label: "Steam",
		group: "brands",
		keywords: "steam game",
	},
	{
		icon: "fa7-brands:playstation",
		label: "PlayStation",
		group: "brands",
		keywords: "ps5 psn sony game",
	},
	{
		icon: "fa7-brands:xbox",
		label: "Xbox",
		group: "brands",
		keywords: "xbox microsoft game",
	},
	{
		icon: "simple-icons:nintendoswitch",
		label: "Switch",
		group: "brands",
		keywords: "nintendo switch game",
	},
	{
		icon: "simple-icons:epicgames",
		label: "Epic Games",
		group: "brands",
		keywords: "epic game",
	},
	{
		icon: "simple-icons:mihoyo",
		label: "miHoYo / 米哈游",
		group: "brands",
		keywords: "mihoyo genshin starrail",
	},
	{
		icon: "fa7-brands:itch-io",
		label: "itch.io",
		group: "brands",
		keywords: "itch indie game",
	},
	{
		icon: "fa7-brands:unity",
		label: "Unity",
		group: "brands",
		keywords: "unity engine 3d",
	},
	{
		icon: "simple-icons:astro",
		label: "Astro",
		group: "brands",
		keywords: "astro blog web",
	},
	{
		icon: "simple-icons:svelte",
		label: "Svelte",
		group: "brands",
		keywords: "svelte frontend",
	},
	{
		icon: "simple-icons:typescript",
		label: "TypeScript",
		group: "brands",
		keywords: "ts typescript",
	},
	{
		icon: "simple-icons:tailwindcss",
		label: "Tailwind CSS",
		group: "brands",
		keywords: "tailwind css",
	},
	{
		icon: "simple-icons:vite",
		label: "Vite",
		group: "brands",
		keywords: "vite build",
	},
	{
		icon: "fa7-brands:react",
		label: "React",
		group: "brands",
		keywords: "react frontend",
	},
	{
		icon: "fa7-brands:vuejs",
		label: "Vue",
		group: "brands",
		keywords: "vue frontend",
	},
	{
		icon: "fa7-brands:node-js",
		label: "Node.js",
		group: "brands",
		keywords: "node backend",
	},
	{
		icon: "fa7-brands:python",
		label: "Python",
		group: "brands",
		keywords: "python ai script",
	},
	{
		icon: "fa7-brands:rust",
		label: "Rust",
		group: "brands",
		keywords: "rust systems",
	},
	{
		icon: "fa7-brands:docker",
		label: "Docker",
		group: "brands",
		keywords: "docker container",
	},
	{
		icon: "fa7-brands:linux",
		label: "Linux",
		group: "brands",
		keywords: "linux os",
	},
	{
		icon: "fa7-brands:apple",
		label: "Apple / macOS",
		group: "brands",
		keywords: "apple mac ios",
	},
	{
		icon: "fa7-brands:windows",
		label: "Windows",
		group: "brands",
		keywords: "windows pc",
	},
	{
		icon: "simple-icons:figma",
		label: "Figma",
		group: "brands",
		keywords: "figma design ui",
	},
	{
		icon: "simple-icons:notion",
		label: "Notion",
		group: "brands",
		keywords: "notion notes docs",
	},
	{
		icon: "simple-icons:obsidian",
		label: "Obsidian",
		group: "brands",
		keywords: "obsidian markdown notes",
	},
	{
		icon: "fa7-brands:cloudflare",
		label: "Cloudflare",
		group: "brands",
		keywords: "cloudflare cdn edge",
	},
	{
		icon: "simple-icons:vercel",
		label: "Vercel",
		group: "brands",
		keywords: "vercel deploy",
	},
	{
		icon: "simple-icons:netlify",
		label: "Netlify",
		group: "brands",
		keywords: "netlify deploy",
	},
	{
		icon: "simple-icons:v2ex",
		label: "V2EX",
		group: "brands",
		keywords: "v2ex forum",
	},
	{
		icon: "simple-icons:juejin",
		label: "稀土掘金",
		group: "brands",
		keywords: "juejin tech blog",
	},
	{
		icon: "simple-icons:leetcode",
		label: "LeetCode",
		group: "brands",
		keywords: "leetcode algorithm",
	},
	{
		icon: "fa7-brands:stack-overflow",
		label: "Stack Overflow",
		group: "brands",
		keywords: "stackoverflow qa",
	},
	{
		icon: "fa7-brands:wikipedia-w",
		label: "Wikipedia",
		group: "brands",
		keywords: "wiki knowledge",
	},

	// ── 标签 / 状态 / 分类 ──
	{
		icon: "material-symbols:tag-rounded",
		label: "Tag 标签",
		group: "tags",
		keywords: "tag hash 标签",
	},
	{
		icon: "material-symbols:label-outline-rounded",
		label: "标签徽章",
		group: "tags",
		keywords: "label badge tag",
	},
	{
		icon: "material-symbols:sell-outline",
		label: "价格 / 分类牌",
		group: "tags",
		keywords: "sell tag price",
	},
	{
		icon: "material-symbols:category-outline-rounded",
		label: "分类图标",
		group: "tags",
		keywords: "category group",
	},
	{
		icon: "material-symbols:folder-outline-rounded",
		label: "合集文件夹",
		group: "tags",
		keywords: "folder collection",
	},
	{
		icon: "material-symbols:star-rounded",
		label: "精选 / Featured",
		group: "tags",
		keywords: "star featured 置顶",
	},
	{
		icon: "material-symbols:auto-awesome-rounded",
		label: "高亮 / 特别",
		group: "tags",
		keywords: "sparkle awesome",
	},
	{
		icon: "material-symbols:check-circle-outline-rounded",
		label: "已完成",
		group: "tags",
		keywords: "done shipped completed",
	},
	{
		icon: "material-symbols:play-circle-outline-rounded",
		label: "进行中",
		group: "tags",
		keywords: "playing active running",
	},
	{
		icon: "material-symbols:hourglass-empty-rounded",
		label: "待开始",
		group: "tags",
		keywords: "backlog pending wait",
	},
	{
		icon: "material-symbols:bookmark-outline-rounded",
		label: "愿望单 / 收藏",
		group: "tags",
		keywords: "wishlist bookmark save",
	},
	{
		icon: "material-symbols:bookmark-added-outline-rounded",
		label: "已归档",
		group: "tags",
		keywords: "bookmarked saved",
	},
	{
		icon: "material-symbols:verified-outline-rounded",
		label: "认证 / 推荐",
		group: "tags",
		keywords: "verified badge",
	},
	{
		icon: "material-symbols:tips-and-updates-outline-rounded",
		label: "探索中",
		group: "tags",
		keywords: "exploring idea tip",
	},
	{
		icon: "material-symbols:timer-outline-rounded",
		label: "时长记录",
		group: "tags",
		keywords: "timer hours time",
	},
	{
		icon: "fa7-solid:tags",
		label: "多标签",
		group: "tags",
		keywords: "tags multi",
	},
	{
		icon: "fa7-solid:compass",
		label: "实心罗盘",
		group: "tags",
		keywords: "compass solid",
	},
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
	"material-symbols:featured-seasonal-and-gifts-rounded",
	"material-symbols:close-rounded",
];
