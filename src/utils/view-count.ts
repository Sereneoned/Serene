/**
 * Chooses the authoritative post view count between live Umami pageviews and
 * Waline's fallback `time` counter, never discarding non-zero Waline counts
 * if Umami is unavailable or returns a zero fallback.
 */
export function resolvePostViewCount(
	umamiStats: { readonly pageviews: number } | null | undefined,
	walineViews: number,
): number {
	const safeWaline =
		Number.isFinite(walineViews) && walineViews >= 0
			? Math.floor(walineViews)
			: 0;
	if (!umamiStats || !Number.isFinite(umamiStats.pageviews)) {
		return safeWaline;
	}
	const safeUmami = Math.max(0, Math.floor(umamiStats.pageviews));
	return safeUmami > 0 || safeWaline === 0 ? safeUmami : safeWaline;
}
