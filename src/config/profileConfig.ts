import type { ProfileConfig } from "@/types/config";
import { withUserConfig } from "../utils/config-overlay.ts";

/**
 * 博主资料：头像 / 名称 / 简介 / 社交链接（侧栏 Profile 卡片、页脚、RSS 作者等消费）。
 * 类型见 src/types/config.ts。
 */
export const profileConfig: ProfileConfig = withUserConfig("profile", {
	avatar: "assets/images/avatar.jpg", // Relative to the /src directory. Relative to the /public directory if it starts with '/'
	name: "Serene",
	bio: "The rain remembers what the sky forgot to say.",
	links: [
		{
			name: "GitHub",
			icon: "fa7-brands:github",
			url: "https://github.com/Sereneoned",
		},
		{
			name: "Bilibili",
			icon: "fa7-brands:bilibili",
			url: "https://space.bilibili.com/510273434",
		},
		{
			name: "小红书",
			icon: "simple-icons:xiaohongshu",
			url: "https://www.xiaohongshu.com/user/profile/6ac2036e000000001400d800",
		},
		{
			name: "抖音",
			icon: "fa7-brands:tiktok",
			url: "https://www.douyin.com/user/self?from_tab_name=main&showSubTab=video&showTab=post",
		},
		{
			name: "知乎",
			icon: "fa7-brands:zhihu",
			url: "https://www.zhihu.com/people/2-33-95-44-91",
		},
	],
});
