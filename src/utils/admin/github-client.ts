import type { AdminSession, AdminUserInfo } from "./session";
import { resolveRepoPath } from "./session";

const GITHUB_API_BASE = "https://api.github.com";

export type RepoFileChange =
	| {
			readonly path: string;
			readonly action: "upsert";
			readonly content: string | Uint8Array;
	  }
	| {
			readonly path: string;
			readonly action: "delete";
	  };

export interface RepoDirectoryEntry {
	readonly name: string;
	readonly path: string;
	readonly type: "file" | "dir" | "symlink" | "submodule";
	readonly size: number;
	readonly sha: string;
}

export interface WorkflowRunInfo {
	readonly id: number;
	readonly name: string;
	readonly status: string;
	readonly conclusion: string | null;
	readonly htmlUrl: string;
	readonly headSha: string;
	readonly headMessage: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface CommitProgress {
	readonly phase: "preparing" | "uploading" | "committing" | "done";
	readonly completed: number;
	readonly total: number;
	readonly currentPath?: string;
}

export class GitHubApiError extends Error {
	readonly status: number;
	readonly endpoint: string;

	constructor(message: string, status: number, endpoint: string) {
		super(message);
		this.name = "GitHubApiError";
		this.status = status;
		this.endpoint = endpoint;
	}
}

export function encodeUtf8ToBase64(text: string): string {
	const bytes = new TextEncoder().encode(text);
	return encodeBytesToBase64(bytes);
}

export function encodeBytesToBase64(bytes: Uint8Array): string {
	const CHUNK_SIZE = 0x8000;
	const parts: string[] = [];
	for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
		const slice = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
		parts.push(String.fromCharCode(...slice));
	}
	return btoa(parts.join(""));
}

export function decodeBase64ToUtf8(base64: string): string {
	const cleaned = base64.replace(/\s+/g, "");
	const binary = atob(cleaned);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new TextDecoder("utf-8").decode(bytes);
}

function encodeRepoPath(repoPath: string): string {
	return repoPath
		.split("/")
		.filter(Boolean)
		.map((segment) => encodeURIComponent(segment))
		.join("/");
}

async function githubRequest<T>(
	token: string,
	endpoint: string,
	init: RequestInit = {},
): Promise<T> {
	const url = endpoint.startsWith("http")
		? endpoint
		: `${GITHUB_API_BASE}${endpoint}`;
	const headers = new Headers(init.headers);
	headers.set("Accept", "application/vnd.github+json");
	headers.set("Authorization", `Bearer ${token}`);
	headers.set("X-GitHub-Api-Version", "2022-11-28");
	if (init.body && !headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}

	const response = await fetch(url, { ...init, headers });
	if (!response.ok) {
		let detail = response.statusText;
		try {
			const payload = (await response.json()) as { message?: string };
			if (payload?.message) detail = payload.message;
		} catch {
			// Non-JSON error body; keep statusText.
		}
		if (response.status === 401) {
			throw new GitHubApiError(
				`GitHub Token 无效或已过期 (${detail})`,
				401,
				endpoint,
			);
		}
		if (response.status === 403) {
			throw new GitHubApiError(
				`权限不足或触发速率限制：${detail}`,
				403,
				endpoint,
			);
		}
		if (response.status === 404) {
			throw new GitHubApiError(
				`目标仓库、分支或文件不存在：${detail}`,
				404,
				endpoint,
			);
		}
		throw new GitHubApiError(
			`GitHub API 错误 (${response.status}): ${detail}`,
			response.status,
			endpoint,
		);
	}

	if (response.status === 204) {
		return undefined as T;
	}
	return (await response.json()) as T;
}

