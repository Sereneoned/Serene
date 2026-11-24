import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { siteConfig } from "../../src/config/siteConfig";

const siteBase = (siteConfig.base || "/").replace(/\/+$/, "");
const withBase = (path: string) => `${siteBase}${path}`;

test.describe("Album download buttons & Fancybox integration", () => {
	test("downloads a single photo, packs the entire album as a valid ZIP, and exposes Fancybox download", async ({
		page,
	}) => {
		await page.goto(withBase("/albums/nakamori-akina/"), {
			waitUntil: "networkidle",
		});

		const items = page.locator(".album-gallery__item");
		await expect(items).toHaveCount(40);

		// 1. Single photo download button downloads without opening Fancybox
		const firstItem = items.first();
		await firstItem.hover();
		const singleBtn = firstItem.locator("[data-album-download-photo]");
		await expect(singleBtn).toBeVisible();

		const [singleDownload] = await Promise.all([
			page.waitForEvent("download"),
			singleBtn.click(),
		]);
		expect(singleDownload.suggestedFilename()).toMatch(/\.webp$/i);
		await expect(page.locator(".fancybox__container")).toHaveCount(0);

		// 2. Clicking the photo opens Fancybox gallery with built-in download button
		await firstItem.locator(".album-gallery__trigger").click();
		const lightbox = page.locator(".fancybox__container.is-ready");
		await expect(lightbox).toBeVisible();
		await expect(lightbox.locator("[data-carousel-download]")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(lightbox).toBeHidden();

		// 3. Whole-album download button packs all 40 photos into a valid PKZIP archive
		const downloadAllBtn = page.locator("[data-album-download-all] button");
		await expect(downloadAllBtn).toBeVisible();

		const [albumDownload] = await Promise.all([
			page.waitForEvent("download"),
			downloadAllBtn.click(),
		]);
		expect(albumDownload.suggestedFilename()).toMatch(/\.zip$/i);
		const zipPath = await albumDownload.path();
		expect(zipPath).toBeTruthy();
		if (zipPath) {
			const bytes = readFileSync(zipPath);
			const view = new DataView(
				bytes.buffer,
				bytes.byteOffset,
				bytes.byteLength,
			);
			// PKZIP local file header + End of Central Directory signatures + 40 entries
			expect(view.getUint32(0, true)).toBe(0x04034b50);
			expect(view.getUint32(bytes.byteLength - 22, true)).toBe(0x06054b50);
			expect(view.getUint16(bytes.byteLength - 12, true)).toBe(40);
		}
	});

	test("keeps WCAG 2.1 AA accessibility clean in light and dark modes", async ({
		page,
	}) => {
		for (const theme of ["light", "dark"]) {
			await page.addInitScript((mode) => {
				localStorage.setItem("theme", mode);
			}, theme);
			await page.goto(withBase("/albums/nakamori-akina/"), {
				waitUntil: "networkidle",
			});
			await expect(page.locator(".album-gallery__item").first()).toBeVisible();
			const results = await new AxeBuilder({ page })
				.include(".album-detail")
				.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
				.disableRules(["page-has-heading-one"])
				.analyze();
			expect(results.violations).toEqual([]);
		}
	});
});
