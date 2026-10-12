import { expect, it } from "vitest";
import {
	notFound,
	unauthenticated,
	UnauthenticatedError,
	unauthorized,
	UnauthorizedError,
} from "../../shared/errors/http.ts";
import { redirect } from "../../shared/errors/redirect.ts";
import { statusOf } from "../../shared/errors/status.ts";
import type { AuthModule } from "./effective.ts";
import { gate, type GateInput, type GateRoute } from "./gate.ts";

const required: AuthModule = { authenticate: true };
const optional: AuthModule = { authenticateOptional: true };
const session = { id: "ada" };

function input(partial: Partial<GateInput> & Pick<GateInput, "authenticate">): GateInput {
	return { kind: "document", shared: true, routes: [{ id: "page", auth: required }], ...partial };
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
	const seen: string[] = [];
	const missing = storeSpy();
	const routes: GateRoute[] = [
		{ id: "outer", preloader: () => seen.push("outer") },
		{ id: "inner", auth: required, preloader: () => seen.push("inner") },
		{ id: "page", preloader: () => seen.push("page") },
	];
	const result = await gate(input({ authenticate: () => null, routes, readStore: missing.readStore }));
	expect(result).toEqual({ kind: "stopped", index: 1, session: null, error: new UnauthenticatedError() });
	expect(seen).toEqual(["outer"]);
	expect(missing.reads).toBe(0);
	const present = storeSpy();
	const signedIn = await gate(input({ authenticate: () => session, readStore: present.readStore }));
	expect(signedIn).toEqual({ kind: "proceed", session, class: "required" });
	expect(present.reads).toBe(0);
});

it("optional anonymous", async () => {
	const store = storeSpy();
	const result = await gate(
		input({ authenticate: () => null, routes: [{ id: "page", auth: optional }], readStore: store.readStore }),
	);
	expect(result).toEqual({ kind: "proceed", session: null, class: "anonymous" });
	expect(store.reads).toBe(1);
	const signedIn = await gate(
		input({ authenticate: () => session, routes: [{ id: "page", auth: optional }], readStore: store.readStore }),
	);
	expect(signedIn).toEqual({ kind: "proceed", session, class: "anonymous" });
	expect(store.reads).toBe(2);
});

it("response route", async () => {
	const store = storeSpy();
	let called = false;
	const result = await gate(
		input({
			authenticate: () => session,
			routes: [{ id: "admin", auth: required, authorize: () => false }],
			readStore: store.readStore,
			response: () => {
				called = true;
			},
		}),
	);
	expect(result).toEqual({ kind: "stopped", index: 0, session, error: new UnauthorizedError() });
	expect(called).toBe(false);
	expect(store.reads).toBe(0);
});

it("response route passes", async () => {
	const seen: unknown[] = [];
	const store = storeSpy();
	const result = await gate(
		input({
			authenticate: () => session,
			routes: [{ id: "admin", auth: required, authorize: () => true }],
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
			authenticate: () => session,
			routes: [
				{
					id: "admin",
					auth: required,
					authorize: () => {
						throw boom;
					},
				},
			],
			readStore: store.readStore,
		}),
	);
	expect(thrown).toEqual({ kind: "stopped", index: 0, session, error: boom });
	const denied = await gate(
		input({
			authenticate: () => session,
			routes: [{ id: "admin", auth: required, authorize: () => Promise.resolve(false) }],
			readStore: store.readStore,
		}),
	);
	expect(denied).toEqual({ kind: "stopped", index: 0, session, error: new UnauthorizedError() });
	expect(store.reads).toBe(0);
});

async function outcome(authenticate: () => unknown): Promise<number> {
	const result = await gate(input({ authenticate }));
	if (result.kind === "status") return result.status;
	if (result.kind === "stopped") return statusOf(result.error);
	return 200;
}

it("authenticate throw", async () => {
	expect(
		await outcome(() => {
			throw new Error("boom");
		}),
	).toBe(500);
	expect(await outcome(() => redirect({ to: "/login", status: 302 }))).toBe(302);
	expect(await outcome(() => notFound())).toBe(404);
	expect(await outcome(() => unauthenticated())).toBe(401);
	expect(await outcome(() => unauthorized())).toBe(403);
	expect(await outcome(() => undefined)).toBe(500);
	expect(await outcome(() => null)).toBe(401);
	expect(await outcome(() => session)).toBe(200);
});