export async function verifyGitHubSession(params: {
	token: string;
	owner: string;
	repo: string;
	branch: string;
}): Promise<{ user: AdminUserInfo; defaultBranch: string }> {
	const token = params.token.trim();
	const owner = params.owner.trim();
	const repo = params.repo.trim();
	const branch = params.branch.trim() || "main";

	const userPayload = await githubRequest<{
		login: string;
		name?: string | null;
		avatar_url?: string;
	}>(token, "/user");

	const repoPayload = await githubRequest<{
		default_branch?: string;
		permissions?: { push?: boolean; admin?: boolean; maintain?: boolean };
	}>(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);

	const perms = repoPayload.permissions;
	if (perms && !perms.push && !perms.admin && !perms.maintain) {
		throw new GitHubApiError(
			`账号 ${userPayload.login} 对 ${owner}/${repo} 没有写入权限 (push)`,
			403,
			`/repos/${owner}/${repo}`,
		);
	}

	await githubRequest<{ name: string }>(
		token,
		`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`,
	);

	return {
		user: {
			login: userPayload.login,
			name: userPayload.name || userPayload.login,
			avatarUrl: userPayload.avatar_url || "",
		},
		defaultBranch: repoPayload.default_branch || branch,
	};
}

export async function readRepoTextFile(
	session: AdminSession,
	relativePath: string,
): Promise<{ content: string; sha: string } | null> {
	const fullPath = resolveRepoPath(session, relativePath);
	const encoded = encodeRepoPath(fullPath);
	const endpoint = `/repos/${encodeURIComponent(session.owner)}/${encodeURIComponent(session.repo)}/contents/${encoded}?ref=${encodeURIComponent(session.branch)}`;
	try {
		const payload = await githubRequest<{
			type?: string;
			content?: string;
			encoding?: string;
			sha?: string;
			download_url?: string | null;
		}>(session.token, endpoint);
		if (payload.type !== "file" || !payload.sha) return null;
		if (payload.content && payload.encoding === "base64") {
			return {
				content: decodeBase64ToUtf8(payload.content),
				sha: payload.sha,
			};
		}
		if (payload.download_url) {
			const rawRes = await fetch(payload.download_url);
			if (!rawRes.ok) return null;
			return { content: await rawRes.text(), sha: payload.sha };
		}
		return null;
	} catch (error) {
		if (error instanceof GitHubApiError && error.status === 404) {
			return null;
		}
		throw error;
	}
}

export async function listRepoDirectory(
	session: AdminSession,
	relativeDir: string,
): Promise<RepoDirectoryEntry[]> {
	const fullPath = resolveRepoPath(session, relativeDir);
	const encoded = encodeRepoPath(fullPath);
	const endpoint = `/repos/${encodeURIComponent(session.owner)}/${encodeURIComponent(session.repo)}/contents/${encoded}?ref=${encodeURIComponent(session.branch)}`;
	try {
		const payload = await githubRequest<
			Array<{
				name: string;
				path: string;
				type: "file" | "dir" | "symlink" | "submodule";
				size: number;
				sha: string;
			}>
		>(session.token, endpoint);
		if (!Array.isArray(payload)) return [];
		return payload.map((item) => ({
			name: item.name,
			path: item.path,
			type: item.type,
			size: item.size,
			sha: item.sha,
		}));
	} catch (error) {
		if (error instanceof GitHubApiError && error.status === 404) {
			return [];
		}
		throw error;
	}
}

