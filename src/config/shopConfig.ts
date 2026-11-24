import type { ShopConfig } from "@/types/shopConfig";
import { withUserConfig } from "../utils/config-overlay.ts";

/**
 * 个人小店配置（侧栏 PersonalShop widget 消费）。
 * 展示文案走 i18n（支持中英文及多语言切换），此处保留店铺标识与直联方式。
 */
export const shopConfig: ShopConfig = withUserConfig("shop", {
	name: "Serene's shop",
	url: "https://wzyp.cn/shop/SSW6MV14",
	qq: "2682144259",
});
