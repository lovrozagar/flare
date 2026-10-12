import { getObserver, getOwner } from "solid-js";
import type {
	FlareRegister,
	RegisteredEnv,
	RegisteredServerContext,
	ResolvedAuth,
} from "../../shared/route-builder/register.ts";
import type { ValidatorInput, ValidatorOutput } from "../../shared/route-builder/types.ts";
import type { Validator } from "../../shared/validation/index.ts";
import { callInRequest } from "./dispatch.ts";

export type { StandardIssue, Validator } from "../../shared/validation/index.ts";

export type ServerFnContext = {
	input: unknown;
	auth: unknown;
	env: unknown;
	request: Request;
	serverContext: unknown;
};

export type Handler = (ctx: ServerFnContext) => unknown;

export type StreamHandler = (ctx: ServerFnContext & { signal: AbortSignal }) => AsyncIterable<unknown>;

export type Authorize = (ctx: ServerFnContext) => boolean | Promise<boolean>;

// One registration. The transform injects its id. `authenticate` is a required session: there is no optional mode.
export type ServerFnRecord = {
	method: "get" | "post";
	authenticate: boolean;
	input?: Validator;
	authorize?: Authorize;
	cache?: { maxAge: string };
	handler?: Handler;
	stream?: StreamHandler;
};

// What dispatch and the client stub read from a server function. `id` is the B41 hash and `name` the export name,
// both injected by the boundary transform (dx/server-fn.md). The registry holds these, so a typed callable fits.
export type ServerFnRef = { readonly id: string; readonly name: string; readonly record: ServerFnRecord };

// How a client graph's callable reaches the server: the HTTP stub (client/server-fn/call.ts).
export type ClientCall = (fn: ServerFnRef, input: unknown) => unknown;

// What a typed chain knows: whether `.authenticate()` ran, what the caller passes (`input`) and the handler reads
// (`output`), and the methods already called. The validator runs on the server between the two (dx/server-fn.md).
export type FnState = { auth: boolean; input: unknown; output: unknown; used: string };

export type FnStart = { auth: false; input: void; output: void; used: never };

type StandardValidator = { "~standard": { validate: (value: unknown) => unknown } };

// The handler, `authorize`, and stream context (dx/server-fn.md). `input` is `undefined` until `.input()`.
export type FnContext<R extends FlareRegister, S extends FnState> = {
	input: [S["output"]] extends [void] ? undefined : S["output"];
	auth: ResolvedAuth<R, S["auth"]>;
	env: RegisteredEnv<R>;
	request: Request;
	serverContext: RegisteredServerContext<R>;
};

// No argument while the input is `void`, else the validator output. The type is the handler's value, not the envelope.
type Call<I, Out> = [I] extends [void] ? () => Out : (input: I) => Out;

export type ServerFn<I, O> = Call<I, Promise<O>> & ServerFnRef;

// A stream's client function iterates the yielded values. The generator's return is dropped.
export type StreamFn<I, C> = Call<I, AsyncIterable<C>> & ServerFnRef;

// The state after method `K`: `.authenticate()` sets `auth`, `.input()` sets both sides, and the rest keep them.
type Next<S extends FnState, K extends string, Changed extends Partial<FnState> = {}> = {
	auth: Changed extends { auth: infer A extends boolean } ? A : S["auth"];
	input: Changed extends { input: infer I } ? I : S["input"];
	output: Changed extends { output: infer O } ? O : S["output"];
	used: S["used"] | K;
};

type Steps<R extends FlareRegister, S extends FnState> = {
	authenticate(): ServerFnBuilder<R, Next<S, "authenticate", { auth: true }>>;
	// The parameter of `parse` or of the function is the caller's input. An unannotated one is `unknown`.
	input<V extends StandardValidator>(
		validator: V,
	): ServerFnBuilder<R, Next<S, "input", { input: ValidatorInput<V>; output: ValidatorOutput<V> }>>;
	input<I, O>(validator: {
		parse: (value: I) => O;
	}): ServerFnBuilder<R, Next<S, "input", { input: I; output: Awaited<O> }>>;
	input<I, O>(validator: (value: I) => O): ServerFnBuilder<R, Next<S, "input", { input: I; output: Awaited<O> }>>;
	authorize(fn: (ctx: FnContext<R, S>) => boolean | Promise<boolean>): ServerFnBuilder<R, Next<S, "authorize">>;
	cache(config: { maxAge: string }): ServerFnBuilder<R, Next<S, "cache">>;
};

