import { KIND_PARAM, withoutInternalKeys } from "../../shared/protocol/index.ts";
import type { Match, Router } from "../../shared/router/create-router.ts";
import { buildUrl, type Location, type SearchValue } from "../../shared/url/index.ts";
import { isHashOnly } from "./scroll.ts";

export type NavigateInput = {
	to: string;
	params?: Record<string, string | readonly string[] | undefined> | undefined;
	search?: Record<string, SearchValue> | undefined;
	hash?: string | undefined;
	shallow?: boolean | undefined;
};

export type TargetContext = { router: Router; origin: string; current: Location };

// A document load, a hash-only move, or a data navigation. `url` is what the address bar shows. `dataUrl` is
// what the client fetches: no hash, and `_flare=data` (02-system step 2).
export type Target =
	| { kind: "document"; url: string }
	| { kind: "hash"; url: string; location: Location }
	| { kind: "data"; url: string; dataUrl: string; location: Location; route?: string | undefined; match: Match };

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function resolveTarget(input: NavigateInput, context: TargetContext): Target {
	if (SCHEME.test(input.to) || input.to.startsWith("//"))
		throw new Error(`navigate: to is a route id, not a URL: ${input.to}`);
	const built = buildUrl({
		to: input.to,
		params: input.params,
		search: withoutInternalKeys(input.search),
		hash: input.hash,
	});
	const location = rewrite(locationOf(new URL(built, context.origin)), context);
	if (input.shallow === true && location.pathname !== context.current.pathname) {
		throw new Error("navigate: a shallow navigation keeps the pathname");
	}
	return fromLocation(location, context);
}

// A URL the server built, such as an `x` frame's `u`. It is not rewritten again. Another origin throws.
export function resolveUrl(href: string, context: TargetContext): Target {
	const url = new URL(href, context.origin);
	if (url.origin !== context.origin) throw new Error("navigate: the URL is not on this origin");
	return fromLocation(locationOf(url), context);
}

function fromLocation(location: Location, context: TargetContext): Target {
	const url = `${location.pathname}${location.search}${location.hash}`;
	const match = context.router.match(location.pathname);
	if (match.response === true || rootOf(match) !== rootOf(context.router.match(context.current.pathname))) {
		return { kind: "document", url };
	}
	if (isHashOnly(context.current, location)) return { kind: "hash", url, location };
	const query = location.search === "" ? "?" : `${location.search}&`;
	const dataUrl = `${location.pathname}${query}${KIND_PARAM}=data`;
	return { kind: "data", url, dataUrl, location, route: match.id, match };
}

function locationOf(url: URL): Location {
	return { pathname: url.pathname, search: url.search, hash: url.hash };
}

// The client rewrite sees and returns { pathname, search, hash }. A result off this origin throws, and a throw
// fails the navigation before anything is written (dx/router.md).
function rewrite(location: Location, context: TargetContext): Location {
	const next = context.router.rewrite?.(location);
	if (next === undefined) return location;
	const url = new URL(`${next.pathname}${next.search}${next.hash}`, context.origin);
	if (url.origin !== context.origin) throw new Error("rewrite: the result is not on this origin");
	return locationOf(url);
}

// A target in another root layout is a document load: the root is the document (02-system).
function rootOf(match: Match): string | undefined {
	return match.chain[0]?.id;
}
