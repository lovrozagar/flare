import type { RequestKind } from "../../shared/protocol/index.ts";
import type { Session } from "../context/ctx.ts";
import type { LoaderRun } from "../loaders/run.ts";
import type { MountContext } from "../mount/mount.ts";
import { projectError, type ErrorSink } from "../render/projector.ts";
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

type Answering = Pick<Exchange, "request" | "secured">;

// A status alone, with the request's security set.
export function answer(exchange: Answering, status: number, location?: string): Response {
	return finalize({ status, body: "", location, url: exchange.request.url, headers: exchange.secured.headers });
}

// A loader run that answered without a render: validation, a gate status, or a named failure.
export async function bare(exchange: Answering, run: Pick<LoaderRun, "response">): Promise<Response> {
	const headers = new Headers(exchange.secured.headers);
	run.response.headers.forEach((value, name) => headers.set(name, value));
	const body = await run.response.text();
	return finalize({ status: run.response.status, body, headers, url: exchange.request.url });
}

// The request's headers with the body's media type. A document is HTML, a data response NDJSON.
// The route's merged `.headers()` come first, so the security set and the media type win over them.
export function typed(
	exchange: Answering,
	type: string,
	route: Readonly<Record<string, string | string[]>> = {},
): Headers {
	const headers = new Headers();
	for (const [name, value] of Object.entries(route)) for (const item of [value].flat()) headers.append(name, item);
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
	return finalize({ ...result, headers, url: exchange.request.url });
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
