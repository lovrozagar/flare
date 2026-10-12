import type { Callback } from "../../shared/route-builder/chain.ts";
import { enters } from "./filters.ts";
import type { Middleware, MiddlewareContext, MiddlewareEntry, MiddlewareFilter, MiddlewareKind } from "./types.ts";

// `createMiddleware(fn)` returns `fn` typed as `Middleware` and does nothing else. The filter is set where the
// middleware is listed, so one handler can sit under several filters (dx/server.md).
export function createMiddleware(fn: Middleware): Middleware {
	return fn;
}

// What the pipeline hands the runner. `fail` turns a throw into the 500 the pipeline answers, and projects it.
export type RunInput = {
	request: Request;
	env: unknown;
	kind: MiddlewareKind;
	fail: (error: unknown) => Response;
};

type Base = Pick<MiddlewareContext, "request" | "path" | "kind"> & { env: unknown };

// The stored handler takes the runtime context: `env` there is the adapter's value, typed only for the user.
type Handler = Callback<Omit<MiddlewareContext, "env"> & { env: unknown }, ReturnType<Middleware>>;

type Entry = Handler | { filter: MiddlewareFilter; handler: Handler };

// 02-system step 6: the list in declared order, each entry wrapping the rest, and `router` innermost. It resolves to
// the one Response before finalize, which the pipeline still runs. A throw is `fail`'s answer.
export async function runMiddleware(
	entries: readonly MiddlewareEntry[],
	input: RunInput,
	router: () => Promise<Response>,
): Promise<Response> {
	const base: Base = {
		request: input.request,
		path: new URL(input.request.url).pathname,
		env: input.env,
		kind: input.kind,
	};
	const list: readonly Entry[] = entries;
	const step = (index: number): Promise<Response> => {
		const entry = list[index];
		const rest = (): Promise<Response> => step(index + 1);
		if (entry === undefined) return router();
		if (typeof entry === "function") return call(entry, base, rest);
		return enters(entry.filter, base) ? call(entry.handler, base, rest) : rest();
	};
	try {
		return await step(0);
	} catch (error) {
		return input.fail(error);
	}
}

// One middleware. A returned Response replaces the router's, a stash from `respond` or `bypass` answers, and
// otherwise the router's response stands, reached through `next()` or, when nothing was called, continued here.
async function call(handler: Handler, base: Base, rest: () => Promise<Response>): Promise<Response> {
	let nexted: Promise<Response> | undefined;
	let routed: Response | undefined;
	let stashed: Response | undefined;
	const stash = (response: Response): void => {
		stashed = response;
	};
	const next = (): Promise<Response> => {
		if (nexted !== undefined) throw new Error("next() twice");
		nexted = rest().then((response) => (routed = response));
		return nexted;
	};
	try {
		const returned: unknown = await handler({ ...base, next, respond: stash, bypass: stash });
		const chosen = returned instanceof Response ? returned : stashed;
		if (chosen === undefined) return await (nexted ?? rest());
		discard(routed, chosen);
		return chosen;
	} catch (error) {
		discard(routed, undefined);
		throw error;
	}
}

// A router body no one will read is cancelled, so a streaming render stops. A rewrap such as
// `new Response(res.body, res)` keeps the router's stream, so that body is still read.
function discard(routed: Response | undefined, kept: Response | undefined): void {
	if (routed !== undefined && routed !== kept && routed.body !== kept?.body) void routed.body?.cancel();
}
