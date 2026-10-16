import { UnauthenticatedError, UnauthorizedError } from "../../shared/errors/http.ts"
import { FN_HEADER, fnPrefix } from "../../shared/protocol/index.ts"
import { runValidator } from "../../shared/validation/index.ts"
import { fnCaller } from "../auth/caller.ts"
import { requestScope, type RequestScope } from "../context/ctx.ts"
import type { StageResult } from "../lifecycle/finalize.ts"
import { NDJSON } from "../navigation/index.ts"
import type { ErrorSink } from "../render/projector.ts"
import {
	bindServerFn,
	type CreateServerFn,
	type ServerFnContext,
	type ServerFnRef,
} from "../../shared/server-fn/builder.ts"
import { setCacheControl } from "./cache-control.ts"
import { checkCsrf } from "./csrf.ts"
import { errorEnvelope, okEnvelope, type Envelope } from "./envelope.ts"
import { readInput, type InputErrors } from "./input.ts"
import { streamEnvelopes } from "./stream.ts"

// `serverFns` from src/_gen/server-fns.gen.ts: one lazy import per exported createServerFn, keyed by its B41 id.
export type ServerFns = Readonly<Record<string, () => Promise<ServerFnRef>>>

export type DispatchInput = {
	request: Request
	serverFns: ServerFns
	sameSite: readonly string[]
	sink: ErrorSink
	basePath: string
	bodyLimit?: number | undefined
}

// An in-request call whose input fails its validator. Over HTTP the same failure is a 400 envelope.
export class InputError extends Error {
	readonly status: number = 400
	readonly issues: InputErrors["issues"]
	readonly fieldErrors: InputErrors["fieldErrors"]

	constructor(errors: InputErrors) {
		super("Invalid input")
		this.name = "InputError"
		this.issues = errors.issues
		this.fieldErrors = errors.fieldErrors
	}
}

// B42: parse the URL, look the id up, answer OPTIONS, check the method, then CSRF, authenticate, input, authorize,
// and the handler. An unknown id is 404 before the method check. A failure after lookup is the envelope. The
// caller finalizes.
export async function dispatch(input: DispatchInput): Promise<StageResult> {
	const fn = await lookup(input)
	if (fn === undefined) return { status: 404, body: null }
	const method = input.request.method.toLowerCase()
	const allow = new Headers({ allow: `${fn.record.method.toUpperCase()}, OPTIONS` })
	if (method === "options") return { status: 204, body: null, headers: allow }
	if (method !== fn.record.method) return { status: 405, body: null, headers: allow }
	const csrf = checkCsrf({
		method: fn.record.method,
		headers: input.request.headers,
		origin: new URL(input.request.url).origin,
		sameSite: input.sameSite,
		identity: fn.record.authenticate || fn.record.authorize !== undefined,
	})
	if (csrf === 403) return forbidden(fn)
	try {
		return await run(fn, input)
	} catch (thrown) {
		const answer = errorEnvelope(fn.name, thrown, { sink: input.sink, basePath: input.basePath })
		return reply(fn, answer.envelope, answer.http)
	}
}

// The server entry's `createServerFn`: every call runs in-process in the active request (03-surface `./server-fn`).
export const createServerFn: CreateServerFn = bindServerFn(callInRequest)

// A server function called from a loader, `.response()`, or another server function: the same steps without HTTP
// and without CSRF, against the active request. A handler's call resolves to its value. A stream's call is the
// iterator of its yielded values. Either throws what a step threw.
export function callInRequest(fn: ServerFnRef, input: unknown): unknown {
	const stream = fn.record.stream
	if (stream === undefined) return handled(fn, input)
	const scope = active()
	return (async function* () {
		const ctx = await prepared(fn, input, scope)
		yield* stream({ ...ctx, signal: scope.request.signal })
	})()
}

async function handled(fn: ServerFnRef, input: unknown): Promise<unknown> {
	return fn.record.handler?.(await prepared(fn, input, active()))
}

