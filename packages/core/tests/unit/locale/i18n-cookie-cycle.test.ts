import { describe, expect, it, vi } from "vitest";
import type { MiddlewareContext } from "../../../src/middleware/index.ts";
import { runMiddlewares } from "../../../src/middleware/index.ts";
import { i18n } from "../../../src/middleware/builtins/i18n.ts";

const localeConfig = {
	defaultLocale: "en",
	locales: ["en", "hr", "fr"],
};

function makeCtx(url: string, cookie?: string): Omit<MiddlewareContext, "bypass" | "next" | "respond"> {
	const parsedUrl = new URL(url);
	const headers: Record<string, string> = {};
	if (cookie) headers.cookie = cookie;
	return {
		env: {},
		error: vi.fn(),
		locale: localeConfig,
		log: vi.fn(),
		nonce: "",
		onResponse: vi.fn(),
		request: new Request(url, { headers }),
		requestType: "page" as const,
		serverContext: {},
		url: parsedUrl,
		warn: vi.fn(),
	};
}

/**
 * Simulate the full middleware + response handler flow exactly as the server handler does.
 * Returns the final response with all handlers applied.
 */
async function runFullFlow(
	pathname: string,
	cookie?: string,
): Promise<{ cookie: string | null; response: Response; serverLocale: string }> {
	const url = `http://localhost:3000${pathname}`;
	const ctx = makeCtx(url, cookie);

	/* Run middleware exactly as server handler does */
	const mw = i18n();
	const mwOutput = await runMiddlewares([mw], ctx);

	if (mwOutput.result.type === "bypass") {
		/* Bypass responses (redirects) are returned directly — check Set-Cookie on them */
		const response = mwOutput.result.response;
		return {
			cookie: response.headers.get("Set-Cookie"),
			response,
			serverLocale: (ctx.serverContext.locale as string) ?? "unknown",
		};
	}

	/* Normal "next" path: create NDJSON-like response, apply response handlers */
	let response = new Response('{"t":"r"}\n{"t":"d"}\n', {
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "application/x-ndjson",
		},
	});

	/* Apply response handlers (same as applyResponseHandlers in server-handler) */
	for (const handler of mwOutput.responseHandlers) {
		response = await handler(response);
	}

	/* Simulate addSecurityHeaders: creates new Response with copied headers */
	const copiedHeaders = new Headers(response.headers);
	copiedHeaders.set("X-Content-Type-Options", "nosniff");
	const finalResponse = new Response(response.body, {
		headers: copiedHeaders,
		status: response.status,
	});

	return {
		cookie: finalResponse.headers.get("Set-Cookie"),
		response: finalResponse,
		serverLocale: (ctx.serverContext.locale as string) ?? "unknown",
	};
}

/**
 * Simulate streamResponse: Headers.forEach → Record<string, string> → writeHead.
 * This is how the Vite dev server converts Web Response to Node response.
 */
function extractHeadersAsNodeWould(response: Response): Record<string, string> {
	const headers: Record<string, string> = {};
	response.headers.forEach((value, key) => {
		headers[key] = value;
	});
	return headers;
}

describe("i18n cookie cycle: en → hr → fr → en", () => {
	it("step 1: initial load at / (no cookie) → sets cookie to en", async () => {
		const result = await runFullFlow("/");
		expect(result.serverLocale).toBe("en");
		expect(result.cookie).toContain("flare.locale=en");
	});

	it("step 2: navigate to /hr (cookie=en) → sets cookie to hr", async () => {
		const result = await runFullFlow("/hr", "flare.locale=en");
		expect(result.serverLocale).toBe("hr");
		expect(result.cookie).toContain("flare.locale=hr");
	});

	it("step 3: navigate to /fr (cookie=hr) → sets cookie to fr", async () => {
		const result = await runFullFlow("/fr", "flare.locale=hr");
		expect(result.serverLocale).toBe("fr");
		expect(result.cookie).toContain("flare.locale=fr");
	});

	it("step 4: navigate to / (cookie=fr) → redirect to /fr", async () => {
		const result = await runFullFlow("/", "flare.locale=fr");
		expect(result.response.status).toBe(302);
		expect(new URL(result.response.headers.get("Location") ?? "").pathname).toBe("/fr/");
	});

	it("step 5: navigate to /hr again (cookie=en) → sets cookie to hr", async () => {
		const result = await runFullFlow("/hr", "flare.locale=en");
		expect(result.serverLocale).toBe("hr");
		expect(result.cookie).toContain("flare.locale=hr");
	});

	it("full cycle: cookie updates correctly at every step", async () => {
		let cookie: string | undefined;

		/* Step 1: initial load — en (no cookie) */
		const r1 = await runFullFlow("/");
		expect(r1.serverLocale).toBe("en");
		expect(r1.cookie).toContain("flare.locale=en");
		cookie = "flare.locale=en";

		/* Step 2: → hr */
		const r2 = await runFullFlow("/hr", cookie);
		expect(r2.serverLocale).toBe("hr");
		expect(r2.cookie).toContain("flare.locale=hr");
		cookie = "flare.locale=hr";

		/* Step 3: → fr */
		const r3 = await runFullFlow("/fr", cookie);
		expect(r3.serverLocale).toBe("fr");
		expect(r3.cookie).toContain("flare.locale=fr");
		cookie = "flare.locale=fr";

		/* Step 4: / with cookie=fr → redirect to /fr (cookie-respect) */
		const r4 = await runFullFlow("/", cookie);
		expect(r4.response.status).toBe(302);
		expect(new URL(r4.response.headers.get("Location") ?? "").pathname).toBe("/fr/");
		/* Cookie stays fr — user follows redirect to /fr */

		/* Step 5: → hr (cookie still fr, explicit URL wins) */
		const r5 = await runFullFlow("/hr", cookie);
		expect(r5.serverLocale).toBe("hr");
		expect(r5.cookie).toContain("flare.locale=hr");
		cookie = "flare.locale=hr";

		/* Step 6: → en explicit (via /en → strip → /) */
		const r6 = await runFullFlow("/en", cookie);
		expect(r6.response.status).toBe(302);
		/* /en redirects to / (strip default prefix) */
	});
});

