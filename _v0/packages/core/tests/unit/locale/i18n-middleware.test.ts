import { describe, expect, it, vi } from "vitest";
import type { MiddlewareContext } from "../../../src/middleware/index.ts";
import { i18n } from "../../../src/middleware/builtins/i18n.ts";
import type { RouteData } from "../../../src/router-primitives/index.ts";
import { createTreeNode, insertRoute } from "../../../src/router-primitives/index.ts";

function locUrl(header: string | null): URL {
	return new URL(header ?? "", "http://localhost");
}

function makeCtx(
	url: string,
	overrides?: Partial<MiddlewareContext> & {
		locale?: { defaultLocale: string; locales: readonly string[] };
	},
): MiddlewareContext {
	const parsedUrl = new URL(url);
	return {
		bypass: (response: Response) => Object.freeze({ response, type: "bypass" as const }),
		env: {},
		error: vi.fn(),
		locale: overrides?.locale ?? localeConfig,
		log: vi.fn(),
		next: vi.fn(() => Promise.resolve(Object.freeze({ type: "next" as const }))),
		nonce: "",
		onResponse: vi.fn(),
		request: new Request(url),
		requestType: "page" as const,
		respond: (response: Response) => Object.freeze({ response, type: "respond" as const }),
		serverContext: {},
		url: parsedUrl,
		warn: vi.fn(),
		...overrides,
	} as MiddlewareContext;
}

function makeCtxWithHeaders(url: string, headers: Record<string, string>): MiddlewareContext {
	return makeCtx(url, {
		request: new Request(url, { headers }),
	});
}

const localeConfig = {
	defaultLocale: "en",
	locales: ["en", "hr", "de"],
};

function dummyRoute(variablePath: string): RouteData {
	return {
		e: "default",
		o: {},
		p: () => Promise.resolve({ default: null }),
		t: "r",
		v: variablePath,
		x: variablePath,
	};
}

