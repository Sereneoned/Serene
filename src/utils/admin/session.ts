/**
 * Browser-side Admin session persistence and event synchronization.
 * Stores GitHub repo target and PAT locally on the owner's device only;
 * nothing sensitive is ever written into the repository or emitted in SSR HTML.
 */

export interface AdminUserInfo {
	readonly login: string;
	readonly name: string;
	readonly avatarUrl: string;
}

export interface AdminSession {
	readonly owner: string;
	readonly repo: string;
	readonly branch: string;
	readonly contentPrefix: string;
	readonly token: string;
	readonly user: AdminUserInfo;
	readonly remember: boolean;
	readonly verifiedAt: string;
}

export const ADMIN_SESSION_STORAGE_KEY = "shirone-admin-session";
export const ADMIN_SESSION_EVENT = "shirone:admin-session-change";
export const ADMIN_OPEN_LOGIN_EVENT = "shirone:admin-open-login";

const memoryFallback: { value: AdminSession | null } = { value: null };

function safeParseSession(raw: string | null): AdminSession | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<AdminSession>;
		if (
			typeof parsed.owner === "string" &&
			typeof parsed.repo === "string" &&
			typeof parsed.branch === "string" &&
			typeof parsed.token === "string" &&
			parsed.owner.trim() &&
			parsed.repo.trim() &&
			parsed.token.trim() &&
			parsed.user &&
			typeof parsed.user.login === "string"
		) {
			return {
				owner: parsed.owner.trim(),
				repo: parsed.repo.trim(),
				branch: parsed.branch.trim() || "main",
				contentPrefix:
					typeof parsed.contentPrefix === "string"
						? parsed.contentPrefix.replace(/^\/+|\/+$/g, "")
						: "",
				token: parsed.token.trim(),
				user: {
					login: parsed.user.login,
					name: parsed.user.name || parsed.user.login,
					avatarUrl: parsed.user.avatarUrl || "",
				},
				remember: Boolean(parsed.remember),
				verifiedAt: parsed.verifiedAt || new Date().toISOString(),
			};
		}
		return null;
	} catch {
		return null;
	}
}

export function getAdminSession(): AdminSession | null {
	if (typeof window === "undefined") return null;
	try {
		const fromSession = safeParseSession(
			window.sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY),
		);
		if (fromSession) return fromSession;
		const fromLocal = safeParseSession(
			window.localStorage.getItem(ADMIN_SESSION_STORAGE_KEY),
		);
		if (fromLocal) return fromLocal;
	} catch {
		return memoryFallback.value;
	}
	return memoryFallback.value;
}

export function isAdminLoggedIn(): boolean {
	return getAdminSession() !== null;
}

export function setAdminSession(session: AdminSession): void {
	memoryFallback.value = session;
	if (typeof window === "undefined") return;
	const serialized = JSON.stringify(session);
	try {
		if (session.remember) {
			window.localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, serialized);
			window.sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
		} else {
			window.sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, serialized);
			window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
		}
	} catch {
		// Fall back to in-memory session when storage is blocked.
	}
	window.dispatchEvent(
		new CustomEvent<AdminSession | null>(ADMIN_SESSION_EVENT, {
			detail: session,
		}),
	);
}

export function clearAdminSession(): void {
	memoryFallback.value = null;
	if (typeof window === "undefined") return;
	try {
		window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
		window.sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
	} catch {
		// Ignore storage clear errors.
	}
	window.dispatchEvent(
		new CustomEvent<AdminSession | null>(ADMIN_SESSION_EVENT, {
			detail: null,
		}),
	);
}

export function onAdminSessionChange(
	callback: (session: AdminSession | null) => void,
): () => void {
	if (typeof window === "undefined") return () => {};
	const handler = (event: Event) => {
		const detail = (event as CustomEvent<AdminSession | null>).detail;
		callback(detail ?? getAdminSession());
	};
	const storageHandler = (event: StorageEvent) => {
		if (event.key === ADMIN_SESSION_STORAGE_KEY) {
			callback(getAdminSession());
		}
	};
	window.addEventListener(ADMIN_SESSION_EVENT, handler);
	window.addEventListener("storage", storageHandler);
	return () => {
		window.removeEventListener(ADMIN_SESSION_EVENT, handler);
		window.removeEventListener("storage", storageHandler);
	};
}

export function requestAdminLoginDialog(): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent(ADMIN_OPEN_LOGIN_EVENT));
}

export function resolveRepoPath(
	session: Pick<AdminSession, "contentPrefix">,
	repoRelativePath: string,
): string {
	const clean = repoRelativePath.replace(/^\/+/, "");
	if (!session.contentPrefix) return clean;
	return `${session.contentPrefix}/${clean}`;
}

export function inferGitHubRepoSuggestion(
	configuredRepo?: string,
	githubLinkUrl?: string,
): string {
	if (configuredRepo?.includes("/")) return configuredRepo.trim();
	if (typeof window !== "undefined") {
		const { hostname, pathname } = window.location;
		if (hostname.endsWith(".github.io")) {
			const owner = hostname.replace(/\.github\.io$/i, "");
			const firstSegment = pathname.split("/").filter(Boolean)[0];
			if (owner && firstSegment) {
				return `${owner}/${firstSegment}`;
			}
			if (owner) {
				return `${owner}/${owner}.github.io`;
			}
		}
	}
	if (githubLinkUrl) {
		const match = githubLinkUrl.match(
			/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+)/i,
		);
		if (match) {
			return `${match[1]}/${match[2].replace(/\.git$/i, "")}`;
		}
	}
	return "";
}
