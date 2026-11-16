import type { RepoFileChange } from "./github-client";

export interface StagedBatchItem {
	readonly id: string;
	readonly label: string;
	readonly changes: readonly RepoFileChange[];
	readonly createdAt: string;
}

export const ADMIN_STAGING_EVENT = "shirone:admin-staging-change";

const stagedQueue: StagedBatchItem[] = [];

function notify(): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(
		new CustomEvent<readonly StagedBatchItem[]>(ADMIN_STAGING_EVENT, {
			detail: [...stagedQueue],
		}),
	);
}

export function getStagedQueue(): readonly StagedBatchItem[] {
	return [...stagedQueue];
}

export function enqueueStagedBatch(
	label: string,
	changes: readonly RepoFileChange[],
): void {
	stagedQueue.push({
		id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
		label,
		changes,
		createdAt: new Date().toISOString(),
	});
	notify();
}

export function removeStagedBatch(id: string): void {
	const idx = stagedQueue.findIndex((item) => item.id === id);
	if (idx >= 0) {
		stagedQueue.splice(idx, 1);
		notify();
	}
}

export function clearStagedQueue(): void {
	stagedQueue.length = 0;
	notify();
}

export function flattenStagedChanges(): RepoFileChange[] {
	return stagedQueue.flatMap((item) => item.changes);
}

export function onStagedQueueChange(
	callback: (items: readonly StagedBatchItem[]) => void,
): () => void {
	if (typeof window === "undefined") return () => {};
	const listener = () => callback(getStagedQueue());
	window.addEventListener(ADMIN_STAGING_EVENT, listener);
	return () => window.removeEventListener(ADMIN_STAGING_EVENT, listener);
}
