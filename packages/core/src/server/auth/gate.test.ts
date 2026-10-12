import { expect, it } from "vitest";
import { notFound, unauthenticated, unauthorized } from "../../shared/errors/http.ts";
import { redirect } from "../../shared/errors/redirect.ts";
import type { EffectiveAuth } from "./effective.ts";
import { gate, type GateInput } from "./gate.ts";

const required: EffectiveAuth = { requires: true, reads: true };
const optional: EffectiveAuth = { requires: false, reads: true };
const session = { id: "ada" };

function input(partial: Omit<GateInput, "readStore"> & { readStore?: () => void }): GateInput {
	return { readStore: () => undefined, ...partial };
}

it("missing session", () => {
	let reads = 0;
	const result = gate(
		input({
			auth: required,
			authenticate: () => null,
			readStore: () => {
				reads += 1;
			},
		}),
	);
	expect(result.status).toBe(401);
	expect(reads).toBe(0);
});

it("optional anonymous", () => {
	const result = gate(input({ auth: optional, authenticate: () => null }));
	expect(result.proceed).toBe(true);
	expect(result.class).toBe("anonymous");
});

it("response route", () => {
	let called = false;
	const result = gate(
		input({
			auth: required,
			authenticate: () => session,
			authorize: () => false,
			response: () => {
				called = true;
			},
		}),
	);
	expect(result.status).toBe(403);
	expect(called).toBe(false);
});

it("response route passes", () => {
	let seen: unknown;
	gate(
		input({
			auth: required,
			authenticate: () => session,
			authorize: () => true,
			response(ctx) {
				seen = ctx.auth;
			},
		}),
	);
	expect(seen).toBe(session);
});

it("authorize throw", () => {
	const thrown = gate(
		input({
			auth: required,
			authenticate: () => session,
			authorize: () => {
				throw new Error("boom");
			},
		}),
	);
	expect(thrown.status).toBe(500);
	const denied = gate(
		input({
			auth: required,
			authenticate: () => session,
			authorize: () => false,
		}),
	);
	expect(denied.status).toBe(403);
});

it("authenticate throw", () => {
	expect(
		gate(
			input({
				auth: required,
				authenticate: () => {
					throw new Error("boom");
				},
			}),
		).status,
	).toBe(500);
	expect(gate(input({ auth: required, authenticate: () => redirect({ to: "/login", status: 302 }) })).status).toBe(302);
	expect(gate(input({ auth: required, authenticate: () => notFound() })).status).toBe(404);
	expect(gate(input({ auth: required, authenticate: () => unauthenticated() })).status).toBe(401);
	expect(gate(input({ auth: required, authenticate: () => unauthorized() })).status).toBe(403);
	expect(gate(input({ auth: required, authenticate: () => undefined })).status).toBe(500);
	expect(gate(input({ auth: required, authenticate: () => null })).status).toBe(401);
});
