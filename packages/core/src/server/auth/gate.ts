import { statusOf } from "../../shared/errors/status.ts";
import type { RequestKind } from "../loaders/cascade.ts";
import type { EffectiveAuth } from "./effective.ts";
import { identity, type PolicyClass } from "./identity.ts";

export type AuthContext = { auth: unknown };

export type GateRoute = {
	id: string;
	preloader?: (ctx: AuthContext) => unknown;
	authorize?: (ctx: AuthContext) => boolean | Promise<boolean>;
};

export type GateInput = {
	kind: RequestKind;
	auth: EffectiveAuth;
	authenticate: () => unknown;
	routes: readonly GateRoute[];
	shared?: boolean;
	readStore?: () => void;
	response?: (ctx: AuthContext) => void;
};

// "status" is a bare HTTP status. "failed" is a preloader or authorize throw, which is the loader-throw
// outcome and is not 403 (B82).
export type GateResult =
	| { kind: "proceed"; session: unknown; class: PolicyClass }
	| { kind: "status"; status: number }
	| { kind: "failed"; id: string; error: unknown };

type Taken = { kind: "session"; session: unknown } | { kind: "status"; status: number };

// Steps 10 and 11 of 02-system, in order: authenticate, 401, preloader, authorize, then the store read.
export async function gate(input: GateInput): Promise<GateResult> {
	const taken = await takeSession(input);
	if (taken.kind === "status") return taken;
	const session = taken.session;
	if (session === null && input.auth.requires) return { kind: "status", status: 401 };
	const ctx = { auth: session };
	const blocked = (await preloadAll(input.routes, ctx)) ?? (await authorizeAll(input.routes, ctx));
	if (blocked !== undefined) return blocked;
	if (input.response !== undefined) input.response(ctx);
	else if (input.kind === "document" && input.shared === true) input.readStore?.();
	return { kind: "proceed", session, class: identity(input.auth, session).class };
}

// A public chain does not call authenticate. Returning null is the only anonymous signal.
async function takeSession(input: GateInput): Promise<Taken> {
	if (!input.auth.reads) return { kind: "session", session: null };
	try {
		const session = await input.authenticate();
		if (session === undefined) return { kind: "status", status: 500 };
		return { kind: "session", session };
	} catch (error) {
		return { kind: "status", status: statusOf(error) };
	}
}

async function preloadAll(routes: readonly GateRoute[], ctx: AuthContext): Promise<GateResult | undefined> {
	for (const route of routes) {
		try {
			await route.preloader?.(ctx);
		} catch (error) {
			return { kind: "failed", id: route.id, error };
		}
	}
	return undefined;
}

async function authorizeAll(routes: readonly GateRoute[], ctx: AuthContext): Promise<GateResult | undefined> {
	for (const route of routes) {
		try {
			if (route.authorize !== undefined && !(await route.authorize(ctx))) return { kind: "status", status: 403 };
		} catch (error) {
			return { kind: "failed", id: route.id, error };
		}
	}
	return undefined;
}
