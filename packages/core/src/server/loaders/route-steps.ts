import { defined } from "../../shared/errors/index.ts"
import { headTags, replacing } from "../../shared/head/index.ts"
import type { HeadOptions, PreloaderContext, RouteHeaders, RouteSecurity } from "../../shared/route-builder/chain.ts"
import type { HeadConfig, SecurityConfig } from "../../shared/route-builder/types.ts"
import { mergeHeaders } from "../security/apply.ts"
import type { Settled } from "./cascade.ts"

type View = { params: unknown; search: unknown; loaderData: unknown; preloaderContext: PreloaderContext }

// The part of a validated match the steps read.
export type StepRoute = {
	id: string
	params: unknown
	search: unknown
	headers?: ((ctx: View) => RouteHeaders) | undefined
	security?: RouteSecurity | undefined
}

// The part of a validated match its head reads.
export type HeadRoute = {
	params: unknown
	search: unknown
	head?: ((ctx: View) => HeadConfig) | undefined
	headOptions?: HeadOptions | undefined
}

type Finish = { frame: { d: unknown }; kept: PreloaderContext; bugs: unknown[] }

// A match's head, from its loader's data. A replacing route's head is marked, so the document merge, the `h` frame,
// and the state all read it (dx/head.md).
export function routeHead(route: HeadRoute, at: Finish): HeadConfig | undefined {
	try {
		const values = { params: route.params, search: route.search }
		const head = route.head?.({ ...values, loaderData: at.frame.d, preloaderContext: at.kept })
		// A value the head cannot write, such as a relative canonical, fails here as a throw from .head() does: this
		// match's head is omitted and the status stays the loader's (B82).
		if (head !== undefined) headTags(head)
		return head !== undefined && route.headOptions?.replace === true ? replacing(head) : head
	} catch (error) {
		at.bugs.push(error)
		return undefined
	}
}

export type StepsInput = {
	routes: readonly StepRoute[]
	skip?: ReadonlySet<string> | undefined
	outcomes: readonly { settled: Settled }[]
	contexts: readonly PreloaderContext[]
	bugs: unknown[]
}

// A value a Headers object cannot hold, a CR or LF from the request say, fails as a throw from `.headers()` does: that
// match's headers are omitted and the request still answers (B82, BUGS.md 168).
function writable(record: Record<string, string | string[]>): Record<string, string | string[]> {
	const probe = new Headers()
	for (const [name, value] of Object.entries(record)) for (const item of [value].flat()) probe.append(name, item)
	return record
}

// Each match whose loader resolved writes its `.headers()` and `.security()`, root to page (dx/builder.md). A match
// whose loader threw writes neither, though a later match may, and a throw omits that match's step alone (B82).
// An object `.security()` is static, so the first failed match writes its own too, and the failure's answer carries
// the route's set (BUGS.md B13). A function config reads the loader's data, so it waits for its own loader.
// Headers merge with `set-cookie` appending. Security merges outside-in: a set key replaces, and `false` removes.
export function routeSteps(input: StepsInput): {
	headers: Record<string, string | string[]>
	security: SecurityConfig
} {
	let headers: Record<string, string | string[]> = {}
	let security: SecurityConfig = {}
	const step = (run: () => void): void => {
		try {
			run()
		} catch (error) {
			input.bugs.push(error)
		}
	}
	const failure = input.outcomes.findIndex((outcome) => !outcome.settled.ok)
	for (const [index, outcome] of input.outcomes.entries()) {
		const route = defined(input.routes[index], "the loaded match")
		if (input.skip?.has(route.id) === true) continue
		const { headers: own, security: policy } = route
		if (!outcome.settled.ok) {
			if (index === failure && typeof policy === "object") security = { ...security, ...policy }
			continue
		}
		const preloaderContext = defined(input.contexts[index], "the loaded context")
		const view = { params: route.params, search: route.search, loaderData: outcome.settled.data, preloaderContext }
		if (own !== undefined) step(() => (headers = writable(mergeHeaders(headers, own(view)))))
		if (policy !== undefined)
			step(() => (security = { ...security, ...(typeof policy === "function" ? policy(view) : policy) }))
	}
	return { headers, security }
}