export async function commitRepoChanges(
	session: AdminSession,
	message: string,
	changes: readonly RepoFileChange[],
	onProgress?: (progress: CommitProgress) => void,
): Promise<{ commitSha: string; htmlUrl: string }> {
	if (changes.length === 0) {
		throw new Error("没有可提交的更改");
	}

	const repoPrefix = `/repos/${encodeURIComponent(session.owner)}/${encodeURIComponent(session.repo)}`;
	const normalizedMap = new Map<string, RepoFileChange>();
	for (const change of changes) {
		const resolved = resolveRepoPath(session, change.path);
		normalizedMap.set(resolved, { ...change, path: resolved });
	}
	const uniqueChanges = [...normalizedMap.values()];
	const upserts = uniqueChanges.filter(
		(c): c is Extract<RepoFileChange, { action: "upsert" }> =>
			c.action === "upsert",
	);

	onProgress?.({
		phase: "preparing",
		completed: 0,
		total: upserts.length,
	});

	const refPayload = await githubRequest<{ object: { sha: string } }>(
		session.token,
		`${repoPrefix}/git/ref/heads/${encodeURIComponent(session.branch)}`,
	);
	const parentCommitSha = refPayload.object.sha;

	const parentCommit = await githubRequest<{ tree: { sha: string } }>(
		session.token,
		`${repoPrefix}/git/commits/${parentCommitSha}`,
	);
	const baseTreeSha = parentCommit.tree.sha;

	const treeEntries: Array<{
		path: string;
		mode: "100644";
		type: "blob";
		sha: string | null;
	}> = [];

	let completed = 0;
	for (const change of uniqueChanges) {
		if (change.action === "delete") {
			treeEntries.push({
				path: change.path,
				mode: "100644",
				type: "blob",
				sha: null,
			});
			continue;
		}

		onProgress?.({
			phase: "uploading",
			completed,
			total: upserts.length,
			currentPath: change.path,
		});

		const base64 =
			typeof change.content === "string"
				? encodeUtf8ToBase64(change.content)
				: encodeBytesToBase64(change.content);

		const blob = await githubRequest<{ sha: string }>(
			session.token,
			`${repoPrefix}/git/blobs`,
			{
				method: "POST",
				body: JSON.stringify({
					content: base64,
					encoding: "base64",
				}),
			},
		);

		treeEntries.push({
			path: change.path,
			mode: "100644",
			type: "blob",
			sha: blob.sha,
		});
		completed += 1;
	}

	onProgress?.({
		phase: "committing",
		completed: upserts.length,
		total: upserts.length,
	});

	const tree = await githubRequest<{ sha: string }>(
		session.token,
		`${repoPrefix}/git/trees`,
		{
			method: "POST",
			body: JSON.stringify({
				base_tree: baseTreeSha,
				tree: treeEntries,
			}),
		},
	);

	const commit = await githubRequest<{ sha: string; html_url?: string }>(
		session.token,
		`${repoPrefix}/git/commits`,
		{
			method: "POST",
			body: JSON.stringify({
				message: message.trim() || "chore(admin): update site content",
				tree: tree.sha,
				parents: [parentCommitSha],
			}),
		},
	);

	await githubRequest(
		session.token,
		`${repoPrefix}/git/refs/heads/${encodeURIComponent(session.branch)}`,
		{
			method: "PATCH",
			body: JSON.stringify({
				sha: commit.sha,
				force: false,
			}),
		},
	);

	onProgress?.({
		phase: "done",
		completed: upserts.length,
		total: upserts.length,
	});

	return {
		commitSha: commit.sha,
		htmlUrl:
			commit.html_url ||
			`https://github.com/${session.owner}/${session.repo}/commit/${commit.sha}`,
	};
}

export async function listWorkflowRuns(
	session: AdminSession,
	limit = 6,
): Promise<WorkflowRunInfo[]> {
	const repoPrefix = `/repos/${encodeURIComponent(session.owner)}/${encodeURIComponent(session.repo)}`;
	type RunsResponse = {
		workflow_runs?: Array<{
			id: number;
			name?: string;
			status?: string;
			conclusion?: string | null;
			html_url?: string;
			head_sha?: string;
			head_commit?: { message?: string };
			created_at?: string;
			updated_at?: string;
		}>;
	};
	let payload: RunsResponse;
	try {
		payload = await githubRequest<RunsResponse>(
			session.token,
			`${repoPrefix}/actions/workflows/pages.yml/runs?per_page=${limit}`,
		);
	} catch (error) {
		if (error instanceof GitHubApiError && error.status === 404) {
			payload = await githubRequest<RunsResponse>(
				session.token,
				`${repoPrefix}/actions/runs?per_page=${limit}`,
			);
		} else {
			throw error;
		}
	}

	return (payload.workflow_runs ?? []).map((run) => ({
		id: run.id,
		name: run.name || "Workflow",
		status: run.status || "unknown",
		conclusion: run.conclusion ?? null,
		htmlUrl: run.html_url || "",
		headSha: (run.head_sha || "").slice(0, 7),
		headMessage: (run.head_commit?.message || "").split("\n")[0] || "",
		createdAt: run.created_at || "",
		updatedAt: run.updated_at || "",
	}));
}

export async function triggerWorkflowDispatch(
	session: AdminSession,
	workflowFile = "pages.yml",
): Promise<void> {
	const repoPrefix = `/repos/${encodeURIComponent(session.owner)}/${encodeURIComponent(session.repo)}`;
	await githubRequest(
		session.token,
		`${repoPrefix}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`,
		{
			method: "POST",
			body: JSON.stringify({ ref: session.branch }),
		},
	);
}
