import type { FlareRegister, RegisteredEnv } from "../../shared/route-builder/register.ts";

// `page` is a document, a data, or a prefetch request. `serverFn` is a server-function call (dx/server.md).
export type MiddlewareKind = "page" | "serverFn";

// What a middleware receives. It carries no typed per-request data: that is `serverContext`, the user is
// `authenticate`, and per-section context is a layout's `.preloader()`.
export type MiddlewareContext = {
	request: Request;
	path: string;
	env: RegisteredEnv<FlareRegister>;
	kind: MiddlewareKind;
	next: () => Promise<Response>;
	respond: (response: Response) => void;
	bypass: (response: Response) => void;
};

// Returning a Response replaces the router's. Returning void keeps it, or continues the chain when nothing was
// called (dx/server.md).
export type Middleware = (ctx: MiddlewareContext) => Promise<Response | void> | Response | void;

// `exact` and `prefix` are an either-or on the canonical path, case-folded at a segment boundary. `kind` must
// also match. All omitted is every request.
export type MiddlewareFilter = {
	exact?: readonly string[];
	prefix?: readonly string[];
	kind?: readonly MiddlewareKind[];
};

// A list entry: the middleware alone, or with the filter set where it is listed.
export type MiddlewareEntry = Middleware | { filter: MiddlewareFilter; handler: Middleware };
