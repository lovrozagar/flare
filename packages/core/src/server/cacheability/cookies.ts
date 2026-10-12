import type { Decision } from "./decide.ts";

// The Set-Cookie values the route set through `.headers()`, and every value on the final response.
export type SetCookies = { route: readonly string[]; all: readonly string[] };

// A shared answer that sets a cookie is private: the cookie would reach every visitor of the CDN copy.
// `allowCookies` keeps the route's own cookies with a shared body, and a cookie the route did not set, such as one
// a middleware added after the page stage, downgrades anyway (dx/cache.md "How the decision is made").
export function withCookies(decision: Decision, cookies: SetCookies): Decision {
	if (decision.policy !== "shared") return decision;
	const own = [...cookies.route];
	const foreign = cookies.all.filter((value) => {
		const at = own.indexOf(value);
		if (at === -1) return true;
		own.splice(at, 1);
		return false;
	});
	const routeSets = cookies.route.length > 0 && decision.cdn.allowCookies !== true;
	return foreign.length > 0 || routeSets ? { policy: "private", cdn: decision.cdn } : decision;
}
