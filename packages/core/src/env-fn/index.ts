/// <reference types="vite/client" />

/* ── createServerOnlyFn ─────────────────────────────────────────────── */

/**
 * Marks a function as server-only. On client builds, the Vite plugin
 * replaces the implementation with a throwing stub and tree-shakes
 * any server-only imports the function body references.
 *
 * Runtime fallback (tests, no plugin): uses `import.meta.env.SSR`.
 */
export function createServerOnlyFn<TArgs extends unknown[], TReturn>(
	fn: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
	if (import.meta.env.SSR) return fn;
	return (..._args: TArgs): never => {
		throw new Error("Server-only function called on client");
	};
}

/* ── createClientOnlyFn ─────────────────────────────────────────────── */

/**
 * Marks a function as client-only. On SSR builds, the Vite plugin
 * replaces the implementation with a throwing stub and tree-shakes
 * any client-only imports the function body references.
 *
 * Runtime fallback (tests, no plugin): uses `import.meta.env.SSR`.
 */
export function createClientOnlyFn<TArgs extends unknown[], TReturn>(
	fn: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
	if (!import.meta.env.SSR) return fn;
	return (..._args: TArgs): never => {
		throw new Error("Client-only function called on server");
	};
}

/* ── createIsomorphicFn ─────────────────────────────────────────────── */

/**
 * Creates a function with different implementations per environment.
 * The Vite plugin extracts the env-specific implementation at build time,
 * eliminating the unused branch and its imports from the bundle.
 *
 * ```ts
 * const getUser = createIsomorphicFn()
 *   .server(() => db.getUser(cookies()))
 *   .client(() => JSON.parse(localStorage.getItem("user")!))
 * ```
 *
 * Runtime fallback (tests, no plugin): uses `import.meta.env.SSR`.
 */

export type IsomorphicFn<TArgs extends unknown[] = [], TServer = undefined, TClient = undefined> = (
	...args: TArgs
) => TClient | TServer;

export interface ServerBoundFn<TArgs extends unknown[], TServer> extends IsomorphicFn<TArgs, TServer> {
	client: <TClient>(clientImpl: (...args: TArgs) => TClient) => IsomorphicFn<TArgs, TServer, TClient>;
}

export interface ClientBoundFn<TArgs extends unknown[], TClient> extends IsomorphicFn<TArgs, undefined, TClient> {
	server: <TServer>(serverImpl: (...args: TArgs) => TServer) => IsomorphicFn<TArgs, TServer, TClient>;
}

export interface IsomorphicFnBuilder {
	client: <TArgs extends unknown[], TClient>(clientImpl: (...args: TArgs) => TClient) => ClientBoundFn<TArgs, TClient>;
	server: <TArgs extends unknown[], TServer>(serverImpl: (...args: TArgs) => TServer) => ServerBoundFn<TArgs, TServer>;
}

function buildIsomorphic<TArgs extends unknown[], TServer, TClient>(
	serverImpl: ((...args: TArgs) => TServer) | null,
	clientImpl: ((...args: TArgs) => TClient) | null,
): IsomorphicFn<TArgs, TServer, TClient> {
	return ((...args: TArgs) => {
		if (import.meta.env.SSR) return serverImpl ? serverImpl(...args) : undefined;
		return clientImpl ? clientImpl(...args) : undefined;
	}) as IsomorphicFn<TArgs, TServer, TClient>;
}

export function createIsomorphicFn(): IsomorphicFnBuilder {
	return {
		client<TArgs extends unknown[], TClient>(clientImpl: (...args: TArgs) => TClient) {
			const fn = buildIsomorphic<TArgs, undefined, TClient>(null, clientImpl);
			return Object.assign(fn, {
				server<TServer>(serverImpl: (...args: TArgs) => TServer) {
					return buildIsomorphic<TArgs, TServer, TClient>(serverImpl, clientImpl);
				},
			}) as ClientBoundFn<TArgs, TClient>;
		},
		server<TArgs extends unknown[], TServer>(serverImpl: (...args: TArgs) => TServer) {
			const fn = buildIsomorphic<TArgs, TServer, undefined>(serverImpl, null);
			return Object.assign(fn, {
				client<TClient>(clientImpl: (...args: TArgs) => TClient) {
					return buildIsomorphic<TArgs, TServer, TClient>(serverImpl, clientImpl);
				},
			}) as ServerBoundFn<TArgs, TServer>;
		},
	};
}
