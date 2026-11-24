import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bindPostCardStats } from "../src/utils/post-card-stats.ts";
import {
	fetchUmamiPageStats,
	isUmamiRuntimeEnabled,
	resetUmamiStatsPromises,
	resolvePostViewCount,
	waitForUmamiClient,
} from "../src/utils/umami-stats.ts";

function makeStorage() {
	const store = new Map();
	return {
		getItem: (k) => (store.has(k) ? store.get(k) : null),
		setItem: (k, v) => store.set(k, String(v)),
		removeItem: (k) => store.delete(k),
	};
}

function makeFakePostCard({ path, serverUrl = "https://waline.example.com" }) {
	const attrs = new Map();
	const viewsAttrs = new Map();
	const commentsAttrs = new Map();
	const viewsEl = {
		textContent: "0",
		parentElement: {
			getAttribute: (name) =>
				name === "data-stat-label" ? "Views" : (viewsAttrs.get(name) ?? null),
			setAttribute: (name, value) => viewsAttrs.set(name, String(value)),
			_attrs: viewsAttrs,
		},
	};
	const commentsEl = {
		textContent: "0",
		parentElement: {
			getAttribute: (name) =>
				name === "data-stat-label"
					? "Comments"
					: (commentsAttrs.get(name) ?? null),
			setAttribute: (name, value) => commentsAttrs.set(name, String(value)),
			_attrs: commentsAttrs,
		},
	};
	const container = {
		isConnected: true,
		dataset: {
			statPath: path,
			serverUrl,
		},
		getAttribute: (name) => attrs.get(name) ?? null,
		setAttribute: (name, value) => attrs.set(name, String(value)),
		querySelector: (sel) => {
			if (sel === "[data-stat-views]") return viewsEl;
			if (sel === "[data-stat-comments]") return commentsEl;
			return null;
		},
		_viewsEl: viewsEl,
		_commentsEl: commentsEl,
	};
	return container;
}

