import { statusOf } from "../../shared/errors/status.ts";
import type { EffectiveAuth } from "./effective.ts";
import { identity, type PolicyClass } from "./identity.ts";

export type GateInput = {
	auth: EffectiveAuth;
	authenticate: () => unknown;
	authorize?: () => boolean;
	response?: (ctx: { auth: unknown }) => void;
	readStore: () => void;
};

export type GateResult = {
	status: number;
	proceed: boolean;
	class?: PolicyClass;
};

type Taken = { ok: true; session: unknown } | { ok: false; status: number };

type Allowed = { ok: true } | { ok: false; status: number };

export function gate(input: GateInput): GateResult {
	const taken = takeSession(input.authenticate);
	if (!taken.ok) return { status: taken.status, proceed: false };
	if (taken.session === null && input.auth.requires) return { status: 401, proceed: false };
	const allowed = allow(input.authorize);
	if (!allowed.ok) return { status: allowed.status, proceed: false };
	if (taken.session === null) return anonymous(input);
	answer(input, taken.session);
	return { status: 200, proceed: true };
}

function takeSession(authenticate: () => unknown): Taken {
	try {
		const session = authenticate();
		if (session === undefined) return { ok: false, status: 500 };
		return { ok: true, session };
	} catch (error) {
		return { ok: false, status: statusOf(error) };
	}
}

function allow(authorize: GateInput["authorize"]): Allowed {
	if (authorize === undefined) return { ok: true };
	try {
		if (authorize()) return { ok: true };
		return { ok: false, status: 403 };
	} catch (error) {
		return { ok: false, status: statusOf(error) };
	}
}

function anonymous(input: GateInput): GateResult {
	answer(input, null);
	return { status: 200, proceed: true, class: identity(input.auth, null).class };
}

function answer(input: GateInput, session: unknown): void {
	if (input.response === undefined) return;
	input.response({ auth: session });
}
