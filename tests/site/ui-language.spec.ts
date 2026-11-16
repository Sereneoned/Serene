import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { profileConfig } from "../../src/config/profileConfig";
import I18nKey from "../../src/i18n/i18nKey";
import { en } from "../../src/i18n/languages/en";
import { zh_CN } from "../../src/i18n/languages/zh_CN";

const STORAGE_KEY = "shirone-ui-locale";
const GUIDE_PATH = "/posts/guide/";

test.use({ reducedMotion: "reduce" });
test.setTimeout(60_000);

async function openPage(page: Page, path = "/") {
	await page.route("https://api.github.com/**", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				description: "A deterministic UI language test repository.",
				language: "TypeScript",
				stargazers_count: 1,
				forks_count: 1,
				owner: {
					avatar_url:
						"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
				},
				license: { spdx_id: "MIT" },
			}),
		}),
	);
	await page.goto(path, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() =>
		getComputedStyle(document.documentElement)
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	await page.waitForFunction(() =>
		[...document.querySelectorAll<HTMLElement>(".onload-animation")].every(
			(element) =>
				element.offsetParent === null ||
				getComputedStyle(element).opacity === "1",
		),
	);
	await expect(page.locator("#ui-language-switch")).toBeVisible();
}

async function expectLocale(page: Page, locale: "en" | "zh_CN") {
	const chinese = locale === "zh_CN";
	await expect(page.locator("html")).toHaveAttribute("data-ui-locale", locale);
	await expect(page.locator("html")).toHaveAttribute(
		"lang",
		chinese ? "zh-CN" : "en",
	);
	await expect(page.locator("#ui-language-switch")).toHaveAttribute(
		"aria-pressed",
		String(chinese),
	);
	await expect(page.locator("#ui-language-switch")).toHaveText(
		chinese ? "English" : "简体中文",
	);
}

async function expectDesktopNavigation(page: Page, locale: "en" | "zh_CN") {
	const labels = locale === "zh_CN" ? zh_CN : en;
	await expect(page.locator('#navbar nav a[href="/"]')).toHaveText(
		labels[I18nKey.home],
	);
	await expect(page.locator('#navbar nav a[href="/archive/"]')).toHaveText(
		labels[I18nKey.archive],
	);
	await expect(page.locator("#display-settings-switch")).toHaveAttribute(
		"aria-label",
		labels[I18nKey.displaySettings],
	);
	await expect(page.locator("#search-input-desktop")).toHaveAttribute(
		"placeholder",
		labels[I18nKey.search],
	);
}

