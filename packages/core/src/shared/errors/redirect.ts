import type { FlareRegister, RouteTarget, To } from "../route-builder/register.ts"

const STATUSES = [301, 302, 303, 307, 308]

export type RedirectStatus = 301 | 302 | 303 | 307 | 308

// A page id with that route's params and search, or an absolute `href` alone (dx/types.md).
export type RedirectTo<R extends FlareRegister, Id extends To<R>> =
	| (RouteTarget<R, Id> & { status?: RedirectStatus | undefined; href?: never })
	| {
			href: string
			status?: RedirectStatus | undefined
			replace?: boolean | undefined
			to?: never
			params?: never
			search?: never
			hash?: never
	  }

// What the throw carries. `params` and `search` are the validator output (dx/link.md URL values).
export type RedirectTarget = {
	to?: string | undefined
	href?: string | undefined
	status?: number | undefined
	replace?: boolean | undefined
	params?: object | undefined
	search?: object | undefined
	hash?: string | undefined
}

export class RedirectError extends Error {
	readonly status: number
	readonly replace: boolean
	readonly to: string | undefined
	readonly href: string | undefined
	readonly params: object | undefined
	readonly search: object | undefined
	readonly hash: string | undefined

	// The whole target travels with the throw, so the server can build Location from it.
	constructor(target: RedirectTarget & { status: number; replace: boolean }) {
		super("redirect")
		this.name = "RedirectError"
		this.status = target.status
		this.replace = target.replace
		this.to = target.to
		this.href = target.href
		this.params = target.params
		this.search = target.search
		this.hash = target.hash
	}
}

export function redirect<Id extends To<FlareRegister>>(target: RedirectTo<FlareRegister, Id>): never
export function redirect(target: RedirectTarget): never {
	if (target.href !== undefined) assertHref(target, target.href)
	else if (target.to === undefined) throw new Error("to")
	// 303 for every caller (B71): a GET lands the same as on 307, and anything else follows with a GET, not its body.
	const status = target.status ?? 303
	if (!STATUSES.includes(status)) throw new Error(String(status))
	throw new RedirectError({
		...target,
		status,
		replace: target.replace ?? true,
	})
}

function assertHref(target: RedirectTarget, href: string): void {
	if (target.to !== undefined || target.params !== undefined || target.search !== undefined) throw new Error("href")
	// `http://` or `https://` in any case, as the URL standard reads a scheme, and a host to go to (BUGS.md 402).
	if (!/^https?:\/\//i.test(href) || !hasHost(href)) throw new Error("href")
	// A control character, a CR or LF from the request say, cannot be a Location header (BUGS.md 168).
	if ([...href].some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)) throw new Error("href")
}

// `URL.canParse` is above the browser floor, so a parse that throws is the answer.
function hasHost(href: string): boolean {
	try {
		return new URL(href).hostname !== ""
	} catch {
		return false
	}
}
