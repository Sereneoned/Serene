/**
 * 个人小店配置（ShopConfig）
 * 可见性由 sidebarConfig.components 统一控制（type: "shop"）。
 */
export interface ShopConfig {
	/** 店铺名称（品牌名，保持原文不随 UI 语言翻译） */
	name: string;
	/** 店铺链接（留空时不渲染小店组件） */
	url: string;
	/** 直联 QQ 号（支持一键复制免平台手续费） */
	qq?: string;
}