describe("Set-Cookie survives Response copying (simulating addSecurityHeaders + streamResponse)", () => {
	it("Set-Cookie preserved through new Headers(response.headers)", async () => {
		const original = new Response("body", {
			headers: { "Content-Type": "text/plain" },
		});
		original.headers.append("Set-Cookie", "flare.locale=hr; Path=/; SameSite=Lax");

		/* Simulate addSecurityHeaders */
		const copied = new Headers(original.headers);
		const newRes = new Response("body", { headers: copied });

		expect(newRes.headers.get("Set-Cookie")).toContain("flare.locale=hr");
	});

	it("Set-Cookie preserved through streamResponse conversion", async () => {
		const response = new Response("body");
		response.headers.append("Set-Cookie", "flare.locale=fr; Path=/; SameSite=Lax");

		/* Simulate addSecurityHeaders */
		const copied = new Headers(response.headers);
		const newRes = new Response("body", { headers: copied });

		/* Simulate streamResponse: forEach → Record<string,string> */
		const nodeHeaders = extractHeadersAsNodeWould(newRes);

		expect(nodeHeaders["set-cookie"]).toContain("flare.locale=fr");
	});

	it("Set-Cookie survives middleware handler that creates new Response", async () => {
		/* Simulate i18n handler running first */
		let response = new Response("body", {
			headers: { "Content-Type": "application/x-ndjson" },
		});
		response.headers.append("Set-Cookie", "flare.locale=hr; Path=/; SameSite=Lax");

		/* Simulate timing handler creating NEW Response */
		const timingHeaders = new Headers(response.headers);
		timingHeaders.set("x-timing", "5ms");
		response = new Response("body", {
			headers: timingHeaders,
			status: 200,
		});

		/* Simulate addSecurityHeaders */
		const secHeaders = new Headers(response.headers);
		secHeaders.set("X-Content-Type-Options", "nosniff");
		const finalResponse = new Response("body", { headers: secHeaders });

		/* Simulate streamResponse */
		const nodeHeaders = extractHeadersAsNodeWould(finalResponse);

		expect(nodeHeaders["set-cookie"]).toContain("flare.locale=hr");
	});
});

describe("i18n cookie with non-root paths", () => {
	it("/about with cookie=fr → redirect to /fr/about", async () => {
		const result = await runFullFlow("/about", "flare.locale=fr");
		expect(result.response.status).toBe(302);
		expect(new URL(result.response.headers.get("Location") ?? "").pathname).toBe("/fr/about");
	});

	it("/hr/about with cookie=fr → sets cookie to hr", async () => {
		const result = await runFullFlow("/hr/about", "flare.locale=fr");
		expect(result.serverLocale).toBe("hr");
		expect(result.cookie).toContain("flare.locale=hr");
	});

	it("/fr/products with cookie=en → sets cookie to fr", async () => {
		const result = await runFullFlow("/fr/products", "flare.locale=en");
		expect(result.serverLocale).toBe("fr");
		expect(result.cookie).toContain("flare.locale=fr");
	});
});

describe("cookie regex edge cases", () => {
	it("cookie with leading space after semicolon", async () => {
		const result = await runFullFlow("/hr", "other=abc; flare.locale=hr");
		expect(result.serverLocale).toBe("hr");
		/* Cookie matches → no update needed */
		expect(result.cookie).toBeNull();
	});

	it("cookie with no space after semicolon", async () => {
		const result = await runFullFlow("/hr", "other=abc;flare.locale=hr");
		expect(result.serverLocale).toBe("hr");
		expect(result.cookie).toBeNull();
	});

	it("multiple cookies, flare.locale is last", async () => {
		const result = await runFullFlow("/fr", "session=xyz; flare.locale=fr");
		expect(result.serverLocale).toBe("fr");
		expect(result.cookie).toBeNull();
	});
});
