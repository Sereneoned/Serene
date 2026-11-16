import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { siteConfig } from "../../src/config/siteConfig";

const siteBase = (siteConfig.base || "/").replace(/\/+$/, "");
const withBase = (path: string) => `${siteBase}${path}`;

const MOCK_SESSION = {
	owner: "demo-owner",
	repo: "Shirone",
	branch: "main",
	contentPrefix: "",
	token: "github_pat_mock_token",
	user: {
		login: "demo-owner",
		name: "Demo Owner",
		avatarUrl: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
	},
	remember: true,
	verifiedAt: "2026-11-16T08:00:00.000Z",
};

async function mockGitHubApi(page: Page) {
	await page.route("https://api.github.com/**", async (route) => {
		const url = new URL(route.request().url());
		const path = url.pathname;
		if (path === "/user") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					login: "demo-owner",
					name: "Demo Owner",
					avatar_url:
						"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
				}),
			});
		}
		if (path === "/repos/demo-owner/Shirone") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					default_branch: "main",
					permissions: { push: true, admin: true },
				}),
			});
		}
		if (path === "/repos/demo-owner/Shirone/branches/main") {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ name: "main" }),
			});
		}
		if (path.includes("/contents/")) {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify([]),
			});
		}
		if (path.includes("/actions/runs")) {
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ workflow_runs: [] }),
			});
		}
		return route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({}),
		});
	});
}

test.describe("Admin mode & zero-burden public pages", () => {
	test("hides all admin controls from ordinary visitors", async ({ page }) => {
		await page.goto(withBase("/moments/"), { waitUntil: "domcontentloaded" });
		await expect(page.locator(".admin-dock")).toHaveCount(0);
		await expect(page.locator(".moment-admin-composer")).toHaveCount(0);
		await expect(page.locator(".moment-admin-actions")).toHaveCount(0);

		await page.goto(withBase("/albums/"), { waitUntil: "domcontentloaded" });
		await expect(page.locator(".album-section__admin-bar")).toHaveCount(0);
	});

	test("authenticates on /admin/ via GitHub API and unlocks tabs", async ({
		page,
	}) => {
		await mockGitHubApi(page);
		await page.goto(withBase("/admin/"), { waitUntil: "domcontentloaded" });

		await expect(
			page.getByRole("heading", { name: "管理员身份认证" }),
		).toBeVisible();

		await page
			.getByRole("textbox", { name: /GitHub 仓库/ })
			.fill("demo-owner/Shirone");
		await page
			.getByRole("textbox", { name: /GitHub Personal Access Token/ })
			.fill("github_pat_mock_token");
		await page.getByRole("button", { name: "验证并进入管理员模式" }).click();

		await expect(page.locator(".admin-studio__tabs")).toBeVisible();
		await expect(page.getByRole("button", { name: /音乐曲库/ })).toBeVisible();

		await page.getByRole("button", { name: /音乐曲库/ }).click();
		await expect(
			page.getByText("选择整个 MP3 文件夹", { exact: true }),
		).toBeVisible();

		const a11y = await new AxeBuilder({ page })
			.disableRules(["page-has-heading-one"])
			.analyze();
		expect(a11y.violations).toEqual([]);
	});

	test("shows inline QQ-style controls on moments & albums once signed in", async ({
		page,
	}) => {
		await mockGitHubApi(page);
		await page.addInitScript((session) => {
			localStorage.setItem("shirone-admin-session", JSON.stringify(session));
		}, MOCK_SESSION);

		await page.goto(withBase("/moments/"), { waitUntil: "domcontentloaded" });
		await expect(page.locator(".admin-dock")).toBeVisible();
		await expect(page.locator(".moment-admin-composer")).toBeVisible();
		await expect(page.locator(".moment-admin-actions").first()).toBeVisible();

		await page.goto(withBase("/albums/"), { waitUntil: "domcontentloaded" });
		await expect(page.locator(".album-section__admin-bar")).toBeVisible();
	});
});
