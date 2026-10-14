// The channel between the query feature and core. The app's `createQueryClientGetter()` registers one stateless getter
// per process under a registry symbol, so a built server and the source share it. Core reads it for a loader's
// `ctx.queryClient` and for the document state's `queries`, and never imports TanStack (dx/features.md Query).
export const QUERY_GETTER: unique symbol = Symbol.for("flare.query");

// The getter returns this request's client on the server and the document's on the client. `dehydrate` gives the
// request's cache for the document state, or undefined when the request made no client. `hydrated` is the client
// boot's signal that the hydration mount is over (B102).
export type QueryGetter = (() => unknown) & { dehydrate: () => unknown; hydrated?: () => void };

export function registeredQuery(): QueryGetter | undefined {
	const value: unknown = Reflect.get(globalThis, QUERY_GETTER);
	return isGetter(value) ? value : undefined;
}

// The first registration wins. A later one gets the registered getter back, so two modules never disagree.
export function registerQuery<G extends QueryGetter>(getter: G): QueryGetter {
	const existing = registeredQuery();
	if (existing !== undefined) return existing;
	Reflect.set(globalThis, QUERY_GETTER, getter);
	return getter;
}

function isGetter(value: unknown): value is QueryGetter {
	return typeof value === "function" && typeof Reflect.get(value, "dehydrate") === "function";
}
