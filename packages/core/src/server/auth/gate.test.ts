import { expect, it } from "vitest";
import { notFound, unauthenticated, unauthorized } from "../../shared/errors/http.ts";
import { redirect } from "../../shared/errors/redirect.ts";
import type { EffectiveAuth } from "./effective.ts";
import { gate, type GateInput } from "./gate.ts";

const required: EffectiveAuth = { requires: true, reads: true };
const optional: EffectiveAuth = { requires: false, reads: true };
const session = { id: "ada" };

function input(partial: Partial<GateInput> & Pick<GateInput, "auth" | "authenticate">): GateInput {
	return { kind: "document", shared: true, routes: [], ...partial };
}

function storeSpy(): { reads: number; readStore: () => void } {
	const spy = {
		reads: 0,
		readStore: () => {
			spy.reads += 1;
		},
	};
	return spy;
}

it("missing session", async () => {
	const missing = storeSpy();
	const result = await gate(input({ auth: required, authenticate: () => null, readStore: missing.readStore }));
	expect(result).toEqual({ kind: "status", status: 401 });
	expect(missing.reads).toBe(0);
	const present = storeSpy();
	await gate(input({ auth: required, authenticate: () => session, readStore: present.readStore }));
	expect(present.reads).toBe(1);
});

it("optional anonymous", async () => {
	const store = storeSpy();
	const result = await gate(input({ auth: optional, authenticate: () => null, readStore: store.readStore }));
	expect(result).toEqual({ kind: "proceed", session: null, class: "anonymous" });
	expect(store.reads).toBe(1);
});

it("response route", async () => {
	const store = storeSpy();
	let called = false;
	const result = await gate(
		input({
			auth: required,
			authenticate: () => session,
			routes: [{ id: "admin", authorize: () => false }],
			readStore: store.readStore,
			response: () => {
				called = true;
			},
		}),
	);
	expect(result).toEqual({ kind: "status", status: 403 });
	expect(called).toBe(false);
	expect(store.reads).toBe(0);
});

it("response route passes", async () => {
	const seen: unknown[] = [];
	const store = storeSpy();
	const result = await gate(
		input({
			auth: required,
			authenticate: () => session,
			routes: [{ id: "admin", authorize: () => true }],
			readStore: store.readStore,
			response: (ctx) => seen.push(ctx.auth),
		}),
	);
	expect(result.kind).toBe("proceed");
	expect(seen).toEqual([session]);
	expect(store.reads).toBe(0);
});

it("authorize throw", async () => {
	const boom = new Error("boom");
	const store = storeSpy();
	const thrown = await gate(
		input({
			auth: required,
			authenticate: () => session,
			routes: [
				{
					id: "admin",
					authorize: () => {
						throw boom;
					},
				},
			],
			readStore: store.readStore,
		}),
	);
	expect(thrown).toEqual({ kind: "failed", id: "admin", error: boom });
	const denied = await gate(
		input({
			auth: required,
			authenticate: () => session,
			routes: [{ id: "admin", authorize: () => Promise.resolve(false) }],
			readStore: store.readStore,
		}),
	);
	expect(denied).toEqual({ kind: "status", status: 403 });
	expect(store.reads).toBe(0);
});

async function statusOf(authenticate: () => unknown): Promise<unknown> {
	const result = await gate(input({ auth: required, authenticate }));
	return result.kind === "status" ? result.status : result.kind;
}

it("authenticate throw", async () => {
	expect(
		await statusOf(() => {
			throw new Error("boom");
		}),
	).toBe(500);
	expect(await statusOf(() => redirect({ to: "/login", status: 302 }))).toBe(302);
	expect(await statusOf(() => notFound())).toBe(404);
	expect(await statusOf(() => unauthenticated())).toBe(401);
	expect(await statusOf(() => unauthorized())).toBe(403);
	expect(await statusOf(() => undefined)).toBe(500);
	expect(await statusOf(() => null)).toBe(401);
});
