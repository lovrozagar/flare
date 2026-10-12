import type { RequestKind } from "../../shared/protocol/index.ts";
import type { Session } from "../context/ctx.ts";
import type { LoaderRun } from "../loaders/run.ts";
import type { MountContext } from "../mount/mount.ts";
import { projectError, type ErrorSink } from "../render/projector.ts";
import { applySecurity, type SecurityConfig } from "../security/apply.ts";
import { finalize, type StageResult } from "./finalize.ts";
import type { RuntimeOptions } from "./options.ts";

type Secured = { headers: Headers; nonce: string };

// `secured` is resolved once per request, before the status is known, so every answer carries the same
// security set (bit 03).
// `request` carries the URL the router and the loaders see: both internal params are removed (bit 06).
// `session` is the request's one authenticate, shared by the gate and every server function it calls.
export type Exchange = {
	options: RuntimeOptions;
	request: Request;
	env: unknown;
	secured: Secured;
	sink: ErrorSink;
	kind: RequestKind;
	stale: string | null;
	session: Session;
};

// Every answer here carries the request's resolved security set, which already holds the defaults, so finalize
// gets no `url` and does not add them again: a `false` in that set stays removed.
type Answering = Pick<Exchange, "request" | "secured">;

// A status alone, with the request's security set.
export function answer(exchange: Answering, status: number, location?: string): Response {
	return finalize({ status, body: "", location, headers: exchange.secured.headers });
}

// A loader run that answered without a render: validation, a gate status, or a named failure.
export async function bare(exchange: Answering, run: Pick<LoaderRun, "response">): Promise<Response> {
	const headers = new Headers(exchange.secured.headers);
	run.response.headers.forEach((value, name) => headers.set(name, value));
	const body = await run.response.text();
	return finalize({ status: run.response.status, body, headers });
}

// The request's headers with the body's media type. A document is HTML, a data response NDJSON.
// A route's `.security()` rebuilds the request's set before the body is written, so the nonce the render stamps and
// the header agree (B68). A route that sets none keeps the set.
export function routeSecured<E extends Pick<Exchange, "request" | "secured" | "options">>(
	exchange: E,
	security: SecurityConfig,
): E {
	if (Object.keys(security).length === 0) return exchange;
	const url = exchange.request.url;
	const secured = applySecurity({ url, headers: new Headers(), security: exchange.options.security, route: security });
	return { ...exchange, secured };
}

// The cacheability decision writes these on a rendered page. `.headers()` cannot (dx/cache.md).
const DECIDED = new Set(["cache-control", "cache-tag"]);

// The route's merged `.headers()` come first, so the security set and the media type win over them.
export function typed(
	exchange: Answering,
	type: string,
	route: Readonly<Record<string, string | string[]>> = {},
): Headers {
	const headers = new Headers();
	for (const [name, value] of Object.entries(route)) {
		if (DECIDED.has(name)) continue;
		for (const item of [value].flat()) headers.append(name, item);
	}
	exchange.secured.headers.forEach((value, name) => headers.set(name, value));
	headers.set("content-type", type);
	return headers;
}

// A whole Response from a mount or a middleware passes through finalize the same way: the security set wins.
export function passed(exchange: Answering, response: Response): Response {
	return secure(exchange, { status: response.status, body: response.body, headers: response.headers });
}

// An answer the app built, a `.response()` page or a server function, still passes through finalize, and the
// request's security set wins over its headers.
export function secure(exchange: Answering, result: StageResult): Response {
	const headers = new Headers(result.headers);
	exchange.secured.headers.forEach((value, name) => headers.set(name, value));
	return finalize({ ...result, headers });
}

// Without an adapter context, background work still runs, and a rejection is projected like any bug.
export function background(sink: ErrorSink): MountContext {
	return { waitUntil: (promise) => void promise.catch((error: unknown) => projectError(error, sink)) };
}

// A stage's throw is a bug: projected, then the 500 every exit shares.
export function failed(exchange: Pick<Exchange, "request" | "secured" | "sink">): (error: unknown) => Response {
	return (error) => {
		projectError(error, exchange.sink);
		return answer(exchange, 500);
	};
}
