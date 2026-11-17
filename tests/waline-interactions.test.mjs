import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	commentConfig,
	resolveCommentOptions,
} from "../src/config/commentConfig.ts";
import {
	buildMomentInteractionPath,
	fetchWalineBatchCounters,
	parseWalineArticleCounters,
	parseWalineCommentCounts,
	recordWalineViewOnce,
	resolveWalineLang,
	toggleWalineLike,
	toWalineInteractionOptions,
} from "../src/utils/waline-interactions.ts";

function makeStorage() {
	const store = new Map();
	return {
		getItem: (k) => (store.has(k) ? store.get(k) : null),
		setItem: (k, v) => store.set(k, String(v)),
		removeItem: (k) => store.delete(k),
	};
}

describe("Waline per-item interaction helpers", () => {
	it("resolves language codes and interaction options safely", () => {
		assert.equal(resolveWalineLang("zh_CN", "auto"), "zh-CN");
		assert.equal(resolveWalineLang("ja", "auto"), "jp");
		assert.equal(resolveWalineLang("en", "auto"), "en");
		assert.equal(resolveWalineLang("en", "zh-TW"), "zh-TW");

		assert.equal(toWalineInteractionOptions(null, "en"), null);
		const giscus = resolveCommentOptions({
			...commentConfig,
			enable: true,
			provider: "giscus",
			giscus: {
				...commentConfig.giscus,
				repo: "a/b",
				repoId: "r",
				categoryId: "c",
			},
		});
		assert.equal(toWalineInteractionOptions(giscus, "zh_CN"), null);

		const waline = resolveCommentOptions({
			...commentConfig,
			enable: true,
			provider: "waline",
			waline: {
				...commentConfig.waline,
				serverURL: "https://waline.example.com",
			},
		});
		const out = toWalineInteractionOptions(waline, "zh_CN");
		assert.equal(out?.serverURL, "https://waline.example.com");
		assert.equal(out?.defaultLanguage, "zh_CN");
	});

	it("builds canonical subpath-safe moment paths", () => {
		assert.equal(
			buildMomentInteractionPath("2026-11-17-first", "/"),
			"/moments/2026-11-17-first/",
		);
		assert.equal(
			buildMomentInteractionPath("/2026-11-17-first/", "/Serene/"),
			"/Serene/moments/2026-11-17-first/",
		);
	});

	it("parses Waline article and comment counters from arrays, objects, and scalars", () => {
		const paths = ["/Serene/moments/a/", "/Serene/moments/b/"];
		const articles = parseWalineArticleCounters(
			{
				errno: 0,
				data: [
					{ path: "/Serene/moments/b/", time: 19, reaction0: 5 },
					{ path: "/Serene/moments/a/", time: 7, reaction0: 2 },
				],
			},
			paths,
		);
		assert.deepEqual(articles.get(paths[0]), { views: 7, likes: 2 });
		assert.deepEqual(articles.get(paths[1]), { views: 19, likes: 5 });

		const counts = parseWalineCommentCounts({ errno: 0, data: [3, 0] }, paths);
		assert.equal(counts.get(paths[0]), 3);
		assert.equal(counts.get(paths[1]), 0);

		const singleCount = parseWalineCommentCounts(4, ["/Serene/moments/a/"]);
		assert.equal(singleCount.get("/Serene/moments/a/"), 4);
	});

	it("batches fetches, dedupes session views, and toggles likes cleanly", async () => {
		const originalFetch = globalThis.fetch;
		const originalWindow = globalThis.window;
		const calls = [];
		const localStorage = makeStorage();
		const sessionStorage = makeStorage();
		globalThis.window = { localStorage, sessionStorage };
		globalThis.fetch = async (url, init) => {
			calls.push({
				url: String(url),
				method: init?.method || "GET",
				body: init?.body,
			});
			const u = String(url);
			if (
				u.includes("/api/article") &&
				(!init?.method || init.method === "GET")
			) {
				return new Response(
					JSON.stringify({
						errno: 0,
						data: [{ path: "/Serene/moments/m1/", time: 12, reaction0: 4 }],
					}),
					{ status: 200 },
				);
			}
			if (u.includes("/api/comment")) {
				return new Response(JSON.stringify({ errno: 0, data: [2] }), {
					status: 200,
				});
			}
			if (u.includes("/api/article") && init?.method === "POST") {
				const body = JSON.parse(String(init.body));
				if (body.type === "time") {
					return new Response(JSON.stringify({ data: [{ time: 13 }] }), {
						status: 200,
					});
				}
				return new Response(
					JSON.stringify({
						data: [{ reaction0: body.action === "inc" ? 5 : 4 }],
					}),
					{ status: 200 },
				);
			}
			return new Response("{}", { status: 404 });
		};

		try {
			const batch = await fetchWalineBatchCounters(
				"https://waline.example.com/",
				["/Serene/moments/m1/"],
			);
			assert.equal(calls.length, 2);
			assert.deepEqual(batch.get("/Serene/moments/m1/"), {
				views: 12,
				likes: 4,
				comments: 2,
			});

			const v1 = await recordWalineViewOnce(
				"https://waline.example.com",
				"/Serene/moments/m1/",
			);
			const v2 = await recordWalineViewOnce(
				"https://waline.example.com",
				"/Serene/moments/m1/",
			);
			assert.equal(v1, 13);
			assert.equal(v2, null);

			const likeRes = await toggleWalineLike(
				"https://waline.example.com",
				"/Serene/moments/m1/",
				false,
			);
			assert.deepEqual(likeRes, { liked: true, likes: 5 });

			const unlikeRes = await toggleWalineLike(
				"https://waline.example.com",
				"/Serene/moments/m1/",
				true,
			);
			assert.deepEqual(unlikeRes, { liked: false, likes: 4 });
		} finally {
			globalThis.fetch = originalFetch;
			globalThis.window = originalWindow;
		}
	});
});