describe("Umami stats & PostCard view sync", () => {
	it("resolvePostViewCount prefers live Umami pageviews with safe Waline fallback", () => {
		assert.equal(resolvePostViewCount({ pageviews: 25 }, 2), 25);
		assert.equal(resolvePostViewCount(null, 6), 6);
		assert.equal(resolvePostViewCount(undefined, 6), 6);
		assert.equal(resolvePostViewCount({ pageviews: 0 }, 6), 6);
		assert.equal(resolvePostViewCount({ pageviews: 0 }, 0), 0);
	});

	it("passes fresh endAt timestamps, deduplicates in-page lookups, and clears failed requests", async () => {
		const originalWindow = globalThis.window;
		const originalDocument = globalThis.document;
		let callCount = 0;
		const seenOptions = [];
		let shouldFail = true;

		globalThis.document = {
			querySelector: () => null,
		};
		globalThis.window = {
			oddmisc: {
				getSiteStats: async () => ({ pageviews: 0, visitors: 0, visits: 0 }),
				getPageStats: async (_path, options) => {
					callCount += 1;
					seenOptions.push(options);
					if (shouldFail) {
						shouldFail = false;
						throw new Error("temporary network error");
					}
					return { pageviews: 19, visitors: 2, visits: 6 };
				},
				clearCache: () => {},
			},
		};

		try {
			assert.equal(isUmamiRuntimeEnabled(), true);
			const client = await waitForUmamiClient();
			assert.ok(client);

			const first = await fetchUmamiPageStats("/Serene/posts/a/");
			assert.equal(first, null);

			const before = Date.now();
			const [a, b] = await Promise.all([
				fetchUmamiPageStats("/Serene/posts/a/"),
				fetchUmamiPageStats("/Serene/posts/a/"),
			]);
			assert.equal(a?.pageviews, 19);
			assert.equal(b?.pageviews, 19);
			assert.equal(callCount, 2);
			assert.ok(typeof seenOptions[1]?.endAt === "number");
			assert.ok(seenOptions[1].endAt >= before);

			resetUmamiStatsPromises();
			const afterReset = await fetchUmamiPageStats("/Serene/posts/a/");
			assert.equal(afterReset?.pageviews, 19);
			assert.equal(callCount, 3);
		} finally {
			globalThis.window = originalWindow;
			globalThis.document = originalDocument;
		}
	});

	it("syncs PostCard views to Umami regardless of Waline vs Umami response order", async () => {
		const originalWindow = globalThis.window;
		const originalDocument = globalThis.document;
		const originalFetch = globalThis.fetch;

		const cardFastWaline = makeFakePostCard({ path: "/Serene/posts/one/" });
		const cardFastUmami = makeFakePostCard({ path: "/Serene/posts/two/" });
		const cardFallback = makeFakePostCard({ path: "/Serene/posts/three/" });

		let resolveSlowWaline;
		const slowWalinePromise = new Promise((r) => {
			resolveSlowWaline = r;
		});
		let resolveSlowUmami;
		const slowUmamiPromise = new Promise((r) => {
			resolveSlowUmami = r;
		});

		const listeners = new Map();
		globalThis.document = {
			querySelector: () => ({}),
		};
		globalThis.window = {
			localStorage: makeStorage(),
			sessionStorage: makeStorage(),
			addEventListener: (ev, fn) => listeners.set(ev, fn),
			removeEventListener: (ev) => listeners.delete(ev),
			setTimeout: globalThis.setTimeout,
			clearTimeout: globalThis.clearTimeout,
			oddmisc: {
				getSiteStats: async () => ({
					pageviews: 100,
					visitors: 10,
					visits: 20,
				}),
				getPageStats: async (path) => {
					if (path === "/Serene/posts/one/") {
						return await slowUmamiPromise;
					}
					if (path === "/Serene/posts/two/") {
						return { pageviews: 25, visitors: 7, visits: 9 };
					}
					throw new Error("umami error");
				},
				clearCache: () => {},
			},
		};

		globalThis.fetch = async (url) => {
			const u = String(url);
			if (u.includes("/api/article")) {
				await slowWalinePromise;
				return new Response(
					JSON.stringify({
						errno: 0,
						data: [
							{ path: "/Serene/posts/one/", time: 2, reaction0: 1 },
							{ path: "/Serene/posts/two/", time: 1, reaction0: 0 },
							{ path: "/Serene/posts/three/", time: 6, reaction0: 3 },
						],
					}),
					{ status: 200 },
				);
			}
			return new Response(JSON.stringify({ errno: 0, data: [1, 0, 2] }), {
				status: 200,
			});
		};

		try {
			const fakeRoot = {
				querySelectorAll: () => [cardFastWaline, cardFastUmami, cardFallback],
			};
			bindPostCardStats(fakeRoot);

			// Card two resolves fast via Umami before Waline finishes
			await new Promise((r) => setTimeout(r, 15));
			assert.equal(cardFastUmami._viewsEl.textContent, "25");
			// Card one waits on slow Umami (doesn't flash 2 prematurely)
			assert.equal(cardFastWaline._viewsEl.textContent, "0");

			// Waline settles first for card one & three (with Umami already failing on three)
			resolveSlowWaline();
			await new Promise((r) => setTimeout(r, 20));
			assert.equal(cardFastUmami._viewsEl.textContent, "25");
			assert.equal(cardFallback._viewsEl.textContent, "6");
			assert.equal(cardFastWaline._commentsEl.textContent, "1");

			// Slow Umami resolves for card one: overrides Waline 2 -> Umami 31
			resolveSlowUmami({ pageviews: 31, visitors: 8, visits: 12 });
			await new Promise((r) => setTimeout(r, 15));
			assert.equal(cardFastWaline._viewsEl.textContent, "31");
		} finally {
			globalThis.window = originalWindow;
			globalThis.document = originalDocument;
			globalThis.fetch = originalFetch;
		}
	});
});
