import { describe, expect, it } from "vitest";
import { createDeferContext } from "../../../src/defer/index.ts";
import { NotFoundError, RedirectResponse } from "../../../src/errors/index.ts";
import type { PipelineMatch } from "../../../src/loader-pipeline/index.ts";
import {
	createNDJSONResponse,
	createRedirectNDJSONResponse,
	createStreamingNDJSONResponse,
	formatChunkMessage,
	formatDoneMessage,
	formatErrorMessage,
	formatHeadMessage,
	formatLoaderMessage,
	formatReadyMessage,
	formatRedirectMessage,
	serializeLoaderData,
} from "../../../src/ndjson-server/index.ts";

function makeMatch(overrides?: Partial<PipelineMatch>): PipelineMatch {
	return {
		deferContext: createDeferContext("m1"),
		loaderData: undefined,
		matchId: "m1",
		preloaderContext: {},
		route: { _type: "render", variablePath: "/", virtualPath: "_root_" },
		status: "success",
		...overrides,
	};
}

function parseLines(body: string): unknown[] {
	return body
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

describe("message formatting", () => {
	it("formatLoaderMessage → JSON with t:l, m, d", () => {
		const match = makeMatch({ loaderData: { greeting: "hi" }, matchId: "r1" });
		const msg = formatLoaderMessage(match);
		const parsed = JSON.parse(msg);
		expect(parsed.t).toBe("l");
		expect(parsed.m).toBe("r1");
		expect(parsed.d).toEqual({ greeting: "hi" });
	});

	it("formatLoaderMessage includes preloaderContext when present", () => {
		const match = makeMatch({ matchId: "r1", preloaderContext: { user: { id: "1" } } });
		const parsed = JSON.parse(formatLoaderMessage(match));
		expect(parsed.p).toEqual({ user: { id: "1" } });
	});

	it("formatLoaderMessage omits p when preloaderContext empty", () => {
		const match = makeMatch({ matchId: "r1", preloaderContext: {} });
		const parsed = JSON.parse(formatLoaderMessage(match));
		expect(parsed.p).toBeUndefined();
	});

	it("formatChunkMessage → JSON with t:c, m, k, d", () => {
		const msg = formatChunkMessage("r1", "d0", { resolved: true });
		const parsed = JSON.parse(msg);
		expect(parsed.t).toBe("c");
		expect(parsed.m).toBe("r1");
		expect(parsed.k).toBe("d0");
		expect(parsed.d).toEqual({ resolved: true });
	});

	it("formatErrorMessage without key → t:e, m, e.message", () => {
		const msg = formatErrorMessage("r1", new Error("boom"));
		const parsed = JSON.parse(msg);
		expect(parsed.t).toBe("e");
		expect(parsed.m).toBe("r1");
		expect(parsed.e.message).toBe("boom");
		expect(parsed.k).toBeUndefined();
	});

	it("formatErrorMessage with key → includes k", () => {
		const msg = formatErrorMessage("r1", new Error("fail"), "d0");
		const parsed = JSON.parse(msg);
		expect(parsed.t).toBe("e");
		expect(parsed.k).toBe("d0");
	});

	it("formatErrorMessage excludes stack trace", () => {
		const err = new Error("boom");
		err.stack = "Error: boom\n    at test.ts:1:1";
		const msg = formatErrorMessage("r1", err);
		expect(msg).not.toContain("at test.ts");
	});

	it("formatHeadMessage → t:h, d:HeadConfig, m", () => {
		const msg = formatHeadMessage("r1", { title: "Page" });
		const parsed = JSON.parse(msg);
		expect(parsed.t).toBe("h");
		expect(parsed.m).toBe("r1");
		expect(parsed.d).toEqual({ title: "Page" });
	});

	it("formatHeadMessage survives non-serializable head config", () => {
		const circular: Record<string, unknown> = { title: "Page" };
		circular.self = circular;
		const msg = formatHeadMessage("r1", circular as never);
		const parsed = JSON.parse(msg);
		expect(parsed.t).toBe("h");
		expect(parsed.m).toBe("r1");
	});

	it("formatRedirectMessage → t:x, u, s, r?", () => {
		const msg = formatRedirectMessage("/login", 302);
		const parsed = JSON.parse(msg);
		expect(parsed.t).toBe("x");
		expect(parsed.u).toBe("/login");
		expect(parsed.s).toBe(302);
		expect(parsed.r).toBeUndefined();
	});

	it("formatRedirectMessage with replace → r:true", () => {
		const parsed = JSON.parse(formatRedirectMessage("/login", 302, true));
		expect(parsed.r).toBe(true);
	});

	it("formatRedirectMessage with external → xl:true", () => {
		const parsed = JSON.parse(formatRedirectMessage("https://example.com", 302, undefined, true));
		expect(parsed.xl).toBe(true);
	});

	it("formatRedirectMessage without external → no xl field", () => {
		const parsed = JSON.parse(formatRedirectMessage("/local", 302));
		expect(parsed.xl).toBeUndefined();
	});

	it("formatReadyMessage → t:r", () => {
		expect(JSON.parse(formatReadyMessage()).t).toBe("r");
	});

	it("formatDoneMessage → t:d", () => {
		expect(JSON.parse(formatDoneMessage()).t).toBe("d");
	});

	it("all messages valid JSON", () => {
		const messages = [
			formatLoaderMessage(makeMatch({ loaderData: "x" })),
			formatChunkMessage("m", "k", "d"),
			formatErrorMessage("m", new Error("e")),
			formatHeadMessage("m", { title: "t" }),
			formatRedirectMessage("/u", 302),
			formatReadyMessage(),
			formatDoneMessage(),
		];
		for (const msg of messages) {
			expect(() => JSON.parse(msg)).not.toThrow();
		}
	});
});

describe("serializeLoaderData", () => {
	it("primitive → unchanged", () => {
		expect(serializeLoaderData("hello")).toBe("hello");
		expect(serializeLoaderData(42)).toBe(42);
		expect(serializeLoaderData(true)).toBe(true);
	});

	it("object with no deferred → unchanged", () => {
		const data = { a: 1, b: "two" };
		expect(serializeLoaderData(data)).toEqual(data);
	});

	it("object with Deferred → promise stripped", () => {
		const data = { __deferred: true, key: "d0", promise: Promise.resolve("x") };
		const result = serializeLoaderData(data) as Record<string, unknown>;
		expect(result.__deferred).toBe(true);
		expect(result.key).toBe("d0");
		expect(result.promise).toBeUndefined();
	});

	it("nested deferred → found at depth", () => {
		const data = { a: { b: { __deferred: true, key: "n", promise: Promise.resolve(1) } } };
		const result = serializeLoaderData(data) as Record<string, Record<string, Record<string, unknown>>>;
		expect(result.a.b.__deferred).toBe(true);
		expect(result.a.b.promise).toBeUndefined();
	});

	it("array with deferred → serialized", () => {
		const data = [{ __deferred: true, key: "d0", promise: Promise.resolve(1) }, "x"];
		const result = serializeLoaderData(data) as unknown[];
		expect((result[0] as Record<string, unknown>).__deferred).toBe(true);
		expect((result[0] as Record<string, unknown>).promise).toBeUndefined();
		expect(result[1]).toBe("x");
	});

	it("null/undefined → pass through", () => {
		expect(serializeLoaderData(null)).toBeNull();
		expect(serializeLoaderData(undefined)).toBeUndefined();
	});

	it("circular reference → null instead of stack overflow", () => {
		const a: Record<string, unknown> = { name: "a" };
		const b: Record<string, unknown> = { name: "b", ref: a };
		a.ref = b;
		const result = serializeLoaderData(a) as Record<string, unknown>;
		expect(result.name).toBe("a");
		const nested = result.ref as Record<string, unknown>;
		expect(nested.name).toBe("b");
		/* b.ref → a is circular, should be null */
		expect(nested.ref).toBeNull();
	});

	it("self-referencing object → null on cycle", () => {
		const obj: Record<string, unknown> = { value: 1 };
		obj.self = obj;
		const result = serializeLoaderData(obj) as Record<string, unknown>;
		expect(result.value).toBe(1);
		expect(result.self).toBeNull();
	});

	it("circular reference in array → null on cycle", () => {
		const obj: Record<string, unknown> = { items: [] };
		(obj.items as unknown[]).push(obj);
		const result = serializeLoaderData(obj) as Record<string, unknown>;
		expect(Array.isArray(result.items)).toBe(true);
		expect((result.items as unknown[])[0]).toBeNull();
	});

	it("diamond reference preserved (shared object not nulled)", () => {
		const shared = { id: 1, name: "shared" };
		const data = { a: shared, b: shared };
		const result = serializeLoaderData(data) as Record<string, Record<string, unknown>>;
		expect(result.a.id).toBe(1);
		expect(result.b.id).toBe(1);
		expect(result.b).not.toBeNull();
	});
});

describe("createNDJSONResponse (non-streaming)", () => {
	it("single route, no deferred → loader + head + ready + done", async () => {
		const match = makeMatch({ headConfig: { title: "Page" }, loaderData: { x: 1 }, matchId: "r1" });
		const resp = createNDJSONResponse({ deferContexts: new Map(), matches: [match] });
		const body = await resp.text();
		const msgs = parseLines(body);
		expect(msgs).toHaveLength(4);
		expect((msgs[0] as Record<string, unknown>).t).toBe("l");
		expect((msgs[1] as Record<string, unknown>).t).toBe("h");
		expect((msgs[2] as Record<string, unknown>).t).toBe("r");
		expect((msgs[3] as Record<string, unknown>).t).toBe("d");
	});

	it("multiple routes → one loader per route", async () => {
		const m1 = makeMatch({ loaderData: "a", matchId: "r1" });
		const m2 = makeMatch({ loaderData: "b", matchId: "r2" });
		const resp = createNDJSONResponse({ deferContexts: new Map(), matches: [m1, m2] });
		const msgs = parseLines(await resp.text());
		const loaders = msgs.filter((m) => (m as Record<string, unknown>).t === "l");
		expect(loaders).toHaveLength(2);
	});

	it("route without head → no head message for that route", async () => {
		const match = makeMatch({ loaderData: "a", matchId: "r1" });
		const resp = createNDJSONResponse({ deferContexts: new Map(), matches: [match] });
		const msgs = parseLines(await resp.text());
		const heads = msgs.filter((m) => (m as Record<string, unknown>).t === "h");
		expect(heads).toHaveLength(0);
	});

	it("Content-Type: application/x-ndjson", async () => {
		const resp = createNDJSONResponse({ deferContexts: new Map(), matches: [] });
		expect(resp.headers.get("Content-Type")).toBe("application/x-ndjson");
	});

	it("Cache-Control: no-store", async () => {
		const resp = createNDJSONResponse({ deferContexts: new Map(), matches: [] });
		expect(resp.headers.get("Cache-Control")).toBe("no-store");
	});

	it("HTTP status 200", () => {
		const resp = createNDJSONResponse({ deferContexts: new Map(), matches: [] });
		expect(resp.status).toBe(200);
	});

	it("empty matches → ready + done messages", async () => {
		const resp = createNDJSONResponse({ deferContexts: new Map(), matches: [] });
		const msgs = parseLines(await resp.text());
		expect(msgs).toHaveLength(2);
		expect((msgs[0] as Record<string, unknown>).t).toBe("r");
		expect((msgs[1] as Record<string, unknown>).t).toBe("d");
	});

	it("loader error → t:e message instead of t:l", async () => {
		const match = makeMatch({ error: new Error("boom"), matchId: "r1", status: "error" });
		const resp = createNDJSONResponse({ deferContexts: new Map(), matches: [match] });
		const msgs = parseLines(await resp.text());
		const errors = msgs.filter((m) => (m as Record<string, unknown>).t === "e");
		expect(errors).toHaveLength(1);
		expect((errors[0] as Record<string, unknown>).m).toBe("r1");
	});
});

describe("createStreamingNDJSONResponse", () => {
	it("loader messages sent first, then heads, then ready, then done", async () => {
		const match = makeMatch({ headConfig: { title: "P" }, loaderData: "x", matchId: "r1" });
		const resp = createStreamingNDJSONResponse({ deferContexts: new Map(), matches: [match] });
		const body = await resp.text();
		const msgs = parseLines(body);
		const types = msgs.map((m) => (m as Record<string, unknown>).t);
		expect(types).toEqual(["l", "h", "r", "d"]);
	});

	it("chunk messages stream as promises resolve", async () => {
		const ctx = createDeferContext("r1");
		ctx.defer(() => Promise.resolve("resolved-data"), { key: "d0" });
		const match = makeMatch({ deferContext: ctx, loaderData: "x", matchId: "r1" });
		const deferContexts = new Map([["r1", ctx]]);
		const resp = createStreamingNDJSONResponse({ deferContexts, matches: [match] });
		const body = await resp.text();
		const msgs = parseLines(body);
		const chunks = msgs.filter((m) => (m as Record<string, unknown>).t === "c");
		expect(chunks).toHaveLength(1);
		expect((chunks[0] as Record<string, unknown>).d).toBe("resolved-data");
	});

	it("error message for rejected deferred (with key)", async () => {
		const ctx = createDeferContext("r1");
		ctx.defer(() => Promise.reject(new Error("defer-fail")), { key: "d0" });
		const match = makeMatch({ deferContext: ctx, loaderData: "x", matchId: "r1" });
		const deferContexts = new Map([["r1", ctx]]);
		const resp = createStreamingNDJSONResponse({ deferContexts, matches: [match] });
		const body = await resp.text();
		const msgs = parseLines(body);
		const errors = msgs.filter((m) => (m as Record<string, unknown>).t === "e");
		expect(errors).toHaveLength(1);
		const err = errors[0] as Record<string, unknown>;
		expect(err.k).toBe("d0");
		expect((err.e as Record<string, unknown>).message).toBe("defer-fail");
	});

	it("done message after all settled", async () => {
		const ctx = createDeferContext("r1");
		ctx.defer(() => Promise.resolve("ok"), { key: "d0" });
		const match = makeMatch({ deferContext: ctx, loaderData: "x", matchId: "r1" });
		const deferContexts = new Map([["r1", ctx]]);
		const resp = createStreamingNDJSONResponse({ deferContexts, matches: [match] });
		const body = await resp.text();
		const msgs = parseLines(body);
		const lastMsg = msgs[msgs.length - 1] as Record<string, unknown>;
		expect(lastMsg.t).toBe("d");
	});

	it("multiple deferred across routes → all tracked", async () => {
		const ctx1 = createDeferContext("r1");
		const ctx2 = createDeferContext("r2");
		ctx1.defer(() => Promise.resolve("a"), { key: "d0" });
		ctx2.defer(() => Promise.resolve("b"), { key: "d1" });
		const m1 = makeMatch({ deferContext: ctx1, loaderData: "x", matchId: "r1" });
		const m2 = makeMatch({ deferContext: ctx2, loaderData: "y", matchId: "r2" });
		const deferContexts = new Map([
			["r1", ctx1],
			["r2", ctx2],
		]);
		const resp = createStreamingNDJSONResponse({ deferContexts, matches: [m1, m2] });
		const body = await resp.text();
		const msgs = parseLines(body);
		const chunks = msgs.filter((m) => (m as Record<string, unknown>).t === "c");
		expect(chunks).toHaveLength(2);
	});
});

describe("createRedirectNDJSONResponse", () => {
	it("only redirect + done messages", async () => {
		const redirect = new RedirectResponse({ to: "/login" });
		const resp = createRedirectNDJSONResponse(redirect);
		const msgs = parseLines(await resp.text());
		expect(msgs).toHaveLength(2);
		expect((msgs[0] as Record<string, unknown>).t).toBe("x");
		expect((msgs[1] as Record<string, unknown>).t).toBe("d");
	});

	it("status from RedirectResponse", async () => {
		const redirect = new RedirectResponse({ status: 301, to: "/new" });
		const resp = createRedirectNDJSONResponse(redirect);
		const msgs = parseLines(await resp.text());
		expect((msgs[0] as Record<string, unknown>).s).toBe(301);
	});

	it("URL from RedirectResponse", async () => {
		const redirect = new RedirectResponse({ to: "/target" });
		const resp = createRedirectNDJSONResponse(redirect);
		const msgs = parseLines(await resp.text());
		expect((msgs[0] as Record<string, unknown>).u).toBe("/target");
	});

	it("replace flag preserved if true", async () => {
		const redirect = new RedirectResponse({ replace: true, to: "/x" });
		const resp = createRedirectNDJSONResponse(redirect);
		const msgs = parseLines(await resp.text());
		expect((msgs[0] as Record<string, unknown>).r).toBe(true);
	});

	it("Cache-Control: no-store", () => {
		const redirect = new RedirectResponse({ to: "/x" });
		const resp = createRedirectNDJSONResponse(redirect);
		expect(resp.headers.get("Cache-Control")).toBe("no-store");
	});

	it("external redirect → xl:true in message", async () => {
		const redirect = new RedirectResponse({ href: "https://example.com/login" });
		const resp = createRedirectNDJSONResponse(redirect);
		const msgs = parseLines(await resp.text());
		expect((msgs[0] as Record<string, unknown>).xl).toBe(true);
		expect((msgs[0] as Record<string, unknown>).u).toBe("https://example.com/login");
	});

	it("internal redirect → no xl field", async () => {
		const redirect = new RedirectResponse({ to: "/login" });
		const resp = createRedirectNDJSONResponse(redirect);
		const msgs = parseLines(await resp.text());
		expect((msgs[0] as Record<string, unknown>).xl).toBeUndefined();
	});
});

describe("error handling", () => {
	it("loader error → t:e message with matchId, no key", async () => {
		const match = makeMatch({ error: new Error("oops"), matchId: "r1", status: "error" });
		const resp = createNDJSONResponse({ deferContexts: new Map(), matches: [match] });
		const msgs = parseLines(await resp.text());
		const err = msgs.find((m) => (m as Record<string, unknown>).t === "e") as Record<string, unknown>;
		expect(err.m).toBe("r1");
		expect(err.k).toBeUndefined();
	});

	it("multiple errors → each sent separately", async () => {
		const m1 = makeMatch({ error: new Error("e1"), matchId: "r1", status: "error" });
		const m2 = makeMatch({ error: new Error("e2"), matchId: "r2", status: "error" });
		const resp = createNDJSONResponse({ deferContexts: new Map(), matches: [m1, m2] });
		const msgs = parseLines(await resp.text());
		const errors = msgs.filter((m) => (m as Record<string, unknown>).t === "e");
		expect(errors).toHaveLength(2);
	});

	it("all loaders errored → error messages + done", async () => {
		const m1 = makeMatch({ error: new Error("e1"), matchId: "r1", status: "error" });
		const resp = createNDJSONResponse({ deferContexts: new Map(), matches: [m1] });
		const msgs = parseLines(await resp.text());
		const types = msgs.map((m) => (m as Record<string, unknown>).t);
		expect(types).toContain("e");
		expect(types).toContain("d");
		expect(types).not.toContain("l");
	});
});

/* ── formatErrorMessage preserves error.name ───────────────────────── */

describe("formatErrorMessage name preservation", () => {
	it("custom error name → serialized in e.name", () => {
		const err = new Error("custom boom");
		err.name = "CustomError";
		const parsed = JSON.parse(formatErrorMessage("r1", err)) as Record<string, Record<string, unknown>>;
		expect(parsed.e.name).toBe("CustomError");
		expect(parsed.e.message).toBe("custom boom");
	});

	it("NotFoundError → name: NotFoundError", () => {
		const err = new NotFoundError("gone");
		const parsed = JSON.parse(formatErrorMessage("r1", err)) as Record<string, Record<string, unknown>>;
		expect(parsed.e.name).toBe("NotFoundError");
	});
});

/* ── buildMatchLines: status vs error property ─────────────────────── */

describe("buildMatchLines edge cases", () => {
	it("status !== 'error' with error property → sends loader message (not error)", async () => {
		const match = makeMatch({
			error: new Error("ignored"),
			loaderData: "fallback",
			matchId: "r1",
			status: "success",
		});
		const resp = createNDJSONResponse({ deferContexts: new Map(), matches: [match] });
		const msgs = parseLines(await resp.text());
		const types = msgs.map((m) => (m as Record<string, unknown>).t);
		expect(types).not.toContain("e");
		expect(types).toContain("l");
	});

	it("status === 'error' without error property → sends loader message", async () => {
		const match = makeMatch({
			loaderData: "data",
			matchId: "r1",
			status: "error",
		});
		/* Remove the error property entirely */
		delete (match as unknown as Record<string, unknown>).error;
		const resp = createNDJSONResponse({ deferContexts: new Map(), matches: [match] });
		const msgs = parseLines(await resp.text());
		const types = msgs.map((m) => (m as Record<string, unknown>).t);
		/* Both conditions must be true: status === "error" && match.error */
		expect(types).toContain("l");
		expect(types).not.toContain("e");
	});
});

/* ── Streaming: deferred rejects with non-Error ────────────────────── */

describe("streaming deferred non-Error rejection", () => {
	it("deferred rejecting with string → wrapped in Error", async () => {
		const ctx = createDeferContext("r1");
		ctx.defer(() => Promise.reject("string-rejection"), { key: "d0" });
		const match = makeMatch({ deferContext: ctx, loaderData: "x", matchId: "r1" });
		const deferContexts = new Map([["r1", ctx]]);
		const resp = createStreamingNDJSONResponse({ deferContexts, matches: [match] });
		const body = await resp.text();
		const msgs = parseLines(body);
		const errors = msgs.filter((m) => (m as Record<string, unknown>).t === "e");
		expect(errors).toHaveLength(1);
		const err = errors[0] as Record<string, Record<string, unknown>>;
		expect(err.e.message).toBe("string-rejection");
		expect(err.k).toBe("d0");
	});

	it("deferred rejecting with number → wrapped in Error(String(n))", async () => {
		const ctx = createDeferContext("r1");
		ctx.defer(() => Promise.reject(42), { key: "d0" });
		const match = makeMatch({ deferContext: ctx, loaderData: "x", matchId: "r1" });
		const deferContexts = new Map([["r1", ctx]]);
		const resp = createStreamingNDJSONResponse({ deferContexts, matches: [match] });
		const body = await resp.text();
		const msgs = parseLines(body);
		const errors = msgs.filter((m) => (m as Record<string, unknown>).t === "e");
		expect(errors).toHaveLength(1);
		expect((errors[0] as Record<string, Record<string, unknown>>).e.message).toBe("42");
	});
});

/* ── createRedirectNDJSONResponse: replace false → no r field ──────── */

describe("redirect replace field", () => {
	it("replace: false → r:false in message (not omitted)", async () => {
		const redirect = new RedirectResponse({ replace: false, to: "/x" });
		const resp = createRedirectNDJSONResponse(redirect);
		const msgs = parseLines(await resp.text());
		expect((msgs[0] as Record<string, unknown>).r).toBe(false);
	});

	it("replace: true → r:true in message", async () => {
		const redirect = new RedirectResponse({ replace: true, to: "/x" });
		const resp = createRedirectNDJSONResponse(redirect);
		const msgs = parseLines(await resp.text());
		expect((msgs[0] as Record<string, unknown>).r).toBe(true);
	});

	it("formatRedirectMessage with replace=false → r:false preserved", () => {
		const parsed = JSON.parse(formatRedirectMessage("/x", 302, false));
		expect(parsed.r).toBe(false);
	});

	it("formatRedirectMessage without replace → no r field", () => {
		const parsed = JSON.parse(formatRedirectMessage("/x", 302));
		expect(parsed.r).toBeUndefined();
	});
});

describe("JSON.stringify error handling", () => {
	it("formatLoaderMessage falls back to error on BigInt", () => {
		const match = makeMatch({ loaderData: { value: BigInt(42) } });
		const line = formatLoaderMessage(match);
		const parsed = JSON.parse(line) as Record<string, unknown>;
		expect(parsed.t).toBe("e");
		expect((parsed.e as Record<string, string>).message).toBe("Serialization failed");
	});

	it("formatChunkMessage falls back to error on BigInt", () => {
		const line = formatChunkMessage("m1", "k1", BigInt(99));
		const parsed = JSON.parse(line) as Record<string, unknown>;
		expect(parsed.t).toBe("e");
		expect(parsed.k).toBe("k1");
		expect((parsed.e as Record<string, string>).message).toBe("Serialization failed");
	});
});
