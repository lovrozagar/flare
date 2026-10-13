import { defined } from "../../shared/errors/index.ts";
import type { PreloaderContext, RouteHeaders, RouteSecurity } from "../../shared/route-builder/chain.ts";
import type { SecurityConfig } from "../../shared/route-builder/types.ts";
import { mergeHeaders } from "../security/apply.ts";
import type { Settled } from "./cascade.ts";

type View = { params: unknown; search: unknown; loaderData: unknown; preloaderContext: PreloaderContext };

// The part of a validated match the steps read.
export type StepRoute = {
	id: string;
	params: unknown;
	search: unknown;
	headers?: ((ctx: View) => RouteHeaders) | undefined;
	security?: RouteSecurity | undefined;
};

export type StepsInput = {
	routes: readonly StepRoute[];
	skip?: ReadonlySet<string> | undefined;
	outcomes: readonly { settled: Settled }[];
	contexts: readonly PreloaderContext[];
	bugs: unknown[];
};

// Each match whose loader resolved writes its `.headers()` and `.security()`, root to page (dx/builder.md). A match
// whose loader threw writes neither, though a later match may, and a throw omits that match's step alone (B82).
// An object `.security()` is static, so the first failed match writes its own too, and the failure's answer carries
// the route's set (BUGS.md B13). A function config reads the loader's data, so it waits for its own loader.
// Headers merge with `set-cookie` appending. Security merges outside-in: a set key replaces, and `false` removes.
export function routeSteps(input: StepsInput): {
	headers: Record<string, string | string[]>;
	security: SecurityConfig;
} {
	let headers: Record<string, string | string[]> = {};
	let security: SecurityConfig = {};
	const step = (run: () => void): void => {
		try {
			run();
		} catch (error) {
			input.bugs.push(error);
		}
	};
	const failure = input.outcomes.findIndex((outcome) => !outcome.settled.ok);
	for (const [index, outcome] of input.outcomes.entries()) {
		const route = defined(input.routes[index], "the loaded match");
		if (input.skip?.has(route.id) === true) continue;
		const { headers: own, security: policy } = route;
		if (!outcome.settled.ok) {
			if (index === failure && typeof policy === "object") security = { ...security, ...policy };
			continue;
		}
		const preloaderContext = defined(input.contexts[index], "the loaded context");
		const view = { params: route.params, search: route.search, loaderData: outcome.settled.data, preloaderContext };
		if (own !== undefined) step(() => (headers = mergeHeaders(headers, own(view))));
		if (policy !== undefined)
			step(() => (security = { ...security, ...(typeof policy === "function" ? policy(view) : policy) }));
	}
	return { headers, security };
}
