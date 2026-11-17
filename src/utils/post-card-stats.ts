import {
	fetchWalineBatchCounters,
	hasLikedWalinePath,
	toggleWalineLike,
} from "./waline-interactions";

let activeAbortController: AbortController | null = null;

function setMetricMeta(
	wrapper: Element | null,
	counterEl: Element | null,
	count: number,
	labelPrefix?: string,
) {
	const safe = String(Math.max(0, count));
	if (counterEl) counterEl.textContent = safe;
	if (wrapper && labelPrefix) {
		wrapper.setAttribute("aria-label", `${labelPrefix}: ${safe}`);
		wrapper.setAttribute("title", `${labelPrefix}: ${safe}`);
	}
}

function syncLikeButtonState(
	button: HTMLButtonElement,
	liked: boolean,
	likes: number,
) {
	button.setAttribute("aria-pressed", String(liked));
	const baseLabel = button.dataset.statBaseLabel || "Like";
	const likedLabel = button.dataset.statLikedLabel || "Liked";
	const text = liked ? likedLabel : baseLabel;
	const likesEl = button.querySelector("[data-stat-likes]");
	if (likesEl) likesEl.textContent = String(Math.max(0, likes));
	button.setAttribute("aria-label", `${text}: ${Math.max(0, likes)}`);
	button.setAttribute("title", `${text}: ${Math.max(0, likes)}`);
}

/**
 * Hydrates preview PostCard stats (views, comments, likes) in a single batched
 * request per Waline server URL, and wires direct like-button toggling.
 */
export function bindPostCardStats(root: ParentNode = document): void {
	if (typeof window === "undefined") return;

	const containers = Array.from(
		root.querySelectorAll<HTMLElement>("[data-post-card-stats]"),
	);
	if (containers.length === 0) return;

	activeAbortController?.abort();
	const controller = new AbortController();
	activeAbortController = controller;

	const byServer = new Map<string, HTMLElement[]>();

	for (const container of containers) {
		const serverURL = container.dataset.serverUrl?.trim() ?? "";
		const path = container.dataset.statPath?.trim() ?? "";
		if (!serverURL || !path) continue;

		const list = byServer.get(serverURL) ?? [];
		list.push(container);
		byServer.set(serverURL, list);

		const likeBtn = container.querySelector<HTMLButtonElement>(
			"[data-stat-like-btn]",
		);
		if (likeBtn) {
			const initialLikes = Number.parseInt(
				likeBtn.querySelector("[data-stat-likes]")?.textContent ?? "0",
				10,
			);
			syncLikeButtonState(
				likeBtn,
				hasLikedWalinePath(path),
				Number.isFinite(initialLikes) ? initialLikes : 0,
			);

			if (!likeBtn.dataset.statBound) {
				likeBtn.dataset.statBound = "1";
				likeBtn.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					if (likeBtn.disabled) return;

					const currentlyLiked =
						likeBtn.getAttribute("aria-pressed") === "true";
					const likesEl = likeBtn.querySelector("[data-stat-likes]");
					const currentLikes = Number.parseInt(likesEl?.textContent ?? "0", 10);
					const safePrev = Number.isFinite(currentLikes) ? currentLikes : 0;
					const optimisticLikes = Math.max(
						0,
						safePrev + (currentlyLiked ? -1 : 1),
					);

					container.dataset.statLocalLike = "1";
					syncLikeButtonState(likeBtn, !currentlyLiked, optimisticLikes);
					likeBtn.disabled = true;

					void toggleWalineLike(serverURL, path, currentlyLiked)
						.then((res) => {
							const nextLikes = res.likes ?? optimisticLikes;
							syncLikeButtonState(likeBtn, res.liked, nextLikes);
						})
						.catch(() => {
							syncLikeButtonState(likeBtn, currentlyLiked, safePrev);
						})
						.finally(() => {
							likeBtn.disabled = false;
						});
				});
			}
		}
	}

	for (const [serverURL, group] of byServer.entries()) {
		const uniquePaths = Array.from(
			new Set(
				group.map((el) => el.dataset.statPath?.trim() ?? "").filter(Boolean),
			),
		);
		if (uniquePaths.length === 0) continue;

		void fetchWalineBatchCounters(serverURL, uniquePaths, controller.signal)
			.then((map) => {
				if (controller.signal.aborted) return;
				for (const container of group) {
					if (!container.isConnected) continue;
					const path = container.dataset.statPath?.trim() ?? "";
					const stats = map.get(path);
					if (!stats) continue;

					const viewsEl = container.querySelector("[data-stat-views]");
					if (viewsEl) {
						const viewsWrapper = viewsEl.parentElement;
						const label =
							viewsWrapper?.getAttribute("data-stat-label") ?? undefined;
						setMetricMeta(viewsWrapper, viewsEl, stats.views, label);
					}

					const commentsEl = container.querySelector("[data-stat-comments]");
					if (commentsEl) {
						const commentsWrapper = commentsEl.parentElement;
						const label =
							commentsWrapper?.getAttribute("data-stat-label") ?? undefined;
						setMetricMeta(commentsWrapper, commentsEl, stats.comments, label);
					}

					const likeBtn = container.querySelector<HTMLButtonElement>(
						"[data-stat-like-btn]",
					);
					if (likeBtn && container.dataset.statLocalLike !== "1") {
						syncLikeButtonState(likeBtn, hasLikedWalinePath(path), stats.likes);
					}
				}
			})
			.catch(() => {
				// Leave fallback zeros when network or aborted navigation occurs.
			});
	}
}
