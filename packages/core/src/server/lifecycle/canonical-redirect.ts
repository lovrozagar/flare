import { canonicalPath, type CanonicalOptions, type CanonicalPath } from "../../shared/url/canonical.ts";

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
	if (path === parsed.pathname) return { status: 200 };
	return { status: 301, location: `${path}${parsed.search}` };
}

function readPath(result: CanonicalPath): string | undefined {
	return "path" in result ? result.path : undefined;
}
