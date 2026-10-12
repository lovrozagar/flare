// `origin` is the one the adapter resolved. `sameSite` is createServer's host allow-list. `identity` is a function
// with `authenticate` or `authorize`, which turns off the fail-open (B44).
export type CsrfInput = {
	method: "get" | "post";
	headers: Headers;
	origin: string;
	sameSite: readonly string[];
	identity: boolean;
};

// The first present header wins, in order Origin, Sec-Fetch-Site, Referer. A present header that fails is 403, and
// the later ones are not consulted (B44). A same-site request passes only for a listed host, read from Origin or,
// when Sec-Fetch-Site decides, from Referer.
export function checkCsrf(input: CsrfInput): 200 | 403 {
	const origin = input.headers.get("origin");
	if (origin !== null) return allowed(origin, input) ? 200 : 403;
	const site = input.headers.get("sec-fetch-site");
	if (site !== null) return siteAllowed(site, input) ? 200 : 403;
	const referer = input.headers.get("referer");
	if (referer !== null) return allowed(referer, input) ? 200 : 403;
	return input.identity ? 403 : 200;
}

function siteAllowed(site: string, input: CsrfInput): boolean {
	if (site === "same-origin") return true;
	if (site === "none") return input.method === "get";
	if (site !== "same-site") return false;
	const referer = input.headers.get("referer");
	return referer !== null && listed(referer, input.sameSite);
}

// The sender's own origin, or a host on the same-site list.
function allowed(url: string, input: CsrfInput): boolean {
	return originOf(url) === input.origin || listed(url, input.sameSite);
}

function listed(url: string, sameSite: readonly string[]): boolean {
	return URL.canParse(url) && sameSite.includes(new URL(url).hostname);
}

function originOf(url: string): string | undefined {
	return URL.canParse(url) ? new URL(url).origin : undefined;
}
