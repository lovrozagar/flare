export type AuthRoute = {
	route: string;
	authenticate?: readonly string[];
	authorize?: true;
};

export type CallerEntry = {
	route: string;
	args: readonly string[];
};

export type Caller = {
	callerData: readonly string[];
	callerChain: readonly CallerEntry[];
};

export function resolveCaller(routes: readonly AuthRoute[], app: (caller: Caller) => void): Caller {
	const callerChain: CallerEntry[] = [];
	let callerData: readonly string[] = [];
	let index = 0;
	for (const route of routes) {
		if (route.authenticate !== undefined) callerChain.push({ route: route.route, args: route.authenticate });
		if (index === routes.length - 1) callerData = route.authenticate ?? [];
		index += 1;
	}
	const caller = { callerData, callerChain };
	app(caller);
	return caller;
}
