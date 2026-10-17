import { createRequestEvent, getRequestEvent, type RequestEvent } from "@solidjs/web"
import { provideRequestEvent } from "@solidjs/web/storage"
import type { FlareRegister, RegisteredServerContext } from "../../shared/route-builder/register.ts"
import type { Caller } from "../auth/caller.ts"
import type { FlareStore } from "../cache/contract.ts"

type ServerContext = RegisteredServerContext<FlareRegister>

// The app's createServer({ authenticate }).
export type AppAuthenticate = (ctx: { request: Request; env: unknown } & Caller) => unknown

// The session, from one authenticate per request. The first caller's data is what the app function sees.
export type Session = (caller: Caller) => Promise<unknown>

export type ServerContextInput = {
	request: Request
	env: unknown
	serverContext?: ((ctx: { request: Request; env: unknown }) => unknown) | undefined
	authenticate?: AppAuthenticate | undefined
	// The request's mutable store, and the adapter's waitUntil. `revalidate()` reads both from the scope.
	store?: (() => FlareStore | undefined) | undefined
	waitUntil?: ((promise: Promise<unknown>) => void) | undefined
}

// What the page gate and an in-request server function call read (dx/server-fn.md).
export type RequestScope = {
	request: Request
	env: unknown
	serverContext: unknown
	session: Session
	store: () => FlareStore | undefined
	waitUntil: (promise: Promise<unknown>) => void
}

const NO_STORE = (): undefined => undefined

// Without an adapter, background work still runs. A rejection there is not a process crash.
function settles(promise: Promise<unknown>): void {
	void promise.catch(() => undefined)
}

type ContextEvent = RequestEvent & { flareServerContext: ServerContext; flareScope: RequestScope }

type Taken = { ok: true; value: unknown } | { ok: false; error: unknown }

// Solid owns the request event (B1). Its AsyncLocalStorage keeps the value across awaits and apart from a
// concurrent request, which a module slot cannot. A serverContext throw is answered by `fail` (500).
export function withServerContext<T>(
	input: ServerContextInput,
	run: (scope: RequestScope) => Promise<T>,
	fail: (error: unknown) => T,
): Promise<T> {
	const taken = takeContext(input)
	if (!taken.ok) return Promise.resolve(fail(taken.error))
	const scope = {
		request: input.request,
		env: input.env,
		serverContext: taken.value,
		session: memoSession(input),
		store: input.store ?? NO_STORE,
		waitUntil: input.waitUntil ?? settles,
	}
	const event = Object.assign(createRequestEvent(input.request), {
		flareServerContext: taken.value,
		flareScope: scope,
	})
	return new Promise<T>((resolve, reject) => {
		provideRequestEvent(event, () => run(scope).then(resolve, reject))
	})
}

// A `crossOrigin` route's request runs with no identity, its server-function calls included (B44, BUGS.md 282). Its
// scope's serverContext is what the request gives without its Cookie and Authorization, and authenticate is never
// asked: a server function that needs a session throws a bug naming the route, a logged 500 an attacker cannot probe.
export function withoutIdentity<T>(
	input: Pick<ServerContextInput, "request" | "env" | "store" | "waitUntil"> & {
		options: Pick<ServerContextInput, "serverContext">
	},
	route: string,
	run: () => Promise<T>,
): Promise<T> {
	const headers = new Headers(input.request.headers)
	headers.delete("cookie")
	headers.delete("authorization")
	// The method and the client's abort signal stay; the body is the handler's own request's to read.
	const request = new Request(input.request.url, {
		method: input.request.method,
		headers,
		signal: input.request.signal,
	})
	const refused = (): never => {
		throw new Error(`${route} is a crossOrigin route and has no session`)
	}
	const scope = { env: input.env, store: input.store, waitUntil: input.waitUntil }
	// A serverContext throw is a rejection, which the route answers as any failure (BUGS.md 287).
	return new Promise<T>((resolve, reject) => {
		const inner = { ...scope, request, serverContext: input.options.serverContext, authenticate: refused }
		withServerContext(inner, run, (error) => {
			throw error
		}).then(resolve, reject)
	})
}

// Authenticate runs at most once per request, shared by the page gate and every server function. A throw is a
// rejection, and every later read sees it too. No function means no session.
function memoSession(input: ServerContextInput): Session {
	let taken: Promise<unknown> | undefined
	return (caller) => {
		const app = input.authenticate
		taken ??= Promise.resolve().then(() =>
			app === undefined ? null : app({ request: input.request, env: input.env, ...caller }),
		)
		return taken
	}
}

// The active request's scope. Undefined outside a request.
export function requestScope(): RequestScope | undefined {
	const event: RequestEvent | undefined = getRequestEvent()
	return carries(event) ? event.flareScope : undefined
}

function takeContext(input: ServerContextInput): Taken {
	if (input.serverContext === undefined) return { ok: true, value: {} }
	try {
		return { ok: true, value: input.serverContext({ request: input.request, env: input.env }) }
	} catch (error) {
		return { ok: false, error }
	}
}

export function serverCtx(): ServerContext {
	const event: RequestEvent | undefined = getRequestEvent()
	if (!carries(event)) throw new Error("serverCtx: called outside a request")
	return event.flareServerContext
}

// The field is written only by withServerContext, from the registered serverContext function.
function carries(event: RequestEvent | undefined): event is ContextEvent {
	return event !== undefined && "flareServerContext" in event
}