// Each method once, in any order, and the type stops offering it once called. `.handler()` or `.stream()` ends it.
export type ServerFnBuilder<R extends FlareRegister, S extends FnState> = Omit<Steps<R, S>, S["used"]> & {
	handler<O>(fn: (ctx: FnContext<R, S>) => O): ServerFn<S["input"], Awaited<O>>;
	stream<C>(fn: (ctx: FnContext<R, S> & { signal: AbortSignal }) => AsyncIterable<C>): StreamFn<S["input"], C>;
};

// `__id`, `__name`, and `__client` are written by the transform. They are not part of the typed config.
type Internal = { id: string; name: string; client: boolean };

// The runtime value under the typed builder and the typed callable.
type Callable = ServerFnRef & ((input?: unknown) => unknown);

type Chain = {
	authenticate: () => Chain;
	input: (validator: Validator) => Chain;
	authorize: (fn: Authorize) => Chain;
	cache: (config: { maxAge: string }) => Chain;
	handler: (fn: Handler) => Callable;
	stream: (fn: StreamHandler) => Callable;
};

// `method` defaults to "post". The chain ends with `.handler` or `.stream`, never both. `cache.maxAge` is legal only
// on a GET with no `authenticate` and no `authorize`, and any other combination throws when the chain ends (B43).
// A client graph's call goes through `client`. Every other graph's call runs in-process in the active request. The
// typed signature is the public one. The chain under it is untyped, as each step only stores its callback.
export function createServerFn(
	config?: { method?: "get" | "post" },
	client?: ClientCall,
): ServerFnBuilder<FlareRegister, FnStart>;
export function createServerFn(config: { method?: "get" | "post" } = {}, client?: ClientCall): unknown {
	const method = config.method ?? "post";
	if (method !== "get" && method !== "post") throw new Error(`createServerFn method is "get" or "post", not ${method}`);
	const internal = internalOf(config);
	const transport = internal.client ? required(client) : undefined;
	const record: ServerFnRecord = { method, authenticate: false };
	const used = new Set<string>();
	// A second call would silently replace the first (dx/server-fn.md).
	const once = (step: string): void => {
		if (used.has(step)) throw new Error(`${step} twice`);
		used.add(step);
	};
	const end = (): Callable => {
		if (record.handler !== undefined && record.stream !== undefined)
			throw new Error("A server function has a stream or handler, not both");
		const shared = record.method !== "get" || record.authenticate || record.authorize !== undefined;
		if (record.cache !== undefined && shared) {
			throw new Error("cache.maxAge needs a GET server function with no authenticate and no authorize");
		}
		return callable(internal, record, transport);
	};
	const chain: Chain = {
		authenticate: () => {
			once("authenticate");
			record.authenticate = true;
			return chain;
		},
		input: (validator) => {
			once("input");
			record.input = validator;
			return chain;
		},
		authorize: (fn) => {
			once("authorize");
			record.authorize = fn;
			return chain;
		},
		cache: (cache) => {
			once("cache");
			record.cache = cache;
			return chain;
		},
		handler: (fn) => {
			record.handler = fn;
			return end();
		},
		stream: (fn) => {
			record.stream = fn;
			return end();
		},
	};
	return chain;
}

function internalOf(config: object): Internal {
	const id: unknown = Reflect.get(config, "__id");
	const name: unknown = Reflect.get(config, "__name");
	return {
		id: typeof id === "string" ? id : "",
		name: typeof name === "string" ? name : "",
		client: Reflect.get(config, "__client") === true,
	};
}

function required(client: ClientCall | undefined): ClientCall {
	if (client === undefined) throw new Error("A client server function needs the client transport");
	return client;
}

// A direct client call in a component or route body throws before any work (B45, B85): an owner exists and no
// reactive observer runs. A memo or effect compute has an observer. An event handler, an effect callback, and code
// after an await have no owner. An onSettled callback looks like a body, so it throws too (dx/server-fn.md).
function callable(internal: Internal, record: ServerFnRecord, transport: ClientCall | undefined): Callable {
	const call = (input?: unknown): unknown => {
		if (transport === undefined) return callInRequest(fn, input);
		if (getOwner() !== null && getObserver() === null) {
			throw new Error(`${internal.name} was called during a render. Call it from an event, an effect, or a queryFn`);
		}
		return transport(fn, input);
	};
	// A function's own `name` is read-only, so it is defined, not assigned.
	Object.defineProperty(call, "name", { value: internal.name });
	const fn = Object.assign(call, { id: internal.id, record });
	return fn;
}
