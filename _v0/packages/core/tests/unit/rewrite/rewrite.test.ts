import { describe, expect, it } from "vitest";
import {
	composeRewrites,
	executeRewriteInput,
	executeRewriteOutput,
	type LocationRewrite,
	rewriteBasePath,
} from "../../../src/rewrite/index.ts";

describe("executeRewriteInput", () => {
	it("returns original URL when rewrite is undefined", () => {
		const url = new URL("http://localhost/about");
		const result = executeRewriteInput(undefined, url);
		expect(result).toBe(url);
	});

	it("returns original URL when input returns undefined", () => {
		const rewrite: LocationRewrite = { input: () => undefined };
		const url = new URL("http://localhost/about");
		const result = executeRewriteInput(rewrite, url);
		expect(result).toBe(url);
	});

	it("returns new URL from string result", () => {
		const rewrite: LocationRewrite = {
			input: ({ url }) => url.href.replace("/old", "/new"),
		};
		const url = new URL("http://localhost/old/page");
		const result = executeRewriteInput(rewrite, url);
		expect(result.pathname).toBe("/new/page");
	});

	it("returns URL instance from URL result", () => {
		const rewrite: LocationRewrite = {
			input: ({ url }) => {
				const next = new URL(url);
				next.pathname = "/rewritten";
				return next;
			},
		};
		const url = new URL("http://localhost/original");
		const result = executeRewriteInput(rewrite, url);
		expect(result.pathname).toBe("/rewritten");
		expect(result).not.toBe(url);
	});

	it("skips when input function is missing", () => {
		const rewrite: LocationRewrite = { output: () => undefined };
		const url = new URL("http://localhost/about");
		const result = executeRewriteInput(rewrite, url);
		expect(result).toBe(url);
	});

	it("preserves search params and hash", () => {
		const rewrite: LocationRewrite = {
			input: ({ url }) => {
				const next = new URL(url);
				next.pathname = "/target";
				return next;
			},
		};
		const url = new URL("http://localhost/source?q=1#section");
		const result = executeRewriteInput(rewrite, url);
		expect(result.pathname).toBe("/target");
		expect(result.search).toBe("?q=1");
		expect(result.hash).toBe("#section");
	});
});

describe("executeRewriteOutput", () => {
	it("returns original URL when rewrite is undefined", () => {
		const url = new URL("http://localhost/about");
		const result = executeRewriteOutput(undefined, url);
		expect(result).toBe(url);
	});

	it("returns original URL when output returns undefined", () => {
		const rewrite: LocationRewrite = { output: () => undefined };
		const url = new URL("http://localhost/about");
		const result = executeRewriteOutput(rewrite, url);
		expect(result).toBe(url);
	});

	it("returns new URL from string result", () => {
		const rewrite: LocationRewrite = {
			output: ({ url }) => url.href.replace("/internal", "/public"),
		};
		const url = new URL("http://localhost/internal/page");
		const result = executeRewriteOutput(rewrite, url);
		expect(result.pathname).toBe("/public/page");
	});

	it("returns URL instance from URL result", () => {
		const rewrite: LocationRewrite = {
			output: ({ url }) => {
				const next = new URL(url);
				next.pathname = `/en${url.pathname}`;
				return next;
			},
		};
		const url = new URL("http://localhost/about");
		const result = executeRewriteOutput(rewrite, url);
		expect(result.pathname).toBe("/en/about");
	});

	it("skips when output function is missing", () => {
		const rewrite: LocationRewrite = { input: () => undefined };
		const url = new URL("http://localhost/about");
		const result = executeRewriteOutput(rewrite, url);
		expect(result).toBe(url);
	});
});

describe("composeRewrites", () => {
	it("returns identity rewrite for empty array", () => {
		const composed = composeRewrites([]);
		const url = new URL("http://localhost/test");
		expect(executeRewriteInput(composed, url)).toBe(url);
		expect(executeRewriteOutput(composed, url)).toBe(url);
	});

	it("single rewrite passes through", () => {
		const r: LocationRewrite = {
			input: ({ url }) => {
				const next = new URL(url);
				next.pathname = url.pathname.replace("/a", "/b");
				return next;
			},
			output: ({ url }) => {
				const next = new URL(url);
				next.pathname = url.pathname.replace("/b", "/a");
				return next;
			},
		};
		const composed = composeRewrites([r]);

		const inputUrl = new URL("http://localhost/a/page");
		expect(executeRewriteInput(composed, inputUrl).pathname).toBe("/b/page");

		const outputUrl = new URL("http://localhost/b/page");
		expect(executeRewriteOutput(composed, outputUrl).pathname).toBe("/a/page");
	});

	it("input runs left-to-right", () => {
		const first: LocationRewrite = {
			input: ({ url }) => {
				const next = new URL(url);
				next.pathname = url.pathname.replace("/en", "");
				return next;
			},
		};
		const second: LocationRewrite = {
			input: ({ url }) => {
				const next = new URL(url);
				next.pathname = url.pathname.replace("/old", "/new");
				return next;
			},
		};

		const composed = composeRewrites([first, second]);
		const url = new URL("http://localhost/en/old/page");
		const result = executeRewriteInput(composed, url);
		expect(result.pathname).toBe("/new/page");
	});

	it("output runs right-to-left", () => {
		const first: LocationRewrite = {
			output: ({ url }) => {
				const next = new URL(url);
				next.pathname = `/en${url.pathname}`;
				return next;
			},
		};
		const second: LocationRewrite = {
			output: ({ url }) => {
				const next = new URL(url);
				next.pathname = url.pathname.replace("/new", "/old");
				return next;
			},
		};

		const composed = composeRewrites([first, second]);
		const url = new URL("http://localhost/new/page");
		const result = executeRewriteOutput(composed, url);
		/* second runs first (right-to-left): /new/page → /old/page */
		/* first runs second: /old/page → /en/old/page */
		expect(result.pathname).toBe("/en/old/page");
	});

	it("handles mixed rewrites — some with only input, some with only output", () => {
		const inputOnly: LocationRewrite = {
			input: ({ url }) => {
				const next = new URL(url);
				next.pathname = url.pathname.replace("/alias", "/real");
				return next;
			},
		};
		const outputOnly: LocationRewrite = {
			output: ({ url }) => {
				const next = new URL(url);
				next.pathname = url.pathname.replace("/real", "/alias");
				return next;
			},
		};

		const composed = composeRewrites([inputOnly, outputOnly]);

		const inputUrl = new URL("http://localhost/alias/page");
		expect(executeRewriteInput(composed, inputUrl).pathname).toBe("/real/page");

		const outputUrl = new URL("http://localhost/real/page");
		expect(executeRewriteOutput(composed, outputUrl).pathname).toBe("/alias/page");
	});

	it("rewrite returning undefined skips — next rewrite sees original URL", () => {
		const noop: LocationRewrite = { input: () => undefined };
		const real: LocationRewrite = {
			input: ({ url }) => {
				const next = new URL(url);
				next.pathname = "/rewritten";
				return next;
			},
		};

		const composed = composeRewrites([noop, real]);
		const url = new URL("http://localhost/original");
		expect(executeRewriteInput(composed, url).pathname).toBe("/rewritten");
	});
});

