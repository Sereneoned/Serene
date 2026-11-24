export { resolvePostViewCount } from "./view-count.ts";

const DEFAULT_CLIENT_WAIT_TIMEOUT_MS = 4_000;

/** Returns true when Umami runtime assets or root containers are active on the page. */
export function isUmamiRuntimeEnabled(): boolean {
	if (typeof window === "undefined" || typeof document === "undefined") {
		return false;
	}
	return Boolean(
		window.oddmisc ||
			document.querySelector(
				"style[data-shirone-umami-runtime], [data-shirone-umami]",
			),
	);
}

/** Clears per-page Umami promise memoization before a Swup transition begins. */
export function resetUmamiStatsPromises(): void {
	if (typeof window === "undefined") return;
	window.__shironeUmamiStatsPromises = {};
}

/** Resolves `window.oddmisc` immediately if available or awaits `oddmisc-ready`. */
export function waitForUmamiClient(
	signal?: AbortSignal,
	timeoutMs = DEFAULT_CLIENT_WAIT_TIMEOUT_MS,
): Promise<OddmiscBrowserClient | null> {
	if (typeof window === "undefined" || signal?.aborted) {
		return Promise.resolve(null);
	}
	if (window.oddmisc) {
		return Promise.resolve(window.oddmisc);
	}
	if (!isUmamiRuntimeEnabled()) {
		return Promise.resolve(null);
	}

	return new Promise((resolve) => {
		let settled = false;
		let timerId: number | undefined;

		const finish = (client: OddmiscBrowserClient | null) => {
			if (settled) return;
			settled = true;
			window.removeEventListener("oddmisc-ready", onReady);
			signal?.removeEventListener("abort", onAbort);
			if (timerId !== undefined) window.clearTimeout(timerId);
			resolve(client);
		};

		const onReady = () => {
			finish(window.oddmisc ?? null);
		};

		const onAbort = () => {
			finish(null);
		};

		window.addEventListener("oddmisc-ready", onReady);
		signal?.addEventListener("abort", onAbort, { once: true });
		timerId = window.setTimeout(() => {
			finish(window.oddmisc ?? null);
		}, timeoutMs);
	});
}

/**
 * Fetches live Umami page stats up to `Date.now()`, deduplicating concurrent
 * requests for the same path within the current page view.
 */
export async function fetchUmamiPageStats(
	path: string,
	signal?: AbortSignal,
): Promise<OddmiscStatsResult | null> {
	const cleanPath = path.trim();
	if (!cleanPath || signal?.aborted) return null;

	const client = await waitForUmamiClient(signal);
	if (!client || signal?.aborted) return null;

	if (!window.__shironeUmamiStatsPromises) {
		window.__shironeUmamiStatsPromises = {};
	}
	const promises = window.__shironeUmamiStatsPromises;
	const key = `page:${cleanPath}`;
	let request = promises[key];

	if (!request) {
		request = client
			.getPageStats(cleanPath, { endAt: Date.now() })
			.then(async (stats) => {
				if (
					(stats.pageviews || 0) === 0 &&
					(stats.visits || 0) === 0 &&
					stats._fromCache
				) {
					client.clearCache();
					return await client.getPageStats(cleanPath, { endAt: Date.now() });
				}
				return stats;
			})
			.catch((error) => {
				if (promises[key] === request) {
					delete promises[key];
				}
				throw error;
			});
		promises[key] = request;
	}

	try {
		return await request;
	} catch {
		return null;
	}
}
