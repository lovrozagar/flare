const STATUSES = [301, 302, 303, 307, 308];

export type RedirectTarget = {
	to?: string;
	href?: string;
	status?: number;
	replace?: boolean;
	params?: Record<string, string>;
	search?: Record<string, string>;
	hash?: string;
};

export class RedirectError extends Error {
	readonly status: number;
	// True when the thrower gave no status. A server function then answers 303, and a document keeps 307.
	readonly defaulted: boolean;
	readonly replace: boolean;
	readonly to: string | undefined;
	readonly href: string | undefined;
	readonly params: Record<string, string> | undefined;
	readonly search: Record<string, string> | undefined;
	readonly hash: string | undefined;

	// The whole target travels with the throw, so the server can build Location from it.
	constructor(target: RedirectTarget & { status: number; replace: boolean; defaulted: boolean }) {
		super("redirect");
		this.name = "RedirectError";
		this.status = target.status;
		this.defaulted = target.defaulted;
		this.replace = target.replace;
		this.to = target.to;
		this.href = target.href;
		this.params = target.params;
		this.search = target.search;
		this.hash = target.hash;
	}
}

export function redirect(target: RedirectTarget): never {
	if (target.href !== undefined) assertHref(target, target.href);
	else if (target.to === undefined) throw new Error("to");
	const status = target.status ?? 307;
	if (!STATUSES.includes(status)) throw new Error(String(status));
	throw new RedirectError({
		...target,
		status,
		replace: target.replace ?? true,
		defaulted: target.status === undefined,
	});
}

function assertHref(target: RedirectTarget, href: string): void {
	if (target.to !== undefined || target.params !== undefined || target.search !== undefined) throw new Error("href");
	if (!href.startsWith("https://") && !href.startsWith("http://")) throw new Error("href");
}
