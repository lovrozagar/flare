import type {
	FlareRegister,
	RegisterField,
	RegisteredAuth,
	RegisteredEnv,
	RegisteredServerContext,
	To,
	UrlTarget,
} from "../../shared/route-builder/register.ts"
import type { Router } from "../../shared/router/create-router.ts"
import type { Caller } from "../auth/caller.ts"
import type { ServerContextInput } from "../context/ctx.ts"
import type { MiddlewareEntry } from "../middleware/types.ts"
import type { Mount, MountContext } from "../mount/mount.ts"
import type { SecurityConfig, ServerSecurity } from "../security/apply.ts"
import type { ServerFns } from "../server-fn/dispatch.ts"
import type { FlareStore } from "../cache/contract.ts"
import type { LocaleSlot } from "./locale-slot.ts"
import type { PathRewrite } from "./canonical-redirect.ts"

// A store, or a function the request's env picks it with. The function runs once per request that reads it.
export type StoreOption = FlareStore | ((env: unknown) => FlareStore)

export type Authenticate = (ctx: { request: Request; env: unknown } & Caller) => unknown

type BaseOptions = {
	router: Router
	// Hosts whose `Sec-Fetch-Site: same-site` a server function accepts (B44).
	sameSite?: readonly string[]
	// The server function POST cap in bytes. 1 MiB when omitted.
	bodyLimit?: number
	// From src/_gen/server-fns.gen.ts. Without it every `/_flare/fn/<id>` is 404.
	serverFns?: ServerFns
	// Sub-apps on canonical prefixes, checked at startup. The longer prefix wins (dx/server.md `mounts`).
	mounts?: readonly Mount[]
	// A pathname to another, redirected to after mounts and canonicalized again (dx/server.md `rewrite`).
	rewrite?: PathRewrite
	// Runs in list order around server functions and the router (02-system step 6).
	middleware?: readonly MiddlewareEntry[]
	// The object `i18n()` returns. It runs in the locale slot, not as a middleware (dx/server.md).
	locale?: LocaleSlot
	documentResponseDefer?: "stream" | "buffer"
	// The origin every shared render requests and writes into stored HTML. Required with `store` (dx/server.md).
	site?: string
	// ISR and shared SSR storage. Absent, those modes render and are not stored.
	store?: StoreOption
	// The read-only SSG seeds (dx/store.md).
	static?: StoreOption
	// Paths a previous build registered a service worker at, answered with one that unregisters itself (dx/server.md).
	retireServiceWorker?: string | readonly string[]
}

type ContextFn<R extends FlareRegister> = (ctx: {
	request: Request
	env: RegisteredEnv<R>
}) => RegisteredServerContext<R>

// The register's env reaches `authenticate`, and it answers the register's auth or null; with no auth registered, any
// value but `undefined`, a forgotten `return` (dx/types.md, plan 21 11.3, BUGS.md 329).
type AuthOption<R extends FlareRegister> = {
	authenticate?: (
		ctx: { request: Request; env: RegisteredEnv<R> } & Caller,
	) => SessionOf<R> | null | Promise<SessionOf<R> | null>
}

type SessionOf<R extends FlareRegister> = unknown extends RegisterField<R, "auth"> ? {} : RegisteredAuth<R>

// Required once the app's FlareRegister declares serverContext (B75).
type ContextOption<R extends FlareRegister> =
	unknown extends RegisterField<R, "serverContext"> ? { serverContext?: ContextFn<R> } : { serverContext: ContextFn<R> }

// The base policy, or a callback that builds it once serverContext has run. The callback cannot choose the nonce: a
// directives CSP carries `ctx.nonce` (dx/server.md SecurityConfig).
type SecurityOption<R extends FlareRegister> = {
	security?:
		| SecurityConfig
		| ((ctx: {
				request: Request
				env: RegisteredEnv<R>
				nonce: string
				serverContext: RegisteredServerContext<R>
		  }) => SecurityConfig)
}

export type ServerOptions<R extends FlareRegister = FlareRegister> = BaseOptions &
	AuthOption<R> &
	ContextOption<R> &
	SecurityOption<R>

export type RuntimeOptions = BaseOptions & {
	authenticate?: Authenticate
	serverContext?: ServerContextInput["serverContext"]
	security?: ServerSecurity
}

// `ctx` is the adapter's: `waitUntil` keeps background work alive after the response.
export type FlareServer = {
	fetch: (request: Request, env?: unknown, ctx?: MountContext) => Promise<Response>
	// The server-function POST cap in bytes, which the Bun adapter also gives `Bun.serve` (dx/adapters.md).
	readonly bodyLimit: number
	// The id of the build that serves, the one every answer names in `flare-build` (B84).
	readonly buildId: string
	// The store key of a page with these params, for a key purge outside a request (dx/store.md revalidate).
	readonly cache: { key: <Id extends To<FlareRegister>>(target: UrlTarget<FlareRegister, Id>) => string }
}

// Every key `ServerOptions` has: the type fails to compile when the options gain a key this does not list.
const KNOWN: Record<keyof RuntimeOptions, true> = {
	router: true,
	sameSite: true,
	bodyLimit: true,
	serverFns: true,
	mounts: true,
	rewrite: true,
	middleware: true,
	locale: true,
	documentResponseDefer: true,
	site: true,
	store: true,
	static: true,
	retireServiceWorker: true,
	authenticate: true,
	serverContext: true,
	security: true,
}

// The observability options dx/observability.md plans, which v1 does not have (plan 21 13.14).
const PLANNED = new Set(["logger", "onError", "requestLog", "tracer"])

// A key `ServerOptions` does not have, passed from JavaScript or through a cast, throws naming it instead of being
// ignored: a planned option, an adapter's own (`trustProxy`, B51), and a misspelling alike (BUGS.md 216, 478).
export function checkKeys(options: object): void {
	for (const key of Object.keys(options)) {
		if (Object.hasOwn(KNOWN, key)) continue
		if (PLANNED.has(key)) throw new Error(`createServer: ${key} is planned (dx/observability.md) and not in v1`)
		if (key === "trustProxy") {
			throw new Error(
				"createServer: trustProxy is an adapter option, createNodeListener's or createBunFetch's (dx/adapters.md)",
			)
		}
		throw new Error(`createServer: ${key} is not an option (dx/server.md)`)
	}
}
