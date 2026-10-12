import { UnauthenticatedError, UnauthorizedError } from "../../shared/errors/http.ts";
import { statusOf } from "../../shared/errors/status.ts";
import type { RequestKind } from "../loaders/cascade.ts";
import { effectiveAuth, type AuthModule } from "./effective.ts";
import { identity, type PolicyClass } from "./identity.ts";

export type AuthContext = { auth: unknown };

export type GateRoute = {
	id: string;
	auth?: AuthModule;
	preloader?: (ctx: AuthContext) => unknown;
	authorize?: (ctx: AuthContext) => boolean | Promise<boolean>;
};

export type GateInput = {
	kind: RequestKind;
	authenticate: () => unknown;
	routes: readonly GateRoute[];
	shared?: boolean;
	readStore?: () => void;
	response?: (ctx: AuthContext) => void;
};

// "status" is an authenticate failure, a bare HTTP status for the whole chain. "stopped" fails the match at
// `index` and skips everything inside it. Matches outside it still load (B27, B29, B82).
export type GateResult =
	| { kind: "proceed"; session: unknown; class: PolicyClass }
	| { kind: "status"; status: number }
	| { kind: "stopped"; index: number; session: unknown; error: unknown };

type Taken = { kind: "session"; session: unknown } | { kind: "status"; status: number };

// Steps 10 and 11 of 02-system: authenticate once, then per match from the root down a null-session check,
// preloader, and authorize, then the store read.
export async function gate(input: GateInput): Promise<GateResult> {
	const auth = effectiveAuth(input.routes.map((route) => route.auth ?? {}));
	const taken = await takeSession(auth.reads, input.authenticate);
	if (taken.kind === "status") return taken;
	const session = taken.session;
	const ctx = { auth: session };
	for (const [index, route] of input.routes.entries()) {
		const failed = await guard(route, ctx);
		if (failed !== undefined) return { kind: "stopped", index, session, error: failed.error };
	}
	if (input.response !== undefined) input.response(ctx);
	else if (input.kind === "document" && input.shared === true) input.readStore?.();
	return { kind: "proceed", session, class: identity(auth, session).class };
}

// A public chain does not call authenticate. Returning null is the only anonymous signal.
async function takeSession(reads: boolean, authenticate: () => unknown): Promise<Taken> {
	if (!reads) return { kind: "session", session: null };
	try {
		const session = await authenticate();
		if (session === undefined) return { kind: "status", status: 500 };
		return { kind: "session", session };
	} catch (error) {
		return { kind: "status", status: statusOf(error) };
	}
}

// Parent before child: this match's preloader and authorize settle before the next match starts.
async function guard(route: GateRoute, ctx: AuthContext): Promise<{ error: unknown } | undefined> {
	if (ctx.auth === null && route.auth?.authenticate === true) return { error: new UnauthenticatedError() };
	try {
		await route.preloader?.(ctx);
		if (route.authorize !== undefined && !(await route.authorize(ctx))) return { error: new UnauthorizedError() };
		return undefined;
	} catch (error) {
		return { error };
	}
}
