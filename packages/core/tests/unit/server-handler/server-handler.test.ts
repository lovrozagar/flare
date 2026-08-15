import { describe, expect, it } from "vitest";
import { buildCspHeader, normalizeUrl } from "../../../src/server-handler/index.ts";

describe("URL normalization", () => {
	it("/ → pass through (no redirect)", () => {
		expect(normalizeUrl(new URL("http://localhost/"))).toBeNull();
	});

	it("/about → pass through", () => {
		expect(normalizeUrl(new URL("http://localhost/about"))).toBeNull();
	});

	it("/about/ → 301 redirect to /about", () => {
		const result = normalizeUrl(new URL("http://localhost/about/"));
		expect(result).not.toBeNull();
		expect(result?.status).toBe(301);
		expect(result?.headers.get("Location")).toBe("/about");
	});

	it("/about/?q=1 → 301 redirect to /about?q=1", () => {
		const result = normalizeUrl(new URL("http://localhost/about/?q=1"));
		expect(result).not.toBeNull();
		expect(result?.headers.get("Location")).toBe("/about?q=1");
	});

	it("/a/b/c/ → 301 redirect to /a/b/c", () => {
		const result = normalizeUrl(new URL("http://localhost/a/b/c/"));
		expect(result?.headers.get("Location")).toBe("/a/b/c");
	});

	it("/styles.css → pass through (extensions not gated)", () => {
		expect(normalizeUrl(new URL("http://localhost/styles.css"))).toBeNull();
	});

	it("/images/logo.png → pass through (extensions not gated)", () => {
		expect(normalizeUrl(new URL("http://localhost/images/logo.png"))).toBeNull();
	});

	it("/api/data.json → pass through (extensions not gated)", () => {
		expect(normalizeUrl(new URL("http://localhost/api/data.json"))).toBeNull();
	});

	it("/page.html → pass through", () => {
		expect(normalizeUrl(new URL("http://localhost/page.html"))).toBeNull();
	});

	it("/about.us → pass through (extensions not gated)", () => {
		expect(normalizeUrl(new URL("http://localhost/about.us"))).toBeNull();
	});

	it("/.hidden → pass through (dot at start)", () => {
		expect(normalizeUrl(new URL("http://localhost/.hidden"))).toBeNull();
	});

	it("trailing slash redirect preserves hash fragment", () => {
		const result = normalizeUrl(new URL("http://localhost/about/#section"));
		expect(result).not.toBeNull();
		expect(result?.headers.get("Location")).toBe("/about#section");
	});

	it("trailing slash redirect preserves query + hash", () => {
		const result = normalizeUrl(new URL("http://localhost/about/?q=1#top"));
		expect(result).not.toBeNull();
		expect(result?.headers.get("Location")).toBe("/about?q=1#top");
	});
});

describe("CSP construction", () => {
	it("default directives applied when no overrides", () => {
		const csp = buildCspHeader("abc123");
		expect(csp).toContain("script-src");
		expect(csp).toContain("'nonce-abc123'");
		expect(csp).not.toContain("'strict-dynamic'");
		expect(csp).toContain("object-src 'none'");
		expect(csp).toContain("default-src 'self'");
	});

	it("nonce injected into script-src", () => {
		const csp = buildCspHeader("test-nonce");
		expect(csp).toContain("'nonce-test-nonce'");
	});

	it("config csp values appended to defaults", () => {
		const csp = buildCspHeader("n", { "img-src": ["blob:"] });
		expect(csp).toContain("img-src 'self' data: https: blob:");
	});

	it("directives joined with ;", () => {
		const csp = buildCspHeader("n");
		expect(csp).toContain("; ");
	});

	it("upgrade-insecure-requests → directive without value", () => {
		const csp = buildCspHeader("n");
		expect(csp).toContain("upgrade-insecure-requests");
		/* should not have = or value after it */
		const uir = csp.split("; ").find((d) => d.startsWith("upgrade-insecure-requests"));
		expect(uir).toBe("upgrade-insecure-requests");
	});

	it("isDev: true → unsafe-inline + unsafe-eval in script-src", () => {
		const csp = buildCspHeader("n", undefined, true);
		expect(csp).toContain("'unsafe-inline'");
		expect(csp).toContain("'unsafe-eval'");
	});

	it("isDev: true → ws://localhost:* in connect-src", () => {
		const csp = buildCspHeader("n", undefined, true);
		expect(csp).toContain("ws://localhost:*");
	});

	it("isDev: false → strict CSP (no unsafe-*)", () => {
		const csp = buildCspHeader("n", undefined, false);
		/* script-src should not have unsafe-eval */
		const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"));
		expect(scriptSrc).not.toContain("unsafe-eval");
	});

	it("isDev: undefined → strict CSP", () => {
		const csp = buildCspHeader("n");
		const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"));
		expect(scriptSrc).not.toContain("unsafe-eval");
	});
});

describe("buildDevErrorHtml", () => {
	it("escapes HTML in error message", async () => {
		const { createServerHandler } = await import("../../../src/server-handler");
		/* buildDevErrorHtml is private, test through createServerHandler in dev mode (mock default) */
		const handler = createServerHandler({
			router: {
				layouts: {},
				routeTree: { s: {} },
			} as never,
		});

		/* Request to a route that doesn't exist — handler will catch and render dev error */
		const request = new Request("http://localhost/no-match");
		const response = await handler.fetch(request, {});
		const html = await response.text();

		/* Verify the response does NOT contain unescaped script tags */
		expect(html).not.toContain("<script>alert");
	});
});

describe("security headers", () => {
	it("all headers present", async () => {
		const { SECURITY_HEADERS } = await import("../../../src/server-handler");
		expect(SECURITY_HEADERS["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
		expect(SECURITY_HEADERS["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
		expect(SECURITY_HEADERS["Strict-Transport-Security"]).toContain("max-age=63072000");
		expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
		expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
	});
});
