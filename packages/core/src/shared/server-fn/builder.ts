/// <reference types="vite/client" />

import { getObserver, getOwner } from "solid-js"
import { devWarn } from "../dev/warn.ts"
import { parseDuration } from "../duration/index.ts"
import type { FlareRegister, RegisteredEnv, RegisteredServerContext, ResolvedAuth } from "../route-builder/register.ts"
import type { ValidatorInput, ValidatorOutput } from "../route-builder/types.ts"
import type { Validator } from "../validation/index.ts"

export type { StandardIssue, Validator } from "../validation/index.ts"

export type ServerFnContext = {
	input: unknown
	auth: unknown
	env: unknown
	request: Request
	serverContext: unknown
}

export type Handler = (ctx: ServerFnContext) => unknown

export type StreamHandler = (ctx: ServerFnContext & { signal: AbortSignal }) => AsyncIterable<unknown>

export type Authorize = (ctx: ServerFnContext) => boolean | Promise<boolean>

// One registration. The transform injects its id. `authenticate` is a required session: there is no optional mode.
// `kind` is the method that ended the chain. The client graph's transform strips the body to `undefined`, so the
// client transport reads the kind, never the body (BUGS.md B14).
export type ServerFnRecord = {
	kind: "handler" | "stream"
	method: "get" | "post"
	authenticate: boolean
	input?: Validator
	authorize?: Authorize
	cache?: { maxAge: string }
	handler?: Handler
	stream?: StreamHandler
}

// What dispatch and the client stub read from a server function. `id` is the B41 hash and `name` the export name,
// both injected by the boundary transform (dx/server-fn.md). The registry holds these, so a typed callable fits.
export type ServerFnRef = { readonly id: string; readonly name: string; readonly record: ServerFnRecord }

// How a callable runs. The server entry binds the in-request call and the client entry the booted transport, so
// this module imports neither side (03-surface `./server-fn`).
export type ServerFnCall = (fn: ServerFnRef, input: unknown) => unknown

// The public `createServerFn` each entry exports.
export type CreateServerFn = (config?: { method?: "get" | "post" }) => ServerFnBuilder<FlareRegister, FnStart>

// What a typed chain knows: whether `.authenticate()` ran, what the caller passes (`input`) and the handler reads
// (`output`), and the methods already called. The validator runs on the server between the two (dx/server-fn.md).
export type FnState = { auth: boolean; input: unknown; output: unknown; used: string }

export type FnStart = { auth: false; input: void; output: void; used: never }

type StandardValidator = { "~standard": { validate: (value: unknown) => unknown } }

// `any` matches both branches of `[T] extends [void]`, so a side typed `any` is read as one before that test: it keeps
// its argument and its value (dx/server-fn.md, BUGS.md 357).
export type NoInput<T> = 0 extends 1 & T ? false : [T] extends [void] ? true : false

// The handler, `authorize`, and stream context (dx/server-fn.md). `input` is `undefined` until `.input()`.
export type FnContext<R extends FlareRegister, S extends FnState> = {
	input: NoInput<S["output"]> extends true ? undefined : S["output"]
	auth: ResolvedAuth<R, S["auth"]>
	env: RegisteredEnv<R>
	request: Request
	serverContext: RegisteredServerContext<R>
}

// No argument while the input is `void`, else the validator output. The type is the handler's value, not the envelope.
type Call<I, Out> = NoInput<I> extends true ? () => Out : (input: I) => Out

export type ServerFn<I, O> = Call<I, Promise<O>> & ServerFnRef

// A stream's client function iterates the yielded values. The generator's return is dropped.
export type StreamFn<I, C> = Call<I, AsyncIterable<C>> & ServerFnRef

// The state after method `K`: `.authenticate()` sets `auth`, `.input()` sets both sides, and the rest keep them.
type Next<S extends FnState, K extends string, Changed extends Partial<FnState> = {}> = {
	auth: Changed extends { auth: infer A extends boolean } ? A : S["auth"]
	input: Changed extends { input: infer I } ? I : S["input"]
	output: Changed extends { output: infer O } ? O : S["output"]
	used: S["used"] | K
}

type Steps<R extends FlareRegister, S extends FnState> = {
	authenticate(): ServerFnBuilder<R, Next<S, "authenticate", { auth: true }>>
	// The parameter of `parse` or of the function is the caller's input. An unannotated one is `unknown`.
	input<V extends StandardValidator>(
		validator: V,
	): ServerFnBuilder<R, Next<S, "input", { input: ValidatorInput<V>; output: ValidatorOutput<V> }>>
	input<I, O>(validator: {
		parse: (value: I) => O
	}): ServerFnBuilder<R, Next<S, "input", { input: I; output: Awaited<O> }>>
	input<I, O>(validator: (value: I) => O): ServerFnBuilder<R, Next<S, "input", { input: I; output: Awaited<O> }>>
	authorize(fn: (ctx: FnContext<R, S>) => boolean | Promise<boolean>): ServerFnBuilder<R, Next<S, "authorize">>
	cache(config: { maxAge: string }): ServerFnBuilder<R, Next<S, "cache">>
}

