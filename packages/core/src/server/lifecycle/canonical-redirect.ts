import { canonicalPath, type CanonicalOptions } from "../../shared/url/canonical.ts";

export type PathRewrite = (path: string) => string | undefined;

export type CanonicalStep = { status: number; location?: string };

export function applyCanonical(input: {
	url: string;
	trailingSlash?: CanonicalOptions["trailingSlash"];
	caseSensitive?: boolean;
	rewrite?: PathRewrite;
}): CanonicalStep {
	const parsed = new URL(input.url, "http://localhost");
	const options = { trailingSlash: input.trailingSlash, caseSensitive: input.caseSensitive };
	let path = (canonicalPath(parsed.pathname, options) as { path: string }).path;
	if (input.rewrite) {
		const next = input.rewrite(path);
		if (typeof next === "string") path = (canonicalPath(next, options) as { path: string }).path;
	}
	if (path === parsed.pathname) return { status: 200 };
	return { status: 301, location: `${path}${parsed.search}` };
}
