import type { RequestKind } from "../../shared/protocol/index.ts";
import type { Session } from "../context/ctx.ts";
import type { LoaderRun } from "../loaders/run.ts";
import type { ErrorSink } from "../render/projector.ts";
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
export function typed(exchange: Answering, type: string): Headers {
	const headers = new Headers(exchange.secured.headers);
	headers.set("content-type", type);
	return headers;
}

// An answer the app built, a `.response()` page or a server function, still passes through finalize, and the
// request's security set wins over its headers.
export function secure(exchange: Answering, result: StageResult): Response {
	const headers = new Headers(result.headers);
	exchange.secured.headers.forEach((value, name) => headers.set(name, value));
	return finalize({ ...result, headers, url: exchange.request.url });
}