describe("rewriteBasePath", () => {
	it("strips basePath on input", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" });
		const url = new URL("http://localhost/app/about");
		const result = executeRewriteInput(rewrite, url);
		expect(result.pathname).toBe("/about");
	});

	it("input: /basePath → /", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" });
		const url = new URL("http://localhost/app");
		const result = executeRewriteInput(rewrite, url);
		expect(result.pathname).toBe("/");
	});

	it("input passes through non-matching paths unchanged", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" });
		const url = new URL("http://localhost/other/page");
		const result = executeRewriteInput(rewrite, url);
		expect(result.pathname).toBe("/other/page");
	});

	it("prepends basePath on output", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" });
		const url = new URL("http://localhost/about");
		const result = executeRewriteOutput(rewrite, url);
		expect(result.pathname).toBe("/app/about");
	});

	it("output: / → /basePath", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" });
		const url = new URL("http://localhost/");
		const result = executeRewriteOutput(rewrite, url);
		expect(result.pathname).toBe("/app");
	});

	it("preserves search params through input", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" });
		const url = new URL("http://localhost/app/page?key=val");
		const result = executeRewriteInput(rewrite, url);
		expect(result.pathname).toBe("/page");
		expect(result.search).toBe("?key=val");
	});

	it("preserves search params through output", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" });
		const url = new URL("http://localhost/page?key=val");
		const result = executeRewriteOutput(rewrite, url);
		expect(result.pathname).toBe("/app/page");
		expect(result.search).toBe("?key=val");
	});

	it("case-insensitive matching when configured", () => {
		const rewrite = rewriteBasePath({ basePath: "/App", caseSensitive: false });
		const url = new URL("http://localhost/app/about");
		const result = executeRewriteInput(rewrite, url);
		expect(result.pathname).toBe("/about");
	});

	it("case-sensitive matching by default", () => {
		const rewrite = rewriteBasePath({ basePath: "/App" });
		const url = new URL("http://localhost/app/about");
		const result = executeRewriteInput(rewrite, url);
		/* should NOT strip — case mismatch */
		expect(result.pathname).toBe("/app/about");
	});

	it("composes with other rewrites", () => {
		const base = rewriteBasePath({ basePath: "/app" });
		const locale: LocationRewrite = {
			input: ({ url }) => {
				const match = url.pathname.match(/^\/(en|fr)(\/.*)/);
				if (match) {
					const next = new URL(url);
					next.pathname = match[2] ?? "/";
					return next;
				}
				return undefined;
			},
			output: ({ url }) => {
				const next = new URL(url);
				next.pathname = `/en${url.pathname}`;
				return next;
			},
		};

		const composed = composeRewrites([base, locale]);

		/* input: /app/en/about → /en/about (strip base) → /about (strip locale) */
		const inputUrl = new URL("http://localhost/app/en/about");
		expect(executeRewriteInput(composed, inputUrl).pathname).toBe("/about");

		/* output: /about → /en/about (add locale) → /app/en/about (add base) */
		const outputUrl = new URL("http://localhost/about");
		expect(executeRewriteOutput(composed, outputUrl).pathname).toBe("/app/en/about");
	});

	it("handles trailing slash on basePath", () => {
		const rewrite = rewriteBasePath({ basePath: "/app/" });
		const url = new URL("http://localhost/app/about");
		const result = executeRewriteInput(rewrite, url);
		expect(result.pathname).toBe("/about");
	});

	it("handles nested basePath", () => {
		const rewrite = rewriteBasePath({ basePath: "/org/app" });
		const url = new URL("http://localhost/org/app/dashboard");
		const result = executeRewriteInput(rewrite, url);
		expect(result.pathname).toBe("/dashboard");
	});

	it("output avoids double slash", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" });
		const url = new URL("http://localhost/");
		const result = executeRewriteOutput(rewrite, url);
		/* /app + / should be /app, not /app/ */
		expect(result.pathname).toBe("/app");
	});
});
