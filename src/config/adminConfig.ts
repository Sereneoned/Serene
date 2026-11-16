import type { AdminConfig } from "@/types/adminConfig";
import { withUserConfig } from "../utils/config-overlay.ts";

/**
 * 管理员模式配置单一真源。
 * 遵循「零额外负担」原则：未登录访客不加载管理后台资源；
 * enable 为 false 时全站零入口、零监听器，`/admin/` 重定向到 404。
 */
export const adminConfig: AdminConfig = withUserConfig("admin", {
	enable: true,
	defaultRepo: "Sereneoned/Serene",
	defaultBranch: "main",
	contentPrefix: "",
	shortcut: true,
});
