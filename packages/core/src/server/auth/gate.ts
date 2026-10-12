import { UnauthenticatedError, UnauthorizedError } from "../../shared/errors/http.ts";
import { statusOf } from "../../shared/errors/status.ts";
import type { ChainAuth, PreloaderContext, Respond, StepContext } from "../../shared/route-builder/chain.ts";
import type { RequestKind } from "../loaders/cascade.ts";
import { effectiveAuth } from "./effective.ts";
import { identity, type PolicyClass } from "./identity.ts";

export type GateRoute = {
	id: string;
	auth?: ChainAuth;
	preloader?: (ctx: StepContext) => unknown;
	authorize?: (ctx: StepContext) => boolean | Promise<boolean>;
};

export type GateInput = {
	kind: RequestKind;
	request: Request;
	env: unknown;
	authenticate: () => unknown;
	routes: readonly GateRoute[];
	shared?: boolean;
	readStore?: () => void;
	response?: Respond;
};

// "status" is an authenticate failure, a bare HTTP status for the whole chain. "stopped" fails the match at
// `index` and skips everything inside it. Matches outside it still load (B27, B29, B82).
// `contexts` holds the preloader context accumulated through each match that passed, root down.
export type GateResult =
	| {
			kind: "proceed";
			session: unknown;
			class: PolicyClass;
			contexts: PreloaderContext[];
			answer?: Response | Promise<Response>;
	  }
	| { kind: "status"; status: number; thrown?: unknown }
	| { kind: "stopped"; index: number; session: unknown; error: unknown; contexts: PreloaderContext[] };

// `thrown` is what authenticate threw, so a redirect() there can still build its Location.
type Taken = { kind: "session"; session: unknown } | { kind: "status"; status: number; thrown?: unknown };

type Guarded = { ok: true; added: unknown } | { ok: false; error: unknown };

// Steps 10 and 11 of 02-system: authenticate once, then per match from the root down a null-session check,
// preloader, and authorize, then the store read.
export async function gate(input: GateInput): Promise<GateResult> {
	const auth = effectiveAuth(input.routes);
	const taken = await takeSession(auth.reads, input.authenticate);
	if (taken.kind === "status") return taken;
	const session = taken.session;
	const base = { auth: session, request: input.request, env: input.env };
	const contexts: PreloaderContext[] = [];
	let latest: PreloaderContext = {};
	for (const [index, route] of input.routes.entries()) {
		const guarded = await guard(route, index === 0 ? base : { ...base, preloaderContext: latest });
		if (!guarded.ok) return { kind: "stopped", index, session, error: guarded.error, contexts };
		latest = merge(latest, guarded.added);
		contexts.push(latest);
	}
	const policy = identity(auth, session).class;
	// A .response() page answers here. It never reads the store.
	if (input.response !== undefined) {
		const answer = input.response({ ...base, preloaderContext: latest });
		return { kind: "proceed", session, class: policy, contexts, answer };
	}
	if (readsStore(input, policy)) input.readStore?.();
	return { kind: "proceed", session, class: policy, contexts };
}

// Only a shared document reads the store, and a required chain never does (B27).
function readsStore(input: GateInput, policy: PolicyClass): boolean {
	return input.kind === "document" && input.shared === true && policy !== "required";
}

// A shallow merge, outside-in: the child key wins, and a return that is not an object adds nothing.
function merge(parents: PreloaderContext, added: unknown): PreloaderContext {
	if (typeof added !== "object" || added === null) return parents;
	return { ...parents, ...added };
}

// A public chain does not call authenticate. Returning null is the only anonymous signal.
async function takeSession(reads: boolean, authenticate: () => unknown): Promise<Taken> {
	if (!reads) return { kind: "session", session: null };
	try {
		const session = await authenticate();
		if (session === undefined) return { kind: "status", status: 500 };
		return { kind: "session", session };
	} catch (error) {
		return { kind: "status", status: statusOf(error), thrown: error };
	}
}

// Parent before child: this match's preloader and authorize settle before the next match starts. Both see
// the parents' context, not this match's own return (dx/types.md).
async function guard(route: GateRoute, ctx: StepContext): Promise<Guarded> {
	if (ctx.auth === null && route.auth?.mode === true) return { ok: false, error: new UnauthenticatedError() };
	try {
		const added = await route.preloader?.(ctx);
		if (route.authorize !== undefined && !(await route.authorize(ctx))) {
			return { ok: false, error: new UnauthorizedError() };
		}
		return { ok: true, added };
	} catch (error) {
		return { ok: false, error };
	}
}
