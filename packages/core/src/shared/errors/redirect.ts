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
	readonly replace: boolean;
	readonly to: string | undefined;
	readonly href: string | undefined;

	constructor(target: { status: number; replace: boolean; to?: string; href?: string }) {
		super("redirect");
		this.name = "RedirectError";
		this.status = target.status;
		this.replace = target.replace;
		this.to = target.to;
		this.href = target.href;
	}
}

export function redirect(target: RedirectTarget): never {
	if (target.href !== undefined) assertHref(target, target.href);
	else if (target.to === undefined) throw new Error("to");
	const status = target.status ?? 307;
	if (!STATUSES.includes(status)) throw new Error(String(status));
	throw new RedirectError({
		status,
		replace: target.replace ?? true,
		to: target.to,
		href: target.href,
	});
}

function assertHref(target: RedirectTarget, href: string): void {
	if (target.to !== undefined || target.params !== undefined || target.search !== undefined) throw new Error("href");
	if (!href.startsWith("https://") && !href.startsWith("http://")) throw new Error("href");
}
