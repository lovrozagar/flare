import { getOwner } from "solid-js";
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

// The callable `.handler()` and `.stream()` return. `id` is the B41 hash and `name` the export name, both injected
// by the boundary transform (dx/server-fn.md).
export type ServerFn = ((input?: unknown) => unknown) & { id: string; name: string; record: ServerFnRecord };

// How a client graph's callable reaches the server: the HTTP stub (client/server-fn/call.ts).
export type ClientCall = (fn: ServerFn, input: unknown) => unknown;

// `__id`, `__name`, and `__client` are written by the transform. They are not part of the typed config.
type Internal = { id: string; name: string; client: boolean };

export type ServerFnChain = {
	authenticate: () => ServerFnChain;
	input: (validator: Validator) => ServerFnChain;
	authorize: (fn: Authorize) => ServerFnChain;
	cache: (config: { maxAge: string }) => ServerFnChain;
	handler: (fn: Handler) => ServerFn;
	stream: (fn: StreamHandler) => ServerFn;
};

// `method` defaults to "post". The chain ends with `.handler` or `.stream`, never both. `cache.maxAge` is legal only
// on a GET with no `authenticate` and no `authorize`, and any other combination throws when the chain ends (B43).
// A client graph's call goes through `client`. Every other graph's call runs in-process in the active request.
export function createServerFn(config: { method?: "get" | "post" } = {}, client?: ClientCall): ServerFnChain {
	const method = config.method ?? "post";
	if (method !== "get" && method !== "post") throw new Error(`createServerFn method is "get" or "post", not ${method}`);
	const internal = internalOf(config);
	const transport = internal.client ? required(client) : undefined;
	const record: ServerFnRecord = { method, authenticate: false };
	const end = (): ServerFn => {
		if (record.handler !== undefined && record.stream !== undefined)
			throw new Error("A server function has a stream or handler, not both");
		const shared = record.method !== "get" || record.authenticate || record.authorize !== undefined;
		if (record.cache !== undefined && shared) {
			throw new Error("cache.maxAge needs a GET server function with no authenticate and no authorize");
		}
		return callable(internal, record, transport);
	};
	const chain: ServerFnChain = {
		authenticate: () => {
			record.authenticate = true;
			return chain;
		},
		input: (validator) => {
			record.input = validator;
			return chain;
		},
		authorize: (fn) => {
			record.authorize = fn;
			return chain;
		},
		cache: (cache) => {
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

// A direct client call while a component or a computation runs is a render call, and it throws before any work
// (B45). An event handler, an effect callback, and a queryFn run with no owner.
function callable(internal: Internal, record: ServerFnRecord, transport: ClientCall | undefined): ServerFn {
	const call = (input?: unknown): unknown => {
		if (transport === undefined) return callInRequest(fn, input);
		if (getOwner() !== null) {
			throw new Error(`${internal.name} was called during a render. Call it from an event, an effect, or a queryFn`);
		}
		return transport(fn, input);
	};
	// A function's own `name` is read-only, so it is defined, not assigned.
	Object.defineProperty(call, "name", { value: internal.name });
	const fn = Object.assign(call, { id: internal.id, record });
	return fn;
}
