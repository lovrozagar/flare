import { describe, expect, it } from "vitest";
import {
	composeRewrites,
	executeRewriteInput,
	executeRewriteOutput,
	type LocationRewrite,
	rewriteBasePath,
} from "../../../src/rewrite/index.ts";

/**
 * These tests validate the rewrite pipeline as used by client-side navigation.
 * The actual integration into navigation/link/hydrate is tested via E2E.
 * Here we test the specific patterns the client code uses:
 * - input: browser URL → internal pathname (for route matching)
 * - output: internal pathname → browser URL (for links and history)
 */

describe("client-side rewrite: input (browser → internal)", () => {
	it("i18n: /en/about → /about for route matching", () => {
		const rewrite: LocationRewrite = {
			input: ({ url }) => {
				const match = url.pathname.match(/^\/(en|fr|de)(\/.*)?$/);
				if (match) {
					const next = new URL(url);
					next.pathname = match[2] || "/";
					return next;
				}
				return undefined;
			},
		};
		const url = new URL("http://localhost/en/about");
		expect(executeRewriteInput(rewrite, url).pathname).toBe("/about");
	});

	it("i18n: default locale / stays /", () => {
		const rewrite: LocationRewrite = {
			input: ({ url }) => {
				const match = url.pathname.match(/^\/(en|fr|de)(\/.*)?$/);
				if (match) {
					const next = new URL(url);
					next.pathname = match[2] || "/";
					return next;
				}
				return undefined;
			},
		};
		const url = new URL("http://localhost/about");
		expect(executeRewriteInput(rewrite, url).pathname).toBe("/about");
	});

	it("basePath + i18n composed: /app/fr/about → /about", () => {
		const composed = composeRewrites([
			rewriteBasePath({ basePath: "/app" }),
			{
				input: ({ url }) => {
					const match = url.pathname.match(/^\/(en|fr|de)(\/.*)?$/);
					if (match) {
						const next = new URL(url);
						next.pathname = match[2] || "/";
						return next;
					}
					return undefined;
				},
			},
		]);
		const url = new URL("http://localhost/app/fr/about");
		expect(executeRewriteInput(composed, url).pathname).toBe("/about");
	});
});

describe("client-side rewrite: output (internal → browser)", () => {
	it("i18n: /about → /en/about for link generation", () => {
		const rewrite: LocationRewrite = {
			output: ({ url }) => {
				const next = new URL(url);
				next.pathname = `/en${url.pathname === "/" ? "" : url.pathname}`;
				return next;
			},
		};
		const url = new URL("http://localhost/about");
		expect(executeRewriteOutput(rewrite, url).pathname).toBe("/en/about");
	});

	it("i18n: / → /en for link generation", () => {
		const rewrite: LocationRewrite = {
			output: ({ url }) => {
				const next = new URL(url);
				next.pathname = `/en${url.pathname === "/" ? "" : url.pathname}`;
				return next;
			},
		};
		const url = new URL("http://localhost/");
		expect(executeRewriteOutput(rewrite, url).pathname).toBe("/en");
	});

	it("basePath + i18n composed: /about → /app/en/about for link", () => {
		const composed = composeRewrites([
			rewriteBasePath({ basePath: "/app" }),
			{
				output: ({ url }) => {
					const next = new URL(url);
					next.pathname = `/en${url.pathname === "/" ? "" : url.pathname}`;
					return next;
				},
			},
		]);
		const url = new URL("http://localhost/about");
		const result = executeRewriteOutput(composed, url);
		/* output runs right-to-left: /about → /en/about → /app/en/about */
		expect(result.pathname).toBe("/app/en/about");
	});

	it("output preserves search params", () => {
		const rewrite: LocationRewrite = {
			output: ({ url }) => {
				const next = new URL(url);
				next.pathname = `/en${url.pathname}`;
				return next;
			},
		};
		const url = new URL("http://localhost/about?q=test");
		const result = executeRewriteOutput(rewrite, url);
		expect(result.pathname).toBe("/en/about");
		expect(result.search).toBe("?q=test");
	});

	it("output preserves hash", () => {
		const rewrite: LocationRewrite = {
			output: ({ url }) => {
				const next = new URL(url);
				next.pathname = `/en${url.pathname}`;
				return next;
			},
		};
		const url = new URL("http://localhost/about#section");
		const result = executeRewriteOutput(rewrite, url);
		expect(result.pathname).toBe("/en/about");
		expect(result.hash).toBe("#section");
	});
});

describe("client-side rewrite: round-trip", () => {
	it("input then output is identity for i18n", () => {
		const rewrite: LocationRewrite = {
			input: ({ url }) => {
				const match = url.pathname.match(/^\/(en|fr)(\/.*)?$/);
				if (match) {
					const next = new URL(url);
					next.pathname = match[2] || "/";
					return next;
				}
				return undefined;
			},
			output: ({ url }) => {
				const next = new URL(url);
				next.pathname = `/en${url.pathname === "/" ? "" : url.pathname}`;
				return next;
			},
		};

		const browserUrl = new URL("http://localhost/en/about");
		const internal = executeRewriteInput(rewrite, browserUrl);
		expect(internal.pathname).toBe("/about");

		const backToBrowser = executeRewriteOutput(rewrite, internal);
		expect(backToBrowser.pathname).toBe("/en/about");
	});

	it("basePath round-trip", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" });

		const browserUrl = new URL("http://localhost/app/dashboard");
		const internal = executeRewriteInput(rewrite, browserUrl);
		expect(internal.pathname).toBe("/dashboard");

		const backToBrowser = executeRewriteOutput(rewrite, internal);
		expect(backToBrowser.pathname).toBe("/app/dashboard");
	});
});
