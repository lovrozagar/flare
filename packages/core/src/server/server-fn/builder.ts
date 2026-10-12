import type { Validator } from "../../shared/validation/index.ts";

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

export type ServerFn = { record: ServerFnRecord };

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
export function createServerFn(config: { method?: "get" | "post" } = {}): ServerFnChain {
	const method = config.method ?? "post";
	if (method !== "get" && method !== "post") throw new Error(`createServerFn method is "get" or "post", not ${method}`);
	const record: ServerFnRecord = { method, authenticate: false };
	const end = (): ServerFn => {
		if (record.handler !== undefined && record.stream !== undefined)
			throw new Error("A server function has a stream or handler, not both");
		const shared = record.method !== "get" || record.authenticate || record.authorize !== undefined;
		if (record.cache !== undefined && shared) {
			throw new Error("cache.maxAge needs a GET server function with no authenticate and no authorize");
		}
		return { record };
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
