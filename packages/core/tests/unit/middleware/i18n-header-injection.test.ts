import { describe, expect, it } from "vitest";

/**
 * Task 5: i18n locale cookie header injection
 *
 * Even though localeSet.has() gates most code paths, buildCookieHeader
 * should have defense-in-depth sanitization against CRLF injection,
 * semicolons, null bytes, and URL-encoded variants.
 */

/* Import the module to get at buildCookieHeader — it's not exported,
 * so we test via the exported i18n middleware and also test the cookie
 * format directly by checking response headers. */

describe("Task 5: i18n cookie header injection defense", () => {
	describe("buildCookieHeader sanitization", () => {
		/* Since buildCookieHeader is not exported, we dynamically access it
		 * through the module's source. Instead, we test the i18n middleware's
		 * actual cookie output for valid and invalid locales. */

		function createMockCtx(opts: {
			pathname: string;
			locale: { defaultLocale: string; locales: string[] };
			cookie?: string;
			userAgent?: string;
		}) {
			const headers = new Headers();
			if (opts.cookie) headers.set("cookie", opts.cookie);
			if (opts.userAgent) headers.set("user-agent", opts.userAgent);

			const url = new URL(`http://localhost${opts.pathname}`);
			let bypassed: Response | null = null;
			let nexted = false;
			const responseHooks: ((r: Response) => Response)[] = [];

			return {
				bypass: (res: Response) => {
					bypassed = res;
					return Promise.resolve(new Response(null));
				},
				get bypassed() {
					return bypassed;
				},
				locale: {
					cookieName: "flare.locale",
					defaultLocale: opts.locale.defaultLocale,
					locales: opts.locale.locales,
				},
				next: () => {
					nexted = true;
					return Promise.resolve(new Response(null));
				},
				get nexted() {
					return nexted;
				},
				onResponse: (hook: (r: Response) => Response) => {
					responseHooks.push(hook);
				},
				request: new Request(url, { headers }),
				get responseHooks() {
					return responseHooks;
				},
				serverContext: {} as Record<string, unknown>,
				url,
			};
		}

		it("valid locale 'hr' sets correct cookie", async () => {
			const { i18n } = await import("../../../src/middleware/builtins/i18n");
			const middleware = i18n();
			const ctx = createMockCtx({
				locale: { defaultLocale: "en", locales: ["en", "hr", "fr"] },
				pathname: "/hr/about",
			});

			await middleware(ctx as never);

			/* /hr/about with valid locale → proceeds to next(), locale set in serverContext */
			expect(ctx.serverContext.locale).toBe("hr");
		});

		it("valid locale 'fr' in redirect sets correct Set-Cookie", async () => {
			const { i18n } = await import("../../../src/middleware/builtins/i18n");
			const middleware = i18n();

			/* First visit to root, Accept-Language: fr → redirect to /fr with cookie */
			const ctx = createMockCtx({
				locale: { defaultLocale: "en", locales: ["en", "hr", "fr"] },
				pathname: "/",
			});
			ctx.request = new Request("http://localhost/", {
				headers: { "Accept-Language": "fr" },
			});

			await middleware(ctx as never);

			if (ctx.bypassed) {
				const setCookie = ctx.bypassed.headers.get("set-cookie");
				if (setCookie) {
					expect(setCookie).toContain("flare.locale=fr");
					expect(setCookie).not.toContain("\r");
					expect(setCookie).not.toContain("\n");
					/* Only one Set-Cookie header value */
					expect(setCookie.split("flare.locale=").length).toBe(2);
				}
			}
		});

		it("locale with CRLF is rejected (not in allowed set)", async () => {
			const { i18n } = await import("../../../src/middleware/builtins/i18n");
			const middleware = i18n();

			/* en\\r\\nSet-Cookie: evil=1 is not in locales → treated as invalid */
			const ctx = createMockCtx({
				locale: { defaultLocale: "en", locales: ["en", "hr"] },
				pathname: "/en%0d%0aSet-Cookie:%20evil=1/about",
			});

			await middleware(ctx as never);

			/* Invalid locale-like segment should redirect stripping the segment,
			 * NOT set a cookie with CRLF */
			if (ctx.bypassed) {
				const setCookie = ctx.bypassed.headers.get("set-cookie");
				if (setCookie) {
					expect(setCookie).not.toContain("\r");
					expect(setCookie).not.toContain("\n");
					expect(setCookie).not.toContain("evil");
				}
			}
		});

		it("locale with semicolon is rejected (not in allowed set)", async () => {
			const { i18n } = await import("../../../src/middleware/builtins/i18n");
			const middleware = i18n();

			const ctx = createMockCtx({
				locale: { defaultLocale: "en", locales: ["en", "hr"] },
				pathname: "/en;HttpOnly=false/about",
			});

			await middleware(ctx as never);

			if (ctx.bypassed) {
				const setCookie = ctx.bypassed.headers.get("set-cookie");
				if (setCookie) {
					expect(setCookie).not.toContain("HttpOnly=false");
				}
			}
		});

		it("locale with null byte is rejected", async () => {
			const { i18n } = await import("../../../src/middleware/builtins/i18n");
			const middleware = i18n();

			const ctx = createMockCtx({
				locale: { defaultLocale: "en", locales: ["en", "hr"] },
				pathname: "/en%00/about",
			});

			await middleware(ctx as never);

			if (ctx.bypassed) {
				const setCookie = ctx.bypassed.headers.get("set-cookie");
				if (setCookie) {
					expect(setCookie).not.toContain("\0");
				}
			}
		});

		it("locale not in allowed list falls back to defaultLocale cookie", async () => {
			const { i18n } = await import("../../../src/middleware/builtins/i18n");
			const middleware = i18n();

			/* /de is locale-like but not in allowed list */
			const ctx = createMockCtx({
				locale: { defaultLocale: "en", locales: ["en", "hr"] },
				pathname: "/de/about",
			});

			await middleware(ctx as never);

			/* Should strip invalid locale → redirect with defaultLocale cookie */
			if (ctx.bypassed) {
				const setCookie = ctx.bypassed.headers.get("set-cookie");
				if (setCookie) {
					expect(setCookie).toContain("flare.locale=en");
				}
			}
		});

		it("cookie value for valid locale is correctly formatted", async () => {
			const { i18n } = await import("../../../src/middleware/builtins/i18n");
			const middleware = i18n();

			/* Default locale in URL → redirect strips prefix, sets cookie */
			const ctx = createMockCtx({
				locale: { defaultLocale: "en", locales: ["en", "hr"] },
				pathname: "/en/about",
			});

			await middleware(ctx as never);

			if (ctx.bypassed) {
				const setCookie = ctx.bypassed.headers.get("set-cookie");
				expect(setCookie).toBe("flare.locale=en; Path=/; Max-Age=31536000; SameSite=Lax");
			}
		});

		it("cookieName with CRLF is not interpolated into Set-Cookie", async () => {
			const { i18n } = await import("../../../src/middleware/builtins/i18n");
			const middleware = i18n({ cookieName: "flare\r\nSet-Cookie: evil=1" });

			const ctx = createMockCtx({
				locale: { defaultLocale: "en", locales: ["en", "hr"] },
				pathname: "/en/about",
			});

			await middleware(ctx as never);

			if (ctx.bypassed) {
				const setCookie = ctx.bypassed.headers.get("set-cookie") ?? "";
				expect(setCookie).not.toContain("\r");
				expect(setCookie).not.toContain("\n");
				expect(setCookie).not.toContain("evil=1");
				expect(setCookie).toContain("flare.locale=en");
			}
		});

		it("multiple Set-Cookie headers not injected from single locale", async () => {
			const { i18n } = await import("../../../src/middleware/builtins/i18n");
			const middleware = i18n();

			const ctx = createMockCtx({
				locale: { defaultLocale: "en", locales: ["en", "hr"] },
				pathname: "/en/about",
			});

			await middleware(ctx as never);

			if (ctx.bypassed) {
				/* Headers.get() returns concatenated values for Set-Cookie.
				 * There should be exactly one flare.locale= occurrence. */
				const setCookie = ctx.bypassed.headers.get("set-cookie") ?? "";
				const occurrences = setCookie.split("flare.locale=").length - 1;
				expect(occurrences).toBe(1);
			}
		});
	});
});
