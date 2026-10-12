import type { RedirectError } from "../../shared/errors/redirect.ts";
import { canonicalPath, type CanonicalOptions } from "../../shared/url/canonical.ts";
import { buildUrl } from "../../shared/url/index.ts";

// A thrown redirect() on a document. `href` is used as written. A route id is built by buildUrl and placed
// under the router's basePath (B73).
export function redirectLocation(error: RedirectError, basePath: string): string {
	const to = error.to;
	// redirect() throws with exactly one of `to` and `href`.
	if (to === undefined) return `${error.href}`;
	const url = buildUrl({ to, params: error.params, search: error.search, hash: error.hash });
	return basePath === "/" ? url : `${basePath}${url}`;
}

export type CanonicalRedirect = {
	status: number;
	path?: string;
	location?: string;
	method?: string;
};

export function canonicalRedirect(input: {
	method: string;
	path: string;
	trailingSlash?: CanonicalOptions["trailingSlash"];
}): CanonicalRedirect {
	const canonical = canonicalPath(input.path, { trailingSlash: input.trailingSlash ?? "preserve" });
	if ("hostile" in canonical) return { status: 400 };
	if (canonical.path === input.path) return { status: 200, path: canonical.path };
	const status = input.method === "GET" || input.method === "HEAD" ? 301 : 308;
	return { status, location: canonical.path, method: input.method };
}
