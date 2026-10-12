import { BUILD_HEADER, FN_HEADER } from "../../shared/protocol/index.ts";
import { shapeIssues, type Issue } from "../../shared/validation/index.ts";
import { fnRequest } from "./codec.ts";

// What a client call needs from the booted client. `go` is the internal URL navigation an `x` frame takes. `reload`
// is the guarded document load (flare_chunk_reload). `href` is the page on screen.
export type CallDeps = {
	fetch: (url: string, init: RequestInit) => Promise<Response>;
	origin: string;
	basePath: string;
	build: string;
	href: () => string;
	reload: (href: string) => boolean;
	go: (url: string, replace: boolean) => unknown;
	assign: (href: string) => void;
};

export type CallTarget = { id: string; name: string; record: { method: "get" | "post" } };

export type Redirect = { to: string; status: number; replace: boolean };

type Wire = {
	status: number;
	data?: unknown;
	message?: string;
	stack?: string;
	digest?: string;
	errors?: { issues: readonly Issue[]; fieldErrors: Record<string, string[]> };
	redirect?: Redirect;
};

// A failed call. `message`, `stack`, and `digest` are the envelope's. A 400 carries `issues` and `fieldErrors`. A
// redirect carries what the client followed (B85).
export class ServerFnError extends Error {
	readonly status: number;
	readonly digest?: string;
	readonly issues?: readonly Issue[];
	readonly fieldErrors?: Record<string, string[]>;
	readonly redirect?: Redirect;

	constructor(wire: Wire) {
		super(wire.message ?? `HTTP ${wire.status}`);
		this.name = "ServerFnError";
		this.status = wire.status;
		if (wire.stack !== undefined) this.stack = wire.stack;
		if (wire.digest !== undefined) this.digest = wire.digest;
		if (wire.errors !== undefined) {
			this.issues = wire.errors.issues;
			this.fieldErrors = wire.errors.fieldErrors;
		}
		if (wire.redirect !== undefined) this.redirect = wire.redirect;
	}
}

// Resolves to the handler's value, or to the Response a handler returned. A failure envelope rejects.
export async function callServerFn(fn: CallTarget, input: unknown, deps: CallDeps): Promise<unknown> {
	return answerOf(await send(fn, input, deps), deps);
}

// A returned Response, marked by the server, resolves untouched, body unread, whatever its status. Otherwise a JSON
// body is the envelope, and anything else is a bare framework status, such as an unknown id or a wrong method.
export async function answerOf(response: Response, deps: CallDeps): Promise<unknown> {
	if (response.headers.get(FN_HEADER) === "response") return response;
	const wire = envelopeOf(await readJson(response));
	if (wire === undefined) throw new ServerFnError({ status: response.status });
	return settle(wire, deps);
}

// The handler has already run when the build differs: one guarded document load, then the call rejects. Either
// side empty is no mismatch (dx/server-fn.md).
export async function send(fn: CallTarget, input: unknown, deps: CallDeps): Promise<Response> {
	const request = fnRequest(fn, input, deps.basePath);
	const response = await deps.fetch(request.url, request.init);
	const build = response.headers.get(BUILD_HEADER) ?? "";
	if (build !== "" && deps.build !== "" && build !== deps.build) {
		deps.reload(deps.href());
		throw new ServerFnError({ status: response.status, message: "The app was updated. Reloading the page" });
	}
	return response;
}

// A same-origin redirect is the internal URL navigation with the envelope's `replace`. An `href` elsewhere is a
// full page load. The call rejects either way, as it does for any failure.
export function settle(wire: Wire, deps: CallDeps): unknown {
	const redirect = wire.redirect;
	if (redirect !== undefined) {
		if (new URL(redirect.to, deps.origin).origin === deps.origin) deps.go(redirect.to, redirect.replace);
		else deps.assign(redirect.to);
		throw new ServerFnError(wire);
	}
	if (wire.status !== 200) throw new ServerFnError(wire);
	return wire.data;
}

async function readJson(response: Response): Promise<unknown> {
	if (!(response.headers.get("content-type") ?? "").startsWith("application/json")) return undefined;
	return response.json();
}

// The envelope is untrusted JSON, read field by field.
export function envelopeOf(value: unknown): Wire | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const status: unknown = Reflect.get(value, "status");
	if (typeof status !== "number") return undefined;
	const wire: Wire = { status, data: Reflect.get(value, "data") };
	for (const key of ["message", "stack", "digest"] as const) {
		const text: unknown = Reflect.get(value, key);
		if (typeof text === "string") wire[key] = text;
	}
	const errors: unknown = Reflect.get(value, "errors");
	if (typeof errors === "object" && errors !== null) wire.errors = shapeIssues(issuesOf(Reflect.get(errors, "issues")));
	const redirect: unknown = Reflect.get(value, "redirect");
	if (typeof redirect === "object" && redirect !== null) {
		const to: unknown = Reflect.get(redirect, "to");
		wire.redirect = { to: String(to), status, replace: Reflect.get(redirect, "replace") === true };
	}
	return wire;
}

// Each issue keeps a string message and a string path. `fieldErrors` is derived from them, as the server does.
function issuesOf(value: unknown): Issue[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item: unknown) => {
		const message: unknown = Reflect.get(Object(item), "message");
		const path: unknown = Reflect.get(Object(item), "path");
		return typeof message === "string" ? [{ message, path: Array.isArray(path) ? path.map(String) : [] }] : [];
	});
}
