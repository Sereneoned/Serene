/**
 * 管理员前端控制台与快速编辑配置类型。
 * 默认配置与说明见 src/config/adminConfig.ts。
 */
export interface AdminConfig {
	/** 是否启用管理员入口与 `/admin/` 控制台（关闭时零 DOM、零脚本、零请求） */
	readonly enable: boolean;
	/** 默认预填的 GitHub 仓库（格式 "owner/repo"，留空则在登录页手动输入并记住） */
	readonly defaultRepo: string;
	/** 目标提交分支，通常为 "main" */
	readonly defaultBranch: string;
	/** 内容路径前缀（单仓模式留空 ""，双仓模式可填写子路径） */
	readonly contentPrefix: string;
	/** 是否允许全站通过快捷键 Ctrl+Shift+A（Mac 为 Cmd+Shift+A）打开管理员入口 */
	readonly shortcut: boolean;
}