describe("i18n middleware", () => {
	describe("bot handling", () => {
		it("bots get default locale, no redirect", async () => {
			const mw = i18n();
			const ctx = makeCtxWithHeaders("https://example.com/hr/about", {
				"user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)",
			});
			const result = await mw(ctx);
			expect(result.type).toBe("next");
			expect(ctx.serverContext.locale).toBe("en");
		});
	});

	describe("skip paths", () => {
		it("skips /_flare/server-fn/ paths", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/_flare/server-fn/some-action");
			const result = await mw(ctx);
			expect(result.type).toBe("next");
		});

		it("skips file extensions (.js, .css, etc)", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/assets/app.js");
			const result = await mw(ctx);
			expect(result.type).toBe("next");
		});

		it("skips custom skip paths", async () => {
			const mw = i18n({ skip: ["/api/"] });
			const ctx = makeCtx("https://example.com/api/users");
			const result = await mw(ctx);
			expect(result.type).toBe("next");
		});
	});

	describe("case normalization", () => {
		it("EN-US → 302 → en-us", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/EN-US/about", {
				locale: { defaultLocale: "en-us", locales: ["en-us", "hr"] },
			});
			const result = await mw(ctx);
			expect(result.type).toBe("bypass");
			if (result.type === "bypass") {
				expect(result.response.status).toBe(302);
				const location = result.response.headers.get("Location");
				expect(location).toContain("/en-us/about");
			}
		});

		it("Hr → 302 → hr (single segment)", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/Hr/about");
			const result = await mw(ctx);
			expect(result.type).toBe("bypass");
			if (result.type === "bypass") {
				expect(result.response.status).toBe(302);
				const location = result.response.headers.get("Location");
				expect(location).toContain("/hr/about");
			}
		});
	});

	describe("default locale stripping", () => {
		it("/en/about → 302 → /about (strip default from URL)", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/en/about");
			const result = await mw(ctx);
			expect(result.type).toBe("bypass");
			if (result.type === "bypass") {
				expect(result.response.status).toBe(302);
				const location = result.response.headers.get("Location");
				expect(location).toContain("/about");
				expect(location).not.toContain("/en/");
				/* Path-only so document applies Set-Cookie on 3xx (SW fetch follow does not). */
				expect(location?.startsWith("http")).toBe(false);
			}
		});

		it("/en → 302 → / (root with default locale)", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/en");
			const result = await mw(ctx);
			expect(result.type).toBe("bypass");
			if (result.type === "bypass") {
				expect(result.response.status).toBe(302);
				const header = result.response.headers.get("Location") ?? "";
				expect(header.startsWith("http")).toBe(false);
				const location = locUrl(header);
				expect(location.pathname).toBe("/");
			}
		});

		it("/en with cookie=hr → 302 relative / and Set-Cookie en", async () => {
			const mw = i18n();
			const ctx = makeCtxWithHeaders("https://example.com/en", {
				cookie: "flare.locale=hr",
			});
			const result = await mw(ctx);
			expect(result.type).toBe("bypass");
			if (result.type === "bypass") {
				expect(result.response.status).toBe(302);
				const header = result.response.headers.get("Location") ?? "";
				expect(header.startsWith("http")).toBe(false);
				expect(locUrl(header).pathname).toBe("/");
				expect(result.response.headers.get("Set-Cookie")).toContain("flare.locale=en");
			}
		});

		it("keeps /en/ssg-about when the unprefixed path is not a route", async () => {
			const mw = i18n();
			const tree = createTreeNode();
			insertRoute(tree, "/", dummyRoute("/"));
			insertRoute(tree, "/[locale]/ssg-about", dummyRoute("/[locale]/ssg-about"));
			const ctx = makeCtx("https://example.com/en/ssg-about", { routeTree: tree });
			const result = await mw(ctx);
			expect(result.type).toBe("next");
			expect(ctx.serverContext.locale).toBe("en");
		});

		it("still strips /en/about when /about exists", async () => {
			const mw = i18n();
			const tree = createTreeNode();
			insertRoute(tree, "/", dummyRoute("/"));
			insertRoute(tree, "/about", dummyRoute("/about"));
			insertRoute(tree, "/[locale]/about", dummyRoute("/[locale]/about"));
			const ctx = makeCtx("https://example.com/en/about", { routeTree: tree });
			const result = await mw(ctx);
			expect(result.type).toBe("bypass");
			if (result.type === "bypass") {
				expect(locUrl(result.response.headers.get("Location")).pathname).toBe("/about");
			}
		});
	});

	describe("prerender header", () => {
		it("flare-prerender skips default-locale strip", async () => {
			const mw = i18n();
			const ctx = makeCtxWithHeaders("https://example.com/en/ssg-about", {
				"flare-prerender": "1",
			});
			const result = await mw(ctx);
			expect(result.type).toBe("next");
			expect(ctx.serverContext.locale).toBe("en");
		});

		it("flare-prerender keeps non-default path locale", async () => {
			const mw = i18n();
			const ctx = makeCtxWithHeaders("https://example.com/hr/ssg-about", {
				"flare-prerender": "1",
			});
			const result = await mw(ctx);
			expect(result.type).toBe("next");
			expect(ctx.serverContext.locale).toBe("hr");
		});
	});

	describe("cookie-respect redirect", () => {
		it("/ with cookie=hr → 302 → /hr", async () => {
			const mw = i18n();
			const ctx = makeCtxWithHeaders("https://example.com/", {
				cookie: "flare.locale=hr",
			});
			const result = await mw(ctx);
			expect(result.type).toBe("bypass");
			if (result.type === "bypass") {
				expect(result.response.status).toBe(302);
				const header = result.response.headers.get("Location") ?? "";
				expect(header.startsWith("http")).toBe(false);
				expect(locUrl(header).pathname).toBe("/hr/");
			}
		});

		it("/about with cookie=hr → 302 → /hr/about", async () => {
			const mw = i18n();
			const ctx = makeCtxWithHeaders("https://example.com/about", {
				cookie: "flare.locale=hr",
			});
			const result = await mw(ctx);
			expect(result.type).toBe("bypass");
			if (result.type === "bypass") {
				expect(result.response.status).toBe(302);
				expect(locUrl(result.response.headers.get("Location")).pathname).toBe("/hr/about");
			}
		});

		it("NDJSON data request skips cookie redirect", async () => {
			const mw = i18n();
			const ctx = makeCtxWithHeaders("https://example.com/", {
				cookie: "flare.locale=hr",
				"flare-data": "1",
			});
			const result = await mw(ctx);
			expect(result.type).toBe("next");
			expect(ctx.serverContext.locale).toBe("en");
		});

		it("/ with cookie=en (default) → no redirect", async () => {
			const mw = i18n();
			const ctx = makeCtxWithHeaders("https://example.com/", {
				cookie: "flare.locale=en",
			});
			const result = await mw(ctx);
			expect(result.type).toBe("next");
			expect(ctx.serverContext.locale).toBe("en");
		});
	});

	describe("valid non-default locale in path", () => {
		it("/hr/about → no redirect, sets locale", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/hr/about");
			const result = await mw(ctx);
			expect(result.type).toBe("next");
			expect(ctx.serverContext.locale).toBe("hr");
		});

		it("sets cookie via onResponse when locale differs from cookie", async () => {
			const mw = i18n();
			const responseHandlers: ((r: Response) => Response)[] = [];
			const ctx = makeCtx("https://example.com/hr/about", {
				onResponse: (handler: unknown) => {
					responseHandlers.push(handler as (r: Response) => Response);
				},
			});
			await mw(ctx);
			expect(responseHandlers.length).toBeGreaterThan(0);
		});
	});

	describe("default locale — no prefix, no redirect", () => {
		it("/ without cookie → no redirect, locale=en", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/");
			const result = await mw(ctx);
			expect(result.type).toBe("next");
			expect(ctx.serverContext.locale).toBe("en");
		});

		it("/about without cookie → no redirect, locale=en", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/about");
			const result = await mw(ctx);
			expect(result.type).toBe("next");
			expect(ctx.serverContext.locale).toBe("en");
		});
	});

	describe("invalid locale in path", () => {
		it("/fr/about (unsupported) → 302 → /about", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/fr/about");
			const result = await mw(ctx);
			expect(result.type).toBe("bypass");
			if (result.type === "bypass") {
				expect(result.response.status).toBe(302);
			}
		});
	});

	describe("Accept-Language detection", () => {
		it("/ with Accept-Language: hr → 302 → /hr (first visit)", async () => {
			const mw = i18n();
			const ctx = makeCtxWithHeaders("https://example.com/", {
				"accept-language": "hr,en;q=0.9",
			});
			const result = await mw(ctx);
			expect(result.type).toBe("bypass");
			if (result.type === "bypass") {
				expect(result.response.status).toBe(302);
				const location = locUrl(result.response.headers.get("Location"));
				expect(location.pathname).toBe("/hr");
			}
		});

		it("cookie existence causes cookie-respect redirect instead of Accept-Language", async () => {
			const mw = i18n();
			const ctx = makeCtxWithHeaders("https://example.com/", {
				"accept-language": "de,en;q=0.9",
				cookie: "flare.locale=hr",
			});
			const result = await mw(ctx);
			expect(result.type).toBe("bypass");
			if (result.type === "bypass") {
				expect(result.response.status).toBe(302);
				expect(locUrl(result.response.headers.get("Location")).pathname).toBe("/hr/");
			}
		});
	});

	describe("cookie management", () => {
		it("redirect responses include Set-Cookie header", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/en/about");
			const result = await mw(ctx);
			if (result.type === "bypass") {
				const cookie = result.response.headers.get("Set-Cookie");
				expect(cookie).toContain("flare.locale=en");
				expect(cookie).toContain("Path=/");
				expect(cookie).toContain("SameSite=Lax");
			}
		});

		it("HTTPS requests get Secure flag on cookie", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/en/about");
			const result = await mw(ctx);
			if (result.type === "bypass") {
				const cookie = result.response.headers.get("Set-Cookie");
				expect(cookie).toContain("Secure");
			}
		});

		it("HTTP requests omit Secure flag", async () => {
			const mw = i18n();
			const ctx = makeCtx("http://example.com/en/about");
			const result = await mw(ctx);
			if (result.type === "bypass") {
				const cookie = result.response.headers.get("Set-Cookie");
				expect(cookie).not.toContain("Secure");
			}
		});

		it("no onResponse when cookie already matches locale", async () => {
			const mw = i18n();
			const ctx = makeCtxWithHeaders("https://example.com/hr/about", {
				cookie: "flare.locale=hr",
			});
			await mw(ctx);
			expect(ctx.onResponse).not.toHaveBeenCalled();
		});

		it("cookie=en at / → no onResponse (default matches)", async () => {
			const mw = i18n();
			const ctx = makeCtxWithHeaders("https://example.com/", {
				cookie: "flare.locale=en",
			});
			await mw(ctx);
			expect(ctx.onResponse).not.toHaveBeenCalled();
		});

		it("explicit secure: false on HTTPS omits Secure flag", async () => {
			const mw = i18n({ cookie: { maxAge: 100, secure: false } });
			const ctx = makeCtx("https://example.com/en");
			const result = await mw(ctx);
			if (result.type === "bypass") {
				const cookie = result.response.headers.get("Set-Cookie");
				expect(cookie).not.toContain("Secure");
			}
		});

		it("explicit secure: true on HTTP adds Secure flag", async () => {
			const mw = i18n({ cookie: { maxAge: 100, secure: true } });
			const ctx = makeCtx("http://example.com/en");
			const result = await mw(ctx);
			if (result.type === "bypass") {
				const cookie = result.response.headers.get("Set-Cookie");
				expect(cookie).toContain("Secure");
			}
		});
	});

	describe("case normalize — cookie branch", () => {
		it("case normalize for supported locale sets cookie", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/HR/about");
			const result = await mw(ctx);
			if (result.type === "bypass") {
				expect(result.response.headers.get("Set-Cookie")).toContain("flare.locale=hr");
			}
		});

		it("case normalize for unsupported locale does NOT set cookie", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/FR/about");
			const result = await mw(ctx);
			if (result.type === "bypass") {
				expect(result.response.headers.get("Set-Cookie")).toBeNull();
			}
		});
	});

	describe("invalid locale strip", () => {
		it("/fr/about → 302 → /about with cookie=en (default)", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/fr/about");
			const result = await mw(ctx);
			if (result.type === "bypass") {
				expect(result.response.status).toBe(302);
				const loc = locUrl(result.response.headers.get("Location"));
				expect(loc.pathname).toBe("/about");
				expect(result.response.headers.get("Set-Cookie")).toContain("flare.locale=en");
			}
		});

		it("/fr → 302 → / (unsupported root)", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/fr");
			const result = await mw(ctx);
			if (result.type === "bypass") {
				const loc = locUrl(result.response.headers.get("Location"));
				expect(loc.pathname).toBe("/");
			}
		});
	});

	describe("query string preservation", () => {
		it("/en?page=2 → 302 → /?page=2", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/en?page=2");
			const result = await mw(ctx);
			if (result.type === "bypass") {
				const loc = locUrl(result.response.headers.get("Location"));
				expect(loc.pathname).toBe("/");
				expect(loc.searchParams.get("page")).toBe("2");
			}
		});

		it("/HR?q=test → 302 → /hr?q=test (case normalize)", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/HR?q=test");
			const result = await mw(ctx);
			if (result.type === "bypass") {
				const loc = locUrl(result.response.headers.get("Location"));
				expect(loc.pathname).toBe("/hr");
				expect(loc.searchParams.get("q")).toBe("test");
			}
		});

		it("/fr?ref=x → 302 → /?ref=x (invalid locale strip)", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/fr?ref=x");
			const result = await mw(ctx);
			if (result.type === "bypass") {
				const loc = locUrl(result.response.headers.get("Location"));
				expect(loc.pathname).toBe("/");
				expect(loc.searchParams.get("ref")).toBe("x");
			}
		});
	});

	describe("Accept-Language first visit only", () => {
		it("/ + Accept-Language: de → 302 → /de (first visit, supported)", async () => {
			const mw = i18n();
			const ctx = makeCtxWithHeaders("https://example.com/", {
				"accept-language": "de,en;q=0.5",
			});
			const result = await mw(ctx);
			if (result.type === "bypass") {
				const loc = locUrl(result.response.headers.get("Location"));
				expect(loc.pathname).toBe("/de");
				expect(result.response.headers.get("Set-Cookie")).toContain("flare.locale=de");
			}
		});

		it("/ + Accept-Language: en → no redirect (default)", async () => {
			const mw = i18n();
			const ctx = makeCtxWithHeaders("https://example.com/", {
				"accept-language": "en",
			});
			const result = await mw(ctx);
			expect(result.type).toBe("next");
		});

		it("/ + no Accept-Language, no cookie → no redirect", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/");
			const result = await mw(ctx);
			expect(result.type).toBe("next");
			expect(ctx.serverContext.locale).toBe("en");
		});

		it("/about + Accept-Language: hr, no cookie → no redirect (non-root)", async () => {
			const mw = i18n();
			const ctx = makeCtxWithHeaders("https://example.com/about", {
				"accept-language": "hr",
			});
			const result = await mw(ctx);
			expect(result.type).toBe("next");
			expect(ctx.serverContext.locale).toBe("en");
		});
	});

	describe("cookie edge cases", () => {
		it("cookie value with unsupported locale is ignored", async () => {
			const mw = i18n();
			const ctx = makeCtxWithHeaders("https://example.com/", {
				cookie: "flare.locale=zz",
			});
			const result = await mw(ctx);
			expect(result.type).toBe("next");
			expect(ctx.serverContext.locale).toBe("en");
		});

		it("empty cookie value is ignored", async () => {
			const mw = i18n();
			const ctx = makeCtxWithHeaders("https://example.com/", {
				cookie: "flare.locale=",
			});
			const result = await mw(ctx);
			expect(result.type).toBe("next");
		});

		it("multiple cookies — flare.locale extracted correctly", async () => {
			const mw = i18n();
			const ctx = makeCtxWithHeaders("https://example.com/hr", {
				cookie: "session=abc; flare.locale=hr; other=xyz",
			});
			await mw(ctx);
			expect(ctx.serverContext.locale).toBe("hr");
			expect(ctx.onResponse).not.toHaveBeenCalled();
		});

		it("cookie with uppercase value is lowercased for matching", async () => {
			const mw = i18n();
			const ctx = makeCtxWithHeaders("https://example.com/", {
				cookie: "flare.locale=HR",
			});
			/* HR lowercased = hr, which IS in localeSet. Cookie-respect redirect fires. */
			const result = await mw(ctx);
			expect(result.type).toBe("bypass");
			if (result.type === "bypass") {
				expect(result.response.status).toBe(302);
				expect(locUrl(result.response.headers.get("Location")).pathname).toBe("/hr/");
			}
		});
	});

	describe("custom cookieName", () => {
		it("reads from custom cookie name", async () => {
			const mw = i18n({ cookieName: "my-locale" });
			const ctx = makeCtxWithHeaders("https://example.com/hr", {
				cookie: "my-locale=hr",
			});
			await mw(ctx);
			expect(ctx.serverContext.locale).toBe("hr");
			expect(ctx.onResponse).not.toHaveBeenCalled();
		});

		it("ignores default cookie name when custom is set", async () => {
			const mw = i18n({ cookieName: "my-locale" });
			const responseHandlers: ((r: Response) => Response)[] = [];
			const ctx = makeCtxWithHeaders("https://example.com/hr", {
				cookie: "flare.locale=hr",
			});
			Object.assign(ctx, {
				onResponse: (handler: unknown) => {
					responseHandlers.push(handler as (r: Response) => Response);
				},
			});
			await mw(ctx);
			/* flare.locale is not recognized → cookieLocale=null → needs cookie update */
			expect(responseHandlers.length).toBeGreaterThan(0);
			const res = responseHandlers[0](new Response());
			expect(res.headers.get("Set-Cookie")).toContain("my-locale=hr");
		});
	});

	describe("LOCALE_LIKE_RE boundary", () => {
		it("single char segment (a) → not locale-like, passes through", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/a/something");
			const result = await mw(ctx);
			/* 'a' is 1 char, regex requires 2-3. Not locale-like → no redirect */
			expect(result.type).toBe("next");
		});

		it("4-char segment (abcd) → not locale-like, passes through", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/abcd/something");
			const result = await mw(ctx);
			expect(result.type).toBe("next");
		});

		it("2-char segment (ab) → locale-like but unsupported → redirect", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/ab/something");
			const result = await mw(ctx);
			expect(result.type).toBe("bypass");
			if (result.type === "bypass") {
				expect(result.response.status).toBe(302);
			}
		});

		it("3-char segment (abc) → not locale-like, passes through", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/abc/something");
			const result = await mw(ctx);
			/* 3-letter primary subtags excluded to avoid false positives (isr-test, env-fn, api) */
			expect(result.type).toBe("next");
		});

		it("segment with numbers (en1) → not locale-like, passes through", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/en1/something");
			const result = await mw(ctx);
			expect(result.type).toBe("next");
		});

		it("multi-subtag (zh-hant-tw) → locale-like", async () => {
			const mw = i18n();
			const ctx = makeCtx("https://example.com/zh-hant-tw/about");
			const result = await mw(ctx);
			/* locale-like but unsupported → redirect */
			expect(result.type).toBe("bypass");
		});
	});
});
