import type { ChainAuth } from "../../shared/route-builder/chain.ts";

export type AuthRoute = {
	id: string;
	auth?: ChainAuth;
	authorize?: unknown;
};

export type CallerEntry = {
	route: string;
	args: readonly string[];
};

export type Caller = {
	callerData: readonly string[];
	callerChain: readonly CallerEntry[];
};

// callerData is the leaf's own arguments. callerChain is every route that called authenticate, root down.
export function resolveCaller<T>(routes: readonly AuthRoute[], app: (caller: Caller) => T): T {
	const callerChain = routes.flatMap((route) =>
		route.auth === undefined ? [] : [{ route: route.id, args: route.auth.callerData }],
	);
	const callerData = routes.at(-1)?.auth?.callerData ?? [];
	return app({ callerData, callerChain });
}

// A server function that calls authenticate(): no arguments, and its export name is the one route (dx/server.md).
export function fnCaller(name: string): Caller {
	return { callerData: [], callerChain: [{ route: name, args: [] }] };
}
