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
		if ((await page.locator(".moment-section__entry").count()) > 0) {
			await expect(page.locator(".moment-admin-actions").first()).toBeVisible();
		} else {
			await expect(page.locator(".moment-section__empty")).toBeVisible();
		}

		await page.goto(withBase("/albums/"), { waitUntil: "domcontentloaded" });
		await expect(page.locator(".album-section__admin-bar")).toBeVisible();
	});

	test("provides visual editors with UI icon pickers & tags for timeline, projects, games, and compass", async ({
		page,
	}) => {
		const postedBlobs: Array<{ content: string; encoding: string }> = [];
		await page.route("https://api.github.com/**", async (route) => {
			const url = new URL(route.request().url());
			const path = url.pathname;
			if (path === "/repos/demo-owner/Shirone/git/ref/heads/main") {
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ object: { sha: "base-commit-sha" } }),
				});
			}
			if (path === "/repos/demo-owner/Shirone/git/commits/base-commit-sha") {
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ tree: { sha: "base-tree-sha" } }),
				});
			}
			if (path === "/repos/demo-owner/Shirone/git/blobs") {
				const body = route.request().postDataJSON() as {
					content: string;
					encoding: string;
				};
				postedBlobs.push(body);
				return route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({ sha: `blob-${postedBlobs.length}` }),
				});
			}
			if (path === "/repos/demo-owner/Shirone/git/trees") {
				return route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({ sha: "new-tree-sha" }),
				});
			}
			if (path === "/repos/demo-owner/Shirone/git/commits") {
				return route.fulfill({
					status: 201,
					contentType: "application/json",
					body: JSON.stringify({
						sha: "new-commit-sha",
						html_url: "https://github.com/demo-owner/Shirone/commit/new",
					}),
				});
			}
			if (path === "/repos/demo-owner/Shirone/git/refs/heads/main") {
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({ object: { sha: "new-commit-sha" } }),
				});
			}
			if (path.includes("/contents/src/data/json/admin-overrides.json")) {
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						type: "file",
						sha: "override-sha",
						encoding: "base64",
						content: Buffer.from("{}").toString("base64"),
					}),
				});
			}
			if (path.includes("/contents/")) {
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify([]),
				});
			}
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({}),
			});
		});

		await page.addInitScript((session) => {
			localStorage.setItem("shirone-admin-session", JSON.stringify(session));
		}, MOCK_SESSION);

		await page.goto(withBase("/admin/?tab=data"), {
			waitUntil: "domcontentloaded",
		});

		// 1. Timeline visual editor: add milestone with UI icon picker + tag input
		await expect(page.getByRole("heading", { name: /时间线/ })).toBeVisible();
		await page.getByLabel("事件标题 (必需)").fill("上线 Serene 博客");
		await page
			.locator(".timeline-editor")
			.getByRole("button", { name: "选择图标" })
			.first()
			.click();
		await expect(page.getByLabel("搜索预置 UI 图标")).toBeVisible();
		await page.getByRole("button", { name: "发布上线" }).click();

		const tagInput = page.getByLabel("技术栈 / 关联标签 (Tags)");
		await tagInput.fill("Astro 5");
		await tagInput.press("Enter");
		await page.getByRole("button", { name: "里程碑", exact: true }).click();
		await page.getByRole("button", { name: "添加到时间线" }).click();

		await expect(page.locator(".timeline-editor__row-title strong")).toHaveText(
			"上线 Serene 博客",
		);

		// Save timeline -> verifies atomic GitHub blob creation contains new timeline entry
		await page.getByRole("button", { name: /保存 时间线/ }).click();
		await expect.poll(() => postedBlobs.length).toBeGreaterThan(0);
		const committedTimeline = Buffer.from(
			postedBlobs[postedBlobs.length - 1].content,
			"base64",
		).toString("utf8");
		expect(committedTimeline).toContain("上线 Serene 博客");
		expect(committedTimeline).toContain(
			"material-symbols:rocket-launch-rounded",
		);
		expect(committedTimeline).toContain("Astro 5");

		// 2. Projects visual editor
		await page.getByRole("button", { name: "项目展示", exact: true }).click();
		await page.getByLabel("项目名称 (必需)").fill("Serene Blog");
		await page.getByLabel("项目简介 (必需)").fill("Personal M3E site");
		await page.getByLabel("技术栈与标签 (Technologies / Tags)").fill("Svelte");
		await page.getByLabel("技术栈与标签 (Technologies / Tags)").press("Enter");
		await page.getByRole("button", { name: "添加到项目列表" }).click();
		await expect(page.locator(".projects-editor__row-title strong")).toHaveText(
			"Serene Blog",
		);

		// 3. Games visual editor
		await page.getByRole("button", { name: "游戏记录", exact: true }).click();
		await page.getByLabel("游戏名称 (必需)").fill("Elden Ring");
		await page.getByLabel("游戏简评 / 感想 (必需)").fill("Epic open world RPG");
		await page.getByRole("button", { name: "Switch", exact: true }).click();
		await page.getByRole("button", { name: "添加到游戏列表" }).click();
		await expect(page.locator(".games-editor__row-title strong")).toHaveText(
			"Elden Ring",
		);

		// 4. Compass visual editor
		await page.getByRole("button", { name: "站点罗盘", exact: true }).click();
		await page.getByRole("button", { name: "新增罗盘分组" }).click();
		await page.getByLabel("分组名称 (如 开发工具)").fill("常用导航");
		await page.getByRole("button", { name: "创建分组" }).click();
		await page.getByLabel("站点名称 (必需)").fill("GitHub");
		await page
			.getByLabel("站点网址 URL (https://...)")
			.fill("https://github.com");
		await page.getByRole("button", { name: "添加到当前分组" }).click();
		await expect(page.locator(".compass-editor__entry-info strong")).toHaveText(
			"GitHub",
		);

		const a11y = await new AxeBuilder({ page })
			.disableRules(["page-has-heading-one"])
			.analyze();
		expect(a11y.violations).toEqual([]);
	});
});
