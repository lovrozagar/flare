import type { FlareRegister, RouteTarget, To } from "../route-builder/register.ts";

const STATUSES = [301, 302, 303, 307, 308];

export type RedirectStatus = 301 | 302 | 303 | 307 | 308;

// A page id with that route's params and search, or an absolute `href` alone (dx/types.md).
export type RedirectTo<R extends FlareRegister, Id extends To<R>> =
	| (RouteTarget<R, Id> & { status?: RedirectStatus | undefined; href?: never })
	| {
			href: string;
			status?: RedirectStatus | undefined;
			replace?: boolean | undefined;
			to?: never;
			params?: never;
			search?: never;
			hash?: never;
	  };

// What the throw carries. `params` and `search` are the validator output (dx/link.md URL values).
export type RedirectTarget = {
	to?: string | undefined;
	href?: string | undefined;
	status?: number | undefined;
	replace?: boolean | undefined;
	params?: object | undefined;
	search?: object | undefined;
	hash?: string | undefined;
};

export class RedirectError extends Error {
	readonly status: number;
	// True when the thrower gave no status. A server function then answers 303, and a document keeps 307.
	readonly defaulted: boolean;
	readonly replace: boolean;
	readonly to: string | undefined;
	readonly href: string | undefined;
	readonly params: object | undefined;
	readonly search: object | undefined;
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

export function redirect<Id extends To<FlareRegister>>(target: RedirectTo<FlareRegister, Id>): never;
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
