import { afterEach, expect, it, vi } from "vitest";
import { isHttpsOrigin, isHttpsUrl, send } from "./request.ts";

afterEach(() => {
	vi.unstubAllGlobals();
});

it("https url", () => {
	expect(isHttpsUrl("https://example.com/a?b")).toBe(true);
	expect(isHttpsUrl("http://example.com/a")).toBe(false);
	expect(isHttpsUrl("/a")).toBe(false);
});

it("https origin", () => {
	expect(isHttpsOrigin("https://example.com")).toBe(true);
	expect(isHttpsOrigin("https://example.com/")).toBe(true);
	expect(isHttpsOrigin("https://example.com:8443")).toBe(true);
	expect(isHttpsOrigin("https://example.com/a")).toBe(false);
	expect(isHttpsOrigin("https://example.com?a")).toBe(false);
	expect(isHttpsOrigin("http://example.com")).toBe(false);
	expect(isHttpsOrigin("example.com")).toBe(false);
});

it("send", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn<typeof fetch>(async () => new Response("body")),
	);
	expect(await send("Svc", "https://example.com", { method: "POST" })).toEqual({ ok: true });
	vi.stubGlobal(
		"fetch",
		vi.fn<typeof fetch>(async () => new Response(null, { status: 429 })),
	);
	expect(await send("Svc", "https://example.com", {})).toEqual({ ok: false, error: "Svc answered 429" });
	vi.stubGlobal(
		"fetch",
		vi.fn<typeof fetch>(async (input) => {
			throw new TypeError(`refused ${String(input)}`);
		}),
	);
	expect(await send("Svc", "https://example.com/?apikey=secret", {})).toEqual({
		ok: false,
		error: "Svc request failed",
	});
});
