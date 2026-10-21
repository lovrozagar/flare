import { isServer } from "@solidjs/web"

type Body<A extends unknown[], R> = (...args: A) => R

// After one side: calling throws until the other side is set. Setting the same side again throws.
export type IsomorphicHalf<A extends unknown[], R, Next extends "server" | "client"> = (() => never) &
	Record<Next, (fn: Body<A, R>) => Body<A, R>>

export type IsomorphicStart = {
	server: <A extends unknown[], R>(fn: Body<A, R>) => IsomorphicHalf<A, R, "client">
	client: <A extends unknown[], R>(fn: Body<A, R>) => IsomorphicHalf<A, R, "server">
}

// Both sides are required, in either order, as one expression. The rewrite drops the side the graph does not
// run, so the result is the side that is left. Untransformed, both are present and the build decides (dx/env.md).
export function createIsomorphicFn(): IsomorphicStart {
	return {
		server: <A extends unknown[], R>(server?: Body<A, R>) =>
			Object.assign(needsBoth(), {
				client: (client?: Body<A, R>) => pickSide(isServer, server, client),
				server: twice("server"),
			}),
		client: <A extends unknown[], R>(client?: Body<A, R>) =>
			Object.assign(needsBoth(), {
				server: (server?: Body<A, R>) => pickSide(isServer, server, client),
				client: twice("client"),
			}),
	}
}

// The side the graph kept. With both present, untransformed, `onServer` picks one.
export function pickSide<A extends unknown[], R>(
	onServer: boolean,
	server?: Body<A, R>,
	client?: Body<A, R>,
): Body<A, R> {
	if (server !== undefined && client !== undefined) return onServer ? server : client
	return server ?? client ?? noBody
}

// The runtime's own words, which only this module holds: a chunk that still has them kept the runtime, which the
// rewrite leaves in no graph, so a call escaped it (vite/boundary/tripwire.ts, BUGS.md 461).
export const ISOMORPHIC_RUNTIME = "createIsomorphicFn needs both .server() and .client()"

function needsBoth(): () => never {
	return () => {
		throw new Error(ISOMORPHIC_RUNTIME)
	}
}

function twice(side: string): () => never {
	return () => {
		throw new Error(`createIsomorphicFn: .${side}() twice`)
	}
}

function noBody(): never {
	throw new Error("createIsomorphicFn has no body for this side")
}
