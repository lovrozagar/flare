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

function needsBoth(): () => never {
	return () => {
		throw new Error("createIsomorphicFn needs both .server() and .client()")
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