test.describe("visitor UI language", () => {
	test("switches system UI without translating authored content", async ({
		page,
	}) => {
		await openPage(page);
		await expectLocale(page, "en");
		await expectDesktopNavigation(page, "en");

		const siteTitle = page.locator("#navbar > div > a");
		const authoredTitle = page.locator(
			`#swup-container a.m3-blog-postcard__title[href="${GUIDE_PATH}"]`,
		);
		const announcement = page.locator(".announcement-content").first();
		const before = {
			siteTitle: await siteTitle.innerText(),
			postTitle: await authoredTitle.innerText(),
			announcement: await announcement.innerText(),
		};

		await page.locator("#ui-language-switch").click();
		await expectLocale(page, "zh_CN");
		await expectDesktopNavigation(page, "zh_CN");
		await expect(siteTitle).toHaveText(before.siteTitle);
		await expect(authoredTitle).toHaveText(before.postTitle);
		await expect(announcement).toHaveText(before.announcement);
		await expect(
			page.getByText(profileConfig.bio, { exact: true }).first(),
		).toHaveText(profileConfig.bio);
		await expect(
			page.locator('#navbar a[href="https://github.com/LyraVoid/Shirone"]'),
		).toHaveText("GitHub");

		await page.locator("#display-settings-switch").click();
		await expect(
			page
				.locator("#display-setting")
				.getByText(zh_CN[I18nKey.themeColor], { exact: true })
				.first(),
		).toBeVisible();
	});

	test("remembers Chinese after reload and can restore English", async ({
		page,
	}) => {
		await openPage(page);
		await page.locator("#ui-language-switch").click();
		await expectLocale(page, "zh_CN");
		expect(
			await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
		).toBe("zh_CN");

		await page.reload({ waitUntil: "domcontentloaded" });
		await expectLocale(page, "zh_CN");
		await expectDesktopNavigation(page, "zh_CN");

		await page.locator("#ui-language-switch").click();
		await expectLocale(page, "en");
		await expectDesktopNavigation(page, "en");
		expect(
			await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
		).toBe("en");

		await page.reload({ waitUntil: "domcontentloaded" });
		await expectLocale(page, "en");
		await expectDesktopNavigation(page, "en");
	});

	test("keeps Chinese during Swup navigation and leaves article prose untouched", async ({
		page,
	}) => {
		await openPage(page);
		await page.locator("#ui-language-switch").click();
		await expectLocale(page, "zh_CN");
		await page.waitForFunction(() => Boolean(window.swup?.hooks));
		await page.evaluate(() => {
			(
				window as typeof window & { __uiLocaleNavProbe?: string }
			).__uiLocaleNavProbe = "alive";
		});

		await page.evaluate(() => window.swup?.navigate("/archive/"));
		await expect(page.locator("#swup-container")).toHaveAttribute(
			"data-current-page",
			"archive",
		);
		await expectLocale(page, "zh_CN");
		await expectDesktopNavigation(page, "zh_CN");
		await expect(
			page.getByRole("group", { name: zh_CN[I18nKey.archiveGroup] }),
		).toBeVisible();
		await expect(
			page.getByRole("radio", {
				name: zh_CN[I18nKey.archiveGroupYear],
				exact: true,
			}),
		).toBeChecked();

		await page.evaluate((path) => window.swup?.navigate(path), GUIDE_PATH);
		await expect(page).toHaveURL(new RegExp(`${GUIDE_PATH}$`));
		await expectLocale(page, "zh_CN");
		const prose = page.locator(".markdown-content").first();
		await expect(prose).toContainText("Welcome to");
		await expect(prose).toContainText("This guide walks you through");
		await prose.evaluate((element) => {
			const paragraph = document.createElement("p");
			paragraph.dataset.authoredLanguageProbe = "true";
			paragraph.textContent = "Home Search Settings";
			element.append(paragraph);
		});
		await page.locator("#ui-language-switch").click();
		await expectLocale(page, "en");
		await page.locator("#ui-language-switch").click();
		await expectLocale(page, "zh_CN");
		await expect(prose.locator("[data-authored-language-probe]")).toHaveText(
			"Home Search Settings",
		);
		await expect(prose).toContainText("This guide walks you through");
		expect(
			await page.evaluate(
				() =>
					(window as typeof window & { __uiLocaleNavProbe?: string })
						.__uiLocaleNavProbe,
			),
		).toBe("alive");
	});

	test("works with keyboard on mobile and localizes the navigation drawer", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openPage(page);
		const languageSwitch = page.locator("#ui-language-switch");
		await languageSwitch.focus();
		await expect(languageSwitch).toBeFocused();
		await languageSwitch.press("Enter");
		await expectLocale(page, "zh_CN");
		const bounds = await languageSwitch.boundingBox();
		if (!bounds)
			throw new Error("The mobile language switch has no layout box");
		expect(bounds.x).toBeGreaterThanOrEqual(0);
		expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);

		await page.locator("#nav-drawer-switch").click();
		await expect(page.locator(".site-drawer")).toHaveClass(/site-drawer--open/);
		await expect(page.locator('.site-drawer a[href="/"]')).toHaveText(
			zh_CN[I18nKey.home],
		);
		await expect(page.locator('.site-drawer a[href="/archive/"]')).toHaveText(
			zh_CN[I18nKey.archive],
		);
		await page.keyboard.press("Escape");
		await expect(page.locator(".site-drawer")).not.toHaveClass(
			/site-drawer--open/,
		);

		const accessibility = await new AxeBuilder({ page })
			.include("#navbar")
			.analyze();
		expect(
			accessibility.violations.map((violation) => ({
				id: violation.id,
				nodes: violation.nodes.map((node) => node.target),
			})),
		).toEqual([]);
		await languageSwitch.focus();
		await languageSwitch.press("Space");
		await expectLocale(page, "en");
	});

	test("uses the drawer without top bar overflow at intermediate desktop widths", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1100, height: 900 });
		await openPage(page);
		await expectLocale(page, "en");
		const desktopNavigation = page.locator("#navbar > div > nav");
		const drawerSwitch = page.locator("#nav-drawer-switch");
		const languageSwitch = page.locator("#ui-language-switch");
		const expectCompactTopBar = async () => {
			await expect(desktopNavigation).toBeHidden();
			await expect(drawerSwitch).toBeVisible();
			const bounds = await languageSwitch.boundingBox();
			if (!bounds)
				throw new Error("The language switch has no layout box at 1100px");
			expect(bounds.x).toBeGreaterThanOrEqual(0);
			expect(bounds.x + bounds.width).toBeLessThanOrEqual(1100);
			const overflow = await page
				.locator("#navbar > div")
				.first()
				.evaluate((element) => ({
					clientWidth: element.clientWidth,
					scrollWidth: element.scrollWidth,
				}));
			expect(overflow.scrollWidth).toBeLessThanOrEqual(
				overflow.clientWidth + 1,
			);
		};

		await expectCompactTopBar();
		await languageSwitch.click();
		await expectLocale(page, "zh_CN");
		await expectCompactTopBar();
		await drawerSwitch.click();
		await expect(page.locator(".site-drawer")).toHaveClass(/site-drawer--open/);
		await expect(page.locator('.site-drawer a[href="/"]')).toHaveText(
			zh_CN[I18nKey.home],
		);
		await expect(page.locator('.site-drawer a[href="/archive/"]')).toHaveText(
			zh_CN[I18nKey.archive],
		);
	});
});
