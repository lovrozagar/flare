/**
 * @vitest-environment node
 *
 * Build-scoped data URL: data requests go to `<path>?_flare=<buildId>` so every cache keyed by
 * URL keeps HTML, NDJSON and builds apart. The server strips the param before anything else sees
 * the URL and refuses to run loaders for a client from another build.
 */
import { describe, expect, it } from "vitest";
import TEST_BUILD_ID from "virtual:flare-build";
import { i18n } from "../../src/middleware/builtins/i18n.ts";
import { PARAM_DATA } from "../../src/protocol.ts";
import { createRouter } from "../../src/router-config/index.ts";
import { createTreeNode, insertRoute } from "../../src/router-primitives/index.ts";
import { createServerHandler } from "../../src/server-handler/index.ts";
import { buildHandler, makeRequest, parseNDJSON } from "./fixtures.ts";

function spyHandler() {
	const seen: { calls: number; requestUrl?: string; search?: unknown; url?: string } = { calls: 0 };
	const tree = createTreeNode();
	insertRoute(tree, "/spy", {
		e: "_root_/spy",
		o: {},
		p: () =>
			Promise.resolve({
				default: {
					_type: "render",
					loader: (ctx: Record<string, unknown>) => {
						seen.calls++;
						seen.search = (ctx.location as { search?: unknown } | undefined)?.search;
						seen.url = JSON.stringify(ctx.location);
						seen.requestUrl = (ctx.request as Request | undefined)?.url;
						return { ok: true };
					},
					variablePath: "_root_/spy",
					virtualPath: "_root_/spy",
				},
			}),
		t: "r" as const,
		v: "_root_/spy",
		x: "_root_/spy",
	});
	const handler = createServerHandler({ router: createRouter({ layouts: {}, routeTree: tree }) });
	return { handler, seen };
}

function dataUrl(path: string, build: string): string {
	const sep = path.includes("?") ? "&" : "?";
	return `${path}${sep}${PARAM_DATA}=${build}`;
}

function data(path: string): Request {
	return makeRequest(path, { headers: { "flare-data": "1" } });
}

describe("data URL — matching build", () => {
	it("serves NDJSON and keeps Vary: flare-data", async () => {
		const response = await buildHandler().fetch(data(dataUrl("/about", TEST_BUILD_ID)), {});

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("application/x-ndjson");
		expect(response.headers.get("Vary") ?? "").toContain("flare-data");
		const messages = parseNDJSON(await response.text());
		expect(messages.some((m) => m.t === "l" && (m.d as { title?: string })?.title === "About")).toBe(true);
	});

	it("loaders never see the _flare param", async () => {
		const { handler, seen } = spyHandler();
		await handler.fetch(data(dataUrl("/spy?tab=a", TEST_BUILD_ID)), {});

		expect(seen.calls).toBe(1);
		expect(seen.search).toEqual({ tab: "a" });
		expect(seen.url ?? "").not.toContain(PARAM_DATA);
		expect(seen.requestUrl ?? "").not.toContain(PARAM_DATA);
	});
});

describe("data URL — mismatched build", () => {
	it("answers with a build-mismatch frame, no-store, and runs no loaders", async () => {
		const { handler, seen } = spyHandler();
		const response = await handler.fetch(data(dataUrl("/spy", "old-build")), {});

		expect(response.headers.get("Content-Type")).toBe("application/x-ndjson");
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		const messages = parseNDJSON(await response.text());
		expect(messages).toEqual([{ b: TEST_BUILD_ID, t: "b" }]);
		expect(seen.calls).toBe(0);
	});

	it("a request without the param is not treated as a mismatch", async () => {
		const { handler, seen } = spyHandler();
		const response = await handler.fetch(data("/spy"), {});

		expect(response.headers.get("Content-Type")).toBe("application/x-ndjson");
		expect(seen.calls).toBe(1);
	});
});

describe("data URL — without the data header", () => {
	it("returns HTML for the stripped URL", async () => {
		const { handler, seen } = spyHandler();
		const response = await handler.fetch(makeRequest(dataUrl("/spy", "anything")), {});

		expect(response.headers.get("Content-Type") ?? "").toContain("text/html");
		expect(seen.calls).toBe(1);
		expect(seen.url ?? "").not.toContain(PARAM_DATA);
	});

	it("trailing-slash redirect never carries the param", async () => {
		const response = await buildHandler().fetch(makeRequest(dataUrl("/about/", TEST_BUILD_ID)), {});

		expect(response.status).toBeGreaterThanOrEqual(300);
		expect(response.status).toBeLessThan(400);
		expect(response.headers.get("Location") ?? "").not.toContain(PARAM_DATA);
	});

	it("i18n redirect never carries the param", async () => {
		const tree = createTreeNode();
		const router = createRouter({
			layouts: {},
			locale: { defaultLocale: "en", locales: ["en", "fr"] },
			routeTree: tree,
		} as Parameters<typeof createRouter>[0]);
		const handler = createServerHandler({ middleware: [i18n()], router } as Parameters<typeof createServerHandler>[0]);
		const response = await handler.fetch(
			makeRequest(dataUrl("/", TEST_BUILD_ID), { headers: { "Accept-Language": "fr" } }),
			{},
		);

		const location = response.headers.get("Location");
		if (location) expect(location).not.toContain(PARAM_DATA);
	});
});