async function prepared(fn: ServerFnRef, input: unknown, scope: RequestScope): Promise<ServerFnContext> {
	const auth = await authOf(fn, scope)
	const value = await validated(fn, input)
	const ctx = { input: value, auth, env: scope.env, request: scope.request, serverContext: scope.serverContext }
	if (!(await allowed(fn, ctx))) throw new UnauthorizedError()
	return ctx
}

// Own keys only, so an id such as `constructor` is unknown too.
async function lookup(input: DispatchInput): Promise<ServerFnRef | undefined> {
	const id = new URL(input.request.url).pathname.slice(fnPrefix(input.basePath).length)
	const load = Object.hasOwn(input.serverFns, id) ? input.serverFns[id] : undefined
	return load?.()
}

async function run(fn: ServerFnRef, input: DispatchInput): Promise<StageResult> {
	const scope = active()
	const auth = await authOf(fn, scope)
	const read = await readInput(input.request, fn.record, {
		dev: input.sink.dev,
		limit: input.bodyLimit,
		owner: fn.name,
	})
	if (read.status === 413) return reply(fn, { name: fn.name, status: 413, message: "Payload Too Large" }, 413)
	if (read.status === 400) {
		return reply(fn, { name: fn.name, status: 400, message: "Invalid input", errors: read.errors }, 400)
	}
	const ctx = { input: read.input, auth, env: scope.env, request: input.request, serverContext: scope.serverContext }
	if (!(await allowed(fn, ctx))) return forbidden(fn)
	const stream = fn.record.stream
	if (stream !== undefined) return streamed(fn, stream({ ...ctx, signal: input.request.signal }), input)
	const value = await fn.record.handler?.(ctx)
	if (value instanceof Response) return passThrough(fn, value)
	return reply(fn, okEnvelope(fn.name, value), 200)
}

// The NDJSON body starts once every step before the generator has passed. Its lines are envelopes.
function streamed(fn: ServerFnRef, source: AsyncIterable<unknown>, input: DispatchInput): StageResult {
	const body = streamEnvelopes(fn.name, source, { sink: input.sink, basePath: input.basePath })
	const headers = new Headers({ "content-type": NDJSON })
	setCacheControl(headers, fn.record)
	return { status: 200, body, headers }
}

function active(): RequestScope {
	const scope = requestScope()
	if (scope === undefined) throw new Error("server function called outside a request")
	return scope
}

// `.authenticate()` reads the request's one session. Without it `auth` is null and authenticate does not run.
async function authOf(fn: ServerFnRef, scope: RequestScope): Promise<unknown> {
	if (!fn.record.authenticate) return null
	const session = await scope.session(fnCaller(fn.name))
	if (session === undefined) throw new Error("authenticate returned undefined. Return null for no session")
	if (session === null) throw new UnauthenticatedError()
	return session
}

// In-process, a thrown validator message stays: the error is projected where it lands.
async function validated(fn: ServerFnRef, raw: unknown): Promise<unknown> {
	if (fn.record.input === undefined) return undefined
	const result = await runValidator(fn.record.input, raw, { dev: true, owner: fn.name })
	if (!result.ok) throw new InputError(result.errors)
	return result.value
}

async function allowed(fn: ServerFnRef, ctx: ServerFnContext): Promise<boolean> {
	return fn.record.authorize === undefined || (await fn.record.authorize(ctx))
}

// A CSRF failure and an `authorize` false are JSON, not the page walk, and open no overlay.
function forbidden(fn: ServerFnRef): StageResult {
	return reply(fn, { name: fn.name, status: 403, message: "Forbidden" }, 403)
}

function reply(fn: ServerFnRef, envelope: Envelope, status: number): StageResult {
	const headers = new Headers({ "content-type": "application/json" })
	setCacheControl(headers, fn.record)
	return { status, body: JSON.stringify(envelope), headers }
}

// A returned Response is the HTTP response: its status, body, and other headers stay, and Cache-Control is
// overwritten (B43). `flare-fn: response` tells the client not to read it as an envelope, whatever the handler set.
function passThrough(fn: ServerFnRef, response: Response): StageResult {
	const headers = new Headers(response.headers)
	setCacheControl(headers, fn.record)
	headers.set(FN_HEADER, "response")
	return { status: response.status, body: response.body, headers }
}
