import type { Router } from "../../shared/router/create-router.ts"
import type { ServerFnCall } from "../../shared/server-fn/builder.ts"
import { invalidation } from "../navigation/invalidate.ts"
import type { createNavigator, NavigatorDeps } from "../navigation/navigate.ts"
import { callServerFn, type CallDeps } from "../server-fn/call.ts"
import { streamServerFn } from "../server-fn/stream.ts"

type Navigator = ReturnType<typeof createNavigator>

// The booted transport the client entry's createServerFn reads at call time (bits/07). It goes onto the state
// object the document wrote, which keeps its other fields. A stream iterates, and any other function resolves. A
// response from another build reloads the page under the chunk guard. Its document loads go through the navigator,
// so a navigation after them knows the page is leaving (BUGS.md 129). Its redirect follows a mutation, so the
// target loads fresh (plan 21 8.6).
export function installCall(
	router: Router,
	env: { fetch: NavigatorDeps["fetch"] } & Pick<CallDeps, "build"> &
		Omit<Parameters<typeof invalidation>[0], "revalidate">,
	nav: Pick<Navigator, "visit" | "reload" | "assign" | "revalidate">,
): () => Promise<void> {
	const flare: object = Object(Reflect.get(globalThis, "flare"))
	const { forget, invalidate } = invalidation({ ...env, revalidate: nav.revalidate })
	const deps: CallDeps = {
		fetch: env.fetch,
		origin: window.location.origin,
		basePath: router.basePath,
		build: env.build,
		href: () => window.location.href,
		reload: nav.reload,
		go: (url, replace) => nav.visit(url, replace, true),
		assign: nav.assign,
		forget,
	}
	const call: ServerFnCall = (fn, input) =>
		fn.record.kind === "stream" ? streamServerFn(fn, input, deps) : callServerFn(fn, input, deps)
	Reflect.set(globalThis, "flare", Object.assign(flare, { call }))
	return invalidate
}