// Each method once, in any order, and the type stops offering it once called. `.handler()` or `.stream()` ends it.
export type ServerFnBuilder<R extends FlareRegister, S extends FnState> = Omit<Steps<R, S>, S["used"]> & {
	handler<O>(fn: (ctx: FnContext<R, S>) => O): ServerFn<S["input"], Awaited<O>>
	stream<C>(fn: (ctx: FnContext<R, S> & { signal: AbortSignal }) => AsyncIterable<C>): StreamFn<S["input"], C>
}

// `__id`, `__name`, and `__client` are written by the transform. They are not part of the typed config.
type Internal = { id: string; name: string; client: boolean }

// The runtime value under the typed builder and the typed callable.
type Callable = ServerFnRef & ((input?: unknown) => unknown)

type Chain = {
	authenticate: () => Chain
	input: (validator: Validator) => Chain
	authorize: (fn: Authorize) => Chain
	cache: (config: { maxAge: string }) => Chain
	handler: (fn: Handler) => Callable
	stream: (fn: StreamHandler) => Callable
}

// The typed signature is the public one. The chain under it is untyped, as each step only stores its callback.
export function bindServerFn(call: ServerFnCall): CreateServerFn {
	function createServerFn(config?: { method?: "get" | "post" }): ServerFnBuilder<FlareRegister, FnStart>
	function createServerFn(config: { method?: "get" | "post" } = {}): unknown {
		return chainOf(config, call)
	}
	return createServerFn
}

// `method` defaults to "post". The chain ends with `.handler` or `.stream`, never both. `cache.maxAge` is legal only
// on a GET with no `authenticate` and no `authorize`, and any other combination throws when the chain ends (B43).
function chainOf(config: { method?: "get" | "post" }, call: ServerFnCall): Chain {
	const method = config.method ?? "post"
	if (method !== "get" && method !== "post") throw new Error(`createServerFn method is "get" or "post", not ${method}`)
	const internal = internalOf(config)
	const record: ServerFnRecord = { kind: "handler", method, authenticate: false }
	const used = new Set<string>()
	// A second call would silently replace the first (dx/server-fn.md).
	const once = (step: string): void => {
		if (used.has(step)) throw new Error(`${step} twice`)
		used.add(step)
	}
	const end = (): Callable => {
		if (record.handler !== undefined && record.stream !== undefined)
			throw new Error("A server function has a stream or handler, not both")
		const shared = record.method !== "get" || record.authenticate || record.authorize !== undefined
		if (record.cache !== undefined && shared) {
			throw new Error("cache.maxAge needs a GET server function with no authenticate and no authorize")
		}
		return callable(internal, record, call)
	}
	const chain: Chain = {
		authenticate: () => {
			once("authenticate")
			record.authenticate = true
			return chain
		},
		input: (validator) => {
			once("input")
			record.input = validator
			return chain
		},
		authorize: (fn) => {
			once("authorize")
			record.authorize = fn
			return chain
		},
		cache: (cache) => {
			once("cache")
			checkMaxAge(cache.maxAge)
			record.cache = cache
			return chain
		},
		handler: (fn) => {
			record.handler = fn
			return end()
		},
		stream: (fn) => {
			record.kind = "stream"
			record.stream = fn
			return end()
		},
	}
	return chain
}

function internalOf(config: object): Internal {
	const id: unknown = Reflect.get(config, "__id")
	const name: unknown = Reflect.get(config, "__name")
	return {
		id: typeof id === "string" ? id : "",
		name: typeof name === "string" ? name : "",
		client: Reflect.get(config, "__client") === true,
	}
}

// A direct client call in a component or route body warns in dev, then calls (B45): an owner exists and no reactive
// observer runs. The check is a heuristic, so it never throws: a suspense query's first queryFn and an onSettled
// callback match it too (BUGS.md B36). A memo or effect compute has an observer. An event handler, an effect callback,
// and code after an await have no owner. A production bundle drops the check with `import.meta.env.DEV`.
function callable(internal: Internal, record: ServerFnRecord, call: ServerFnCall): Callable {
	const invoke = (input?: unknown): unknown => {
		if (import.meta.env?.DEV && internal.client && getOwner() !== null && getObserver() === null) {
			devWarn(
				"server-fn",
				`${internal.name} was called during a render. Call it from an event or an effect, or fetch it with serverFnQueryOptions`,
			)
		}
		return call(fn, input)
	}
	// A function's own `name` is read-only, so it is defined, not assigned.
	Object.defineProperty(invoke, "name", { value: internal.name })
	const fn = Object.assign(invoke, { id: internal.id, record })
	return fn
}

// `.cache({ maxAge })` parses its duration when the chain is built, so a bad one never answers 500 after the handler
// ran (BUGS.md 393).
function checkMaxAge(maxAge: string): void {
	try {
		parseDuration(maxAge)
	} catch {
		throw new Error(`cache.maxAge ${JSON.stringify(maxAge)} is no duration`)
	}
}
