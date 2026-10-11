import { canonicalPath, type CanonicalOptions } from "../../shared/url/canonical.ts";

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
