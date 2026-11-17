import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
	commentConfig,
	resolveCommentOptions,
} from "../../src/config/commentConfig";
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
		const commentsActive = resolveCommentOptions(commentConfig) !== null;
		await page.goto(withBase("/moments/"), { waitUntil: "domcontentloaded" });
		await expect(page.locator(".admin-dock")).toHaveCount(0);
		await expect(page.locator(".moment-admin-composer")).toHaveCount(0);
		await expect(page.locator(".moment-admin-actions")).toHaveCount(0);
		await expect(page.locator("shirone-waline")).toHaveCount(0);
		if (!commentsActive) {
			await expect(page.locator("[data-content-interactions]")).toHaveCount(0);
		} else {
			expect(
				await page.locator("[data-content-interactions]").count(),
			).toBeGreaterThan(0);
		}

		await page.goto(withBase("/albums/"), { waitUntil: "domcontentloaded" });
		await expect(page.locator(".album-section__admin-bar")).toHaveCount(0);

		for (const route of ["/timeline/", "/projects/", "/games/", "/compass/"]) {
			await page.goto(withBase(route), { waitUntil: "domcontentloaded" });
			await expect(page.locator(".section-admin-bar")).toHaveCount(0);
		}
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

	test("exposes inline frontend editors on /timeline, /projects, /games, /compass & ?domain= deep links", async ({
		page,
	}) => {
		await mockGitHubApi(page);
		await page.addInitScript((session) => {
			localStorage.setItem("shirone-admin-session", JSON.stringify(session));
		}, MOCK_SESSION);

		// Floating dock shows shortcuts for timeline/projects/games/compass
		await page.goto(withBase("/timeline/"), { waitUntil: "domcontentloaded" });
		await page.locator(".admin-dock__pill").click();
		await expect(
			page
				.locator(".admin-dock__menu")
				.getByRole("link", { name: "时间线编辑" }),
		).toBeVisible();
		await expect(
			page
				.locator(".admin-dock__menu")
				.getByRole("link", { name: "站点罗盘编辑" }),
		).toBeVisible();
		await page.locator(".admin-dock__pill").click();

		// Inline frontend editor right on /timeline/
		await expect(page.locator(".section-admin-bar")).toBeVisible();
		await page.getByRole("button", { name: "在当前页编辑时间线" }).click();
		await expect(page.locator(".timeline-editor")).toBeVisible();
		await expect(
			page
				.locator(".section-admin-bar")
				.getByRole("link", { name: "前往完整管理台" }),
		).toHaveAttribute("href", /\/admin\/\?tab=data&domain=timeline/);

		const timelineA11y = await new AxeBuilder({ page })
			.disableRules(["page-has-heading-one"])
			.analyze();
		expect(timelineA11y.violations).toEqual([]);

		// Verify /projects/, /games/, /compass/ also expose frontend edit bars when signed in
		for (const [route, btnName] of [
			["/projects/", "在当前页编辑项目展示"],
			["/games/", "在当前页编辑游戏记录"],
			["/compass/", "在当前页编辑站点罗盘"],
		]) {
			await page.goto(withBase(route), { waitUntil: "domcontentloaded" });
			await expect(page.getByRole("button", { name: btnName })).toBeVisible();
		}

		// Deep link /admin/?tab=data&domain=compass lands directly on Compass editor
		await page.goto(withBase("/admin/?tab=data&domain=compass"), {
			waitUntil: "domcontentloaded",
		});
		await expect(page.getByRole("heading", { name: /站点罗盘/ })).toBeVisible();
		await expect(page.locator(".compass-editor")).toBeVisible();
	});

	test("allows configuring Waline comments/likes and Umami analytics from /admin/?tab=site", async ({
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
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({}),
			});
		});

		await page.addInitScript((session) => {
			localStorage.setItem("shirone-admin-session", JSON.stringify(session));
		}, MOCK_SESSION);

		await page.goto(withBase("/admin/?tab=site"), {
			waitUntil: "domcontentloaded",
		});
		await expect(
			page.getByRole("heading", { name: /评论互动与浏览量统计/ }),
		).toBeVisible();

		await page
			.getByLabel("Waline 服务端地址 (serverURL)")
			.fill("https://waline.example.com");
		const walineCheckbox = page.getByRole("checkbox", { name: "启用 Waline" });
		if (!(await walineCheckbox.isChecked())) {
			await page
				.locator('label.m3-switch:has(input[aria-label="启用 Waline"])')
				.click();
		}

		await page
			.getByLabel("Umami 公开分享链接 (shareUrl)")
			.fill("https://cloud.umami.is/share/demo");
		await page.getByLabel("Umami Website ID").fill("demo-site-id");
		await page
			.getByLabel("Umami 采集脚本地址 (scriptUrl)")
			.fill("https://cloud.umami.is/script.js");
		const umamiCheckbox = page.getByRole("checkbox", { name: "启用 Umami" });
		if (!(await umamiCheckbox.isChecked())) {
			await page
				.locator('label.m3-switch:has(input[aria-label="启用 Umami"])')
				.click();
		}

		await page.getByRole("button", { name: "保存全站配置到 GitHub" }).click();
		await expect.poll(() => postedBlobs.length).toBeGreaterThan(0);

		const saved = JSON.parse(
			Buffer.from(
				postedBlobs[postedBlobs.length - 1].content,
				"base64",
			).toString("utf8"),
		);
		expect(saved.comment.enable).toBe(true);
		expect(saved.comment.provider).toBe("waline");
		expect(saved.comment.waline.serverURL).toBe("https://waline.example.com");
		expect(saved.umami.enable).toBe(true);
		expect(saved.umami.shareUrl).toBe("https://cloud.umami.is/share/demo");
		expect(saved.umami.websiteId).toBe("demo-site-id");
		expect(saved.umami.scriptUrl).toBe("https://cloud.umami.is/script.js");
	});

	test("resolves post card covers and inline body images under subpath base", async ({
		page,
	}) => {
		await page.goto(withBase("/"), { waitUntil: "networkidle" });
		const cardImg = page.locator(".m3-blog-postcard__cover img").first();
		await expect(cardImg).toBeVisible();
		await expect(cardImg).toHaveAttribute(
			"src",
			new RegExp(`^${siteBase}/images/posts/`),
		);
		const cardLoaded = await cardImg.evaluate(
			(img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
		);
		expect(cardLoaded).toBe(true);

		await page.goto(withBase("/posts/如何进行科学上网/"), {
			waitUntil: "networkidle",
		});
		const bodyImgs = page.locator(".markdown-content img");
		await expect(bodyImgs.first()).toBeVisible();
		await expect(bodyImgs.first()).toHaveAttribute(
			"src",
			new RegExp(`^${siteBase}/images/posts/`),
		);
		const bodyLoaded = await bodyImgs
			.first()
			.evaluate(
				(img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
			);
		expect(bodyLoaded).toBe(true);
	});

	test("supports bold, font size, font color, and cursor image placement/resize in moment composer", async ({
		page,
	}) => {
		await mockGitHubApi(page);
		await page.addInitScript((session) => {
			localStorage.setItem("shirone-admin-session", JSON.stringify(session));
		}, MOCK_SESSION);

		await page.goto(withBase("/admin/?tab=moments"), {
			waitUntil: "domcontentloaded",
		});

		const textarea = page.locator(".rich-editor__textarea");
		await expect(textarea).toBeVisible();

		await page.getByRole("button", { name: "加粗" }).click();
		await expect(textarea).toHaveValue(/\*\*加粗文字\*\*/);

		await page.getByLabel("字号").selectOption("20px");
		await expect(textarea).toHaveValue(/font-size: 20px/);

		await page.getByRole("button", { name: "字体颜色" }).click();
		await page.getByRole("button", { name: "珊瑚红" }).click();
		await expect(textarea).toHaveValue(/color: #e11d48/);

		// Insert an external image at cursor and resize it
		await page.getByRole("button", { name: "外链图片" }).click();
		await page
			.getByPlaceholder("图片 URL (https://...)")
			.fill("https://example.com/demo-shot.webp");
		await page.getByRole("button", { name: "插入正文" }).click();

		await expect(textarea).toHaveValue(
			/https:\/\/example\.com\/demo-shot\.webp/,
		);
		const widthSlider = page.getByLabel("第 1 张图片宽度");
		await expect(widthSlider).toBeVisible();
		await widthSlider.fill("45");
		await widthSlider.dispatchEvent("input");
		await expect(textarea).toHaveValue(/w-45%/);

		await page
			.locator(".rich-editor__preview img")
			.waitFor({ state: "attached" });
		await expect(page.locator(".rich-editor__preview img")).toHaveAttribute(
			"style",
			/width:\s*45%/,
		);
	});

	test("renders interactive likes, views, Umami stats, and lazy per-moment Waline comments for visitors", async ({
		page,
	}) => {
		const articlePosts: unknown[] = [];
		await page.route("https://serene-waline.vercel.app/**", async (route) => {
			const url = new URL(route.request().url());
			if (url.pathname.startsWith("/api/article")) {
				if (route.request().method() === "POST") {
					const payload = route.request().postDataJSON();
					articlePosts.push(payload);
					return route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({
							errno: 0,
							errmsg: "",
							data: [{ time: 7, reaction0: 3 }],
						}),
					});
				}
				const paths = (url.searchParams.get("path") ?? "")
					.split(",")
					.filter(Boolean);
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						errno: 0,
						errmsg: "",
						data: paths.map(() => ({ time: 6, reaction0: 2 })),
					}),
				});
			}
			if (url.pathname.startsWith("/api/comment")) {
				const type = url.searchParams.get("type");
				if (type === "count") {
					const paths = (url.searchParams.get("url") ?? "")
						.split(",")
						.filter(Boolean);
					return route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify({
							errno: 0,
							errmsg: "",
							data: paths.map(() => 1),
						}),
					});
				}
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						errno: 0,
						errmsg: "",
						data: { count: 1, page: 1, pageSize: 10, totalPages: 1, data: [] },
					}),
				});
			}
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ errno: 0, data: [] }),
			});
		});

		await page.route("https://cdn.jsdelivr.net/**", async (route) => {
			const reqUrl = route.request().url();
			if (reqUrl.endsWith(".css")) {
				return route.fulfill({
					status: 200,
					contentType: "text/css",
					body: ".wl-panel { display: block; }",
				});
			}
			return route.fulfill({
				status: 200,
				contentType: "application/javascript",
				body: `
					window.Waline = {
						init({ el, path }) {
							const host = typeof el === "string" ? document.querySelector(el) : el;
							if (!host) return () => {};
							host.innerHTML = '<div class="wl-mock" data-path="' + path + '">Mock Waline for ' + path + '</div>';
							return () => { host.innerHTML = ''; };
						}
					};
				`,
			});
		});

		await page.route("https://cloud.umami.is/**", async (route) => {
			const reqUrl = route.request().url();
			if (reqUrl.endsWith("script.js")) {
				return route.fulfill({
					status: 200,
					contentType: "application/javascript",
					body: "window.__umamiScriptLoaded = true;",
				});
			}
			if (reqUrl.includes("/api/share/")) {
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						websiteId: "c0a020a1-34fe-4e89-8434-f929ed5eb053",
						token: "mock-share-token",
					}),
				});
			}
			if (reqUrl.includes("/stats")) {
				return route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify({
						pageviews: 42,
						visitors: 18,
						visits: 24,
					}),
				});
			}
			return route.fulfill({ status: 204, body: "" });
		});

		await page.goto(withBase("/moments/"), { waitUntil: "domcontentloaded" });
		await expect(
			page.locator("[data-shirone-umami-pageviews]").first(),
		).toHaveText("42");

		const firstCard = page.locator(".moment-card").first();
		const likeBtn = firstCard.getByRole("button", { name: /Like|赞/ });
		await expect(likeBtn).toContainText("2");
		await likeBtn.click();
		await expect(likeBtn).toContainText("3");
		expect(
			articlePosts.some(
				(item) => (item as { type?: string }).type === "reaction0",
			),
		).toBe(true);

		const commentToggle = firstCard.getByRole("button", {
			name: /Comments|评论/,
		});
		await commentToggle.click();
		await expect(firstCard.locator("shirone-waline .wl-mock")).toBeVisible();
		await expect(page.locator("shirone-waline")).toHaveCount(1);

		// Homepage post preview cards directly show views, comments, and interactive likes
		await page.goto(withBase("/"), { waitUntil: "domcontentloaded" });
		const previewStats = page.locator("[data-post-card-stats]").first();
		await expect(previewStats).toBeVisible();
		await expect(previewStats.locator("[data-stat-views]")).toHaveText("6");
		await expect(previewStats.locator("[data-stat-comments]")).toHaveText("1");
		const previewLikeBtn = previewStats.locator("[data-stat-like-btn]");
		await expect(previewLikeBtn).toContainText("2");
		await previewLikeBtn.click();
		await expect(previewLikeBtn).toContainText("3");
		await expect(previewLikeBtn).toHaveAttribute("aria-pressed", "true");

		await page.goto(withBase("/posts/如何进行科学上网/"), {
			waitUntil: "domcontentloaded",
		});
		await expect(page.locator("[data-content-interactions]")).toHaveCount(1);
		await expect(page.locator("shirone-waline")).toHaveCount(1);
	});
});
