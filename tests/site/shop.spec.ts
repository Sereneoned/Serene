import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { shopConfig } from "../../src/config/shopConfig";
import { siteConfig } from "../../src/config/siteConfig";
import I18nKey from "../../src/i18n/i18nKey";
import { en } from "../../src/i18n/languages/en";
import { zh_CN } from "../../src/i18n/languages/zh_CN";

const siteBase = (siteConfig.base || "/").replace(/\/+$/, "");
const withBase = (path: string) => `${siteBase}${path}`;

async function waitForReady(page: Page) {
	await page.waitForFunction(() =>
		getComputedStyle(document.documentElement)
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	await page.waitForFunction(() =>
		[...document.querySelectorAll<HTMLElement>(".onload-animation")].every(
			(el) => el.offsetParent === null || getComputedStyle(el).opacity === "1",
		),
	);
}

test.describe("Personal Shop sidebar widget", () => {
	test.use({ viewport: { width: 1280, height: 900 } });

	test("renders directly below Calendar with brand, offerings, QQ copy, and shop link", async ({
		page,
		context,
	}) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await page.goto(withBase("/"), { waitUntil: "networkidle" });
		await waitForReady(page);

		const calendar = page.locator('widget-layout[data-id="calendar"]');
		const shop = page.locator('widget-layout[data-id="shop"]');
		await expect(calendar).toBeVisible();
		await expect(shop).toBeVisible();

		const [calendarBox, shopBox, sidebarBox] = await Promise.all([
			calendar.boundingBox(),
			shop.boundingBox(),
			page.locator("#sidebar-secondary").boundingBox(),
		]);
		if (!calendarBox || !shopBox || !sidebarBox) {
			throw new Error("Missing secondary sidebar widget bounding boxes");
		}
		expect(shopBox.y).toBeGreaterThanOrEqual(
			calendarBox.y + calendarBox.height + 12,
		);
		expect(shopBox.x).toBeGreaterThanOrEqual(sidebarBox.x - 1);
		expect(shopBox.x + shopBox.width).toBeLessThanOrEqual(
			sidebarBox.x + sidebarBox.width + 1,
		);

		await expect(shop.locator(".m3-shop__brand-name")).toHaveText(
			shopConfig.name,
		);
		await expect(shop.locator(".m3-shop__badge")).toHaveText(
			en[I18nKey.shopBadge],
		);

		const cta = shop.locator("a.m3-shop__visit");
		await expect(cta).toHaveAttribute("href", shopConfig.url);
		await expect(cta).toHaveAttribute("target", "_blank");
		await expect(cta).toHaveAttribute("rel", "noopener noreferrer");
		await expect(cta).toContainText(en[I18nKey.shopVisit]);

		const qqBtn = shop.locator("[data-shop-qq-copy]");
		await expect(qqBtn).toHaveAttribute(
			"title",
			en[I18nKey.shopCopyQqAria].replaceAll("{qq}", shopConfig.qq ?? ""),
		);
		await expect(qqBtn).toContainText(shopConfig.qq ?? "");
		await qqBtn.click();
		await expect(qqBtn).toHaveAttribute("data-copied", "true");
		await expect(qqBtn.locator("[data-shop-qq-copy-label]")).toHaveText(
			en[I18nKey.shopQqCopied],
		);
		const clipboard = await page.evaluate(() => navigator.clipboard.readText());
		expect(clipboard).toBe(shopConfig.qq);
	});

	test("adapts between English and Simplified Chinese on UI language toggle and Swup navigation", async ({
		page,
	}) => {
		await page.goto(withBase("/"), { waitUntil: "networkidle" });
		await waitForReady(page);

		const shop = page.locator('widget-layout[data-id="shop"]');
		await page.locator("#ui-language-switch").click();
		await expect(page.locator("html")).toHaveAttribute(
			"data-ui-locale",
			"zh_CN",
		);

		await expect(
			shop.locator(".widget-layout__header > span").last(),
		).toHaveText(zh_CN[I18nKey.shop]);
		await expect(shop.locator(".m3-shop__badge")).toHaveText(
			zh_CN[I18nKey.shopBadge],
		);
		await expect(shop.locator("[data-ui-i18n='shopOfferTopup']")).toHaveText(
			zh_CN[I18nKey.shopOfferTopup],
		);
		await expect(shop.locator("[data-ui-i18n='shopOfferTools']")).toHaveText(
			zh_CN[I18nKey.shopOfferTools],
		);
		await expect(shop.locator("[data-ui-i18n='shopOfferDirect']")).toHaveText(
			zh_CN[I18nKey.shopOfferDirect],
		);
		await expect(shop.locator(".m3-shop__visit-label")).toHaveText(
			zh_CN[I18nKey.shopVisit],
		);
		await expect(shop.locator("[data-shop-qq-copy]")).toHaveAttribute(
			"title",
			zh_CN[I18nKey.shopCopyQqAria].replaceAll("{qq}", shopConfig.qq ?? ""),
		);
		await expect(shop.locator(".m3-shop__brand-name")).toHaveText(
			shopConfig.name,
		);

		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await page.evaluate(
			(path) => window.swup?.navigate(path),
			withBase("/archive/"),
		);
		await expect(page.locator("#swup-container")).toHaveAttribute(
			"data-current-page",
			"archive",
		);
		await expect(shop).toBeVisible();
		await expect(shop.locator(".m3-shop__visit-label")).toHaveText(
			zh_CN[I18nKey.shopVisit],
		);
	});

	test("passes accessibility checks in light and dark modes without clipping TOC", async ({
		page,
	}) => {
		for (const theme of ["light", "dark"] as const) {
			await page.addInitScript((value) => {
				localStorage.setItem("theme", value);
			}, theme);
			await page.goto(withBase("/"), { waitUntil: "networkidle" });
			await waitForReady(page);
			const results = await new AxeBuilder({ page })
				.include('widget-layout[data-id="shop"]')
				.analyze();
			expect(results.violations).toEqual([]);
		}

		await page.setViewportSize({ width: 1600, height: 500 });
		await page.goto(withBase("/posts/antigravity-guide-tips/"), {
			waitUntil: "networkidle",
		});
		await waitForReady(page);
		await expect(page.locator('widget-layout[data-id="shop"]')).toBeVisible();
		await page.evaluate(() =>
			window.scrollTo(0, document.documentElement.scrollHeight),
		);
		const tocBottom = await page
			.locator(".sidebar-toc")
			.evaluate((el) => el.getBoundingClientRect().bottom);
		expect(tocBottom).toBeLessThanOrEqual(510);
	});
});
