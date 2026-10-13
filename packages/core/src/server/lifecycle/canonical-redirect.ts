import { fnPrefix } from "../../shared/protocol/index.ts";
import { canonicalPath, type CanonicalOptions, type CanonicalPath } from "../../shared/url/canonical.ts";

export type PathRewrite = (path: string) => string | undefined;

export type CanonicalStep = { status: number; location?: string };

// A redirect keeps a GET or HEAD as 301. Every other method is 308, so the method and body survive (B22). A
// server-function path skips the trailing-slash and case rules, so its POST is never redirected. A hostile one is
// still 400.
export function applyCanonical(input: {
	method: string;
	url: string;
	// The router's base, which the server-function prefix sits under. "/" when omitted.
	basePath?: string;
	trailingSlash?: CanonicalOptions["trailingSlash"];
	caseSensitive?: boolean;
	rewrite?: PathRewrite;
	// The router's case fold toward the matched route, which runs when `caseSensitive` is false (B22).
	fold?: (path: string) => string;
}): CanonicalStep {
	const parsed = new URL(input.url, "http://localhost");
	const fn = parsed.pathname.startsWith(fnPrefix(input.basePath ?? "/"));
	const options = { trailingSlash: fn ? ("preserve" as const) : input.trailingSlash };
	const first = readPath(canonicalPath(parsed.pathname, options));
	if (first === undefined) return { status: 400 };
	let path = first;
	if (input.rewrite) {
		const next = input.rewrite(path);
		if (typeof next === "string") {
			const rewritten = readPath(canonicalPath(next, options));
			if (rewritten === undefined) return { status: 400 };
			path = rewritten;
		}
	}
	if (!fn && input.caseSensitive !== true && input.fold !== undefined) path = input.fold(path);
	if (path === parsed.pathname) return { status: 200 };
	const status = input.method === "GET" || input.method === "HEAD" ? 301 : 308;
	return { status, location: `${path}${parsed.search}` };
}

function readPath(result: CanonicalPath): string | undefined {
	return "path" in result ? result.path : undefined;
}
