import { describe, expect, it } from "vitest"
import {
	composeRewrites,
	executeRewriteInput,
	executeRewriteOutput,
	type LocationRewrite,
	rewriteBasePath,
} from "../../../src/rewrite/index.ts"

/* ── Rewrite error resilience ─────────────────────────────────────────── */

describe("rewrite error resilience", () => {
	it("input throwing error returns original URL (caught)", () => {
		const rewrite: LocationRewrite = {
			input: () => {
				throw new Error("boom")
			},
		}
		const url = new URL("http://localhost/about")
		const result = executeRewriteInput(rewrite, url)
		expect(result.href).toBe(url.href)
	})

	it("output throwing error returns original URL (caught)", () => {
		const rewrite: LocationRewrite = {
			output: () => {
				throw new Error("boom")
			},
		}
		const url = new URL("http://localhost/about")
		const result = executeRewriteOutput(rewrite, url)
		expect(result.href).toBe(url.href)
	})

	it("empty LocationRewrite object is identity", () => {
		const rewrite: LocationRewrite = {}
		const url = new URL("http://localhost/about?q=1#sec")
		expect(executeRewriteInput(rewrite, url)).toBe(url)
		expect(executeRewriteOutput(rewrite, url)).toBe(url)
	})
})

/* ── String return edge cases ─────────────────────────────────────────── */

describe("string return edge cases", () => {
	it("input returning relative string resolves against base URL", () => {
		const rewrite: LocationRewrite = {
			input: () => "/relative-path",
		}
		const url = new URL("http://localhost/about")
		const result = executeRewriteInput(rewrite, url)
		expect(result.pathname).toBe("/relative-path")
		expect(result.origin).toBe("http://localhost")
	})

	it("input returning full URL string works", () => {
		const rewrite: LocationRewrite = {
			input: () => "http://localhost/rewritten",
		}
		const url = new URL("http://localhost/about")
		expect(executeRewriteInput(rewrite, url).pathname).toBe("/rewritten")
	})

	it("output returning full URL string with search + hash", () => {
		const rewrite: LocationRewrite = {
			output: () => "http://localhost/out?x=1#top",
		}
		const url = new URL("http://localhost/in")
		const result = executeRewriteOutput(rewrite, url)
		expect(result.pathname).toBe("/out")
		expect(result.search).toBe("?x=1")
		expect(result.hash).toBe("#top")
	})
})

/* ── Composition of 3+ rewrites ───────────────────────────────────────── */

describe("composition of 3+ rewrites", () => {
	it("input: 3 rewrites chain left-to-right", () => {
		const stripApp = rewriteBasePath({ basePath: "/app" })
		const stripLocale: LocationRewrite = {
			input: ({ url }) => {
				const m = url.pathname.match(/^\/(en|fr|de)(\/.*)$/)
				if (m) {
					const next = new URL(url)
					next.pathname = m[2] ?? "/"
					return next
				}
				return undefined
			},
		}
		const aliasOldNew: LocationRewrite = {
			input: ({ url }) => {
				if (url.pathname.startsWith("/old/")) {
					const next = new URL(url)
					next.pathname = url.pathname.replace("/old/", "/new/")
					return next
				}
				return undefined
			},
		}

		const composed = composeRewrites([stripApp, stripLocale, aliasOldNew])
		const url = new URL("http://localhost/app/fr/old/page")
		const result = executeRewriteInput(composed, url)
		/* /app/fr/old/page → /fr/old/page → /old/page → /new/page */
		expect(result.pathname).toBe("/new/page")
	})

	it("output: 3 rewrites chain right-to-left", () => {
		const prependApp = rewriteBasePath({ basePath: "/app" })
		const addLocale: LocationRewrite = {
			output: ({ url }) => {
				const next = new URL(url)
				next.pathname = `/en${url.pathname === "/" ? "" : url.pathname}`
				return next
			},
		}
		const addVersion: LocationRewrite = {
			output: ({ url }) => {
				const next = new URL(url)
				next.pathname = `/v2${url.pathname}`
				return next
			},
		}

		const composed = composeRewrites([prependApp, addLocale, addVersion])
		const url = new URL("http://localhost/page")
		const result = executeRewriteOutput(composed, url)
		/* right-to-left: /page → /v2/page → /en/v2/page → /app/en/v2/page */
		expect(result.pathname).toBe("/app/en/v2/page")
	})

	it("round-trip: 3 rewrites compose and invert correctly", () => {
		const base = rewriteBasePath({ basePath: "/app" })
		const locale: LocationRewrite = {
			input: ({ url }) => {
				const m = url.pathname.match(/^\/(en|fr)(\/.*)$/)
				if (m) {
					const next = new URL(url)
					next.pathname = m[2] ?? "/"
					return next
				}
				return undefined
			},
			output: ({ url }) => {
				const next = new URL(url)
				next.pathname = `/en${url.pathname === "/" ? "" : url.pathname}`
				return next
			},
		}
		const tenant: LocationRewrite = {
			input: ({ url }) => {
				const m = url.pathname.match(/^\/t-(\w+)(\/.*)$/)
				if (m) {
					const next = new URL(url)
					next.pathname = m[2] ?? "/"
					return next
				}
				return undefined
			},
			output: ({ url }) => {
				const next = new URL(url)
				next.pathname = `/t-acme${url.pathname === "/" ? "" : url.pathname}`
				return next
			},
		}

		const composed = composeRewrites([base, locale, tenant])

		/* input: /app/en/t-acme/dashboard → /en/t-acme/dashboard → /t-acme/dashboard → /dashboard */
		const inputUrl = new URL("http://localhost/app/en/t-acme/dashboard")
		const internal = executeRewriteInput(composed, inputUrl)
		expect(internal.pathname).toBe("/dashboard")

		/* output: /dashboard → /t-acme/dashboard → /en/t-acme/dashboard → /app/en/t-acme/dashboard */
		const browser = executeRewriteOutput(composed, internal)
		expect(browser.pathname).toBe("/app/en/t-acme/dashboard")
	})
})

/* ── Unicode & encoded paths ──────────────────────────────────────────── */

describe("unicode and encoded paths", () => {
	it("rewrite handles encoded characters in pathname", () => {
		const rewrite: LocationRewrite = {
			input: ({ url }) => {
				const next = new URL(url)
				next.pathname = url.pathname.replace("/blog/", "/articles/")
				return next
			},
		}
		const url = new URL("http://localhost/blog/caf%C3%A9-guide")
		const result = executeRewriteInput(rewrite, url)
		expect(result.pathname).toBe("/articles/caf%C3%A9-guide")
	})

	it("basePath handles encoded segment boundaries", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" })
		/* /app%2Fabout is NOT /app/about — %2F is a literal slash in the path segment */
		const url = new URL("http://localhost/app%2Fabout")
		const result = executeRewriteInput(rewrite, url)
		/* should not match since the decoded path is /app/about but URL-encoded differently */
		expect(result.pathname).not.toBe("/about")
	})

	it("rewrite preserves unicode in search params", () => {
		const rewrite: LocationRewrite = {
			input: ({ url }) => {
				const next = new URL(url)
				next.pathname = "/target"
				return next
			},
		}
		const url = new URL("http://localhost/source?name=%E4%B8%AD%E6%96%87")
		const result = executeRewriteInput(rewrite, url)
		expect(result.pathname).toBe("/target")
		expect(result.searchParams.get("name")).toBe("中文")
	})
})

/* ── Search params mutation in rewrite ────────────────────────────────── */

describe("search params mutation in rewrite", () => {
	it("input rewrite can add search params", () => {
		const rewrite: LocationRewrite = {
			input: ({ url }) => {
				const next = new URL(url)
				next.searchParams.set("source", "rewrite")
				return next
			},
		}
		const url = new URL("http://localhost/page?q=test")
		const result = executeRewriteInput(rewrite, url)
		expect(result.searchParams.get("q")).toBe("test")
		expect(result.searchParams.get("source")).toBe("rewrite")
	})

	it("input rewrite can remove search params", () => {
		const rewrite: LocationRewrite = {
			input: ({ url }) => {
				const next = new URL(url)
				next.searchParams.delete("tracking")
				return next
			},
		}
		const url = new URL("http://localhost/page?q=test&tracking=abc")
		const result = executeRewriteInput(rewrite, url)
		expect(result.searchParams.get("q")).toBe("test")
		expect(result.searchParams.has("tracking")).toBe(false)
	})

	it("output rewrite can modify hash", () => {
		const rewrite: LocationRewrite = {
			output: ({ url }) => {
				const next = new URL(url)
				if (!url.hash) next.hash = "#default"
				return next
			},
		}
		const url = new URL("http://localhost/page")
		const result = executeRewriteOutput(rewrite, url)
		expect(result.hash).toBe("#default")
	})

	it("output rewrite preserves existing hash", () => {
		const rewrite: LocationRewrite = {
			output: ({ url }) => {
				const next = new URL(url)
				if (!url.hash) next.hash = "#default"
				return next
			},
		}
		const url = new URL("http://localhost/page#custom")
		const result = executeRewriteOutput(rewrite, url)
		expect(result.hash).toBe("#custom")
	})
})

/* ── basePath advanced edge cases ─────────────────────────────────────── */

describe("basePath advanced edge cases", () => {
	it("segment boundary: /app vs /application", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" })
		const url = new URL("http://localhost/application/about")
		const result = executeRewriteInput(rewrite, url)
		/* /application should NOT match /app — not a segment boundary */
		expect(result.pathname).toBe("/application/about")
	})

	it("segment boundary: /app vs /app-v2", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" })
		const url = new URL("http://localhost/app-v2/about")
		const result = executeRewriteInput(rewrite, url)
		expect(result.pathname).toBe("/app-v2/about")
	})

	it("deeply nested basePath with trailing slash", () => {
		const rewrite = rewriteBasePath({ basePath: "/org/team/app/" })
		const url = new URL("http://localhost/org/team/app/dashboard")
		const result = executeRewriteInput(rewrite, url)
		expect(result.pathname).toBe("/dashboard")
	})

	it("basePath output for root preserves search", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" })
		const url = new URL("http://localhost/?q=test&page=2")
		const result = executeRewriteOutput(rewrite, url)
		expect(result.pathname).toBe("/app")
		expect(result.search).toBe("?q=test&page=2")
	})

	it("case-insensitive basePath preserves original casing in rest", () => {
		const rewrite = rewriteBasePath({ basePath: "/APP", caseSensitive: false })
		const url = new URL("http://localhost/app/Dashboard")
		const result = executeRewriteInput(rewrite, url)
		expect(result.pathname).toBe("/Dashboard")
	})

	it("basePath root match is exact", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" })
		const url = new URL("http://localhost/app")
		const result = executeRewriteInput(rewrite, url)
		expect(result.pathname).toBe("/")
	})

	it("basePath root match with trailing slash", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" })
		const url = new URL("http://localhost/app/")
		const result = executeRewriteInput(rewrite, url)
		expect(result.pathname).toBe("/")
	})
})

/* ── Composition edge cases ───────────────────────────────────────────── */

describe("composition edge cases", () => {
	it("all rewrites return undefined — identity", () => {
		const a: LocationRewrite = { input: () => undefined }
		const b: LocationRewrite = { input: () => undefined }
		const c: LocationRewrite = { input: () => undefined }

		const composed = composeRewrites([a, b, c])
		const url = new URL("http://localhost/test")
		expect(executeRewriteInput(composed, url).pathname).toBe("/test")
	})

	it("composed rewrite passes modified URL to next rewrite", () => {
		/* first rewrite changes /a → /b, second should see /b */
		const log: string[] = []
		const first: LocationRewrite = {
			input: ({ url }) => {
				log.push(`first sees: ${url.pathname}`)
				const next = new URL(url)
				next.pathname = "/b"
				return next
			},
		}
		const second: LocationRewrite = {
			input: ({ url }) => {
				log.push(`second sees: ${url.pathname}`)
				return undefined
			},
		}

		const composed = composeRewrites([first, second])
		executeRewriteInput(composed, new URL("http://localhost/a"))

		expect(log).toEqual(["first sees: /a", "second sees: /b"])
	})

	it("output composition: later rewrite output applied first", () => {
		const log: string[] = []
		const first: LocationRewrite = {
			output: ({ url }) => {
				log.push(`first output sees: ${url.pathname}`)
				return undefined
			},
		}
		const second: LocationRewrite = {
			output: ({ url }) => {
				log.push(`second output sees: ${url.pathname}`)
				const next = new URL(url)
				next.pathname = "/modified"
				return next
			},
		}

		const composed = composeRewrites([first, second])
		executeRewriteOutput(composed, new URL("http://localhost/original"))

		/* output runs right-to-left: second first, then first */
		expect(log).toEqual(["second output sees: /original", "first output sees: /modified"])
	})

	it("input and output independently compose through mixed rewrites", () => {
		/* rewrite A: input only, rewrite B: output only, rewrite C: both */
		const a: LocationRewrite = {
			input: ({ url }) => {
				if (url.pathname.startsWith("/v1/")) {
					const next = new URL(url)
					next.pathname = url.pathname.replace("/v1/", "/")
					return next
				}
				return undefined
			},
		}
		const b: LocationRewrite = {
			output: ({ url }) => {
				const next = new URL(url)
				next.pathname = `/v1${url.pathname}`
				return next
			},
		}
		const c: LocationRewrite = {
			input: ({ url }) => {
				if (url.pathname === "/home") {
					const next = new URL(url)
					next.pathname = "/"
					return next
				}
				return undefined
			},
			output: ({ url }) => {
				if (url.pathname === "/") {
					const next = new URL(url)
					next.pathname = "/home"
					return next
				}
				return undefined
			},
		}

		const composed = composeRewrites([a, b, c])

		/* input: /v1/home → /home (strip v1) → / (home alias) */
		expect(executeRewriteInput(composed, new URL("http://localhost/v1/home")).pathname).toBe("/")

		/* output: / → /home (home alias) → /v1/home (add v1) */
		expect(executeRewriteOutput(composed, new URL("http://localhost/")).pathname).toBe("/v1/home")
	})
})

/* ── applyRewriteOutput (navigation module) ───────────────────────────── */

describe("rewrite patterns — real world scenarios", () => {
	it("multi-tenant: strip tenant prefix on input, add on output", () => {
		const rewrite: LocationRewrite = {
			input: ({ url }) => {
				const m = url.pathname.match(/^\/~(\w+)(\/.*)$/)
				if (m) {
					const next = new URL(url)
					next.pathname = m[2] ?? "/"
					return next
				}
				return undefined
			},
			output: ({ url }) => {
				const next = new URL(url)
				next.pathname = `/~acme${url.pathname === "/" ? "" : url.pathname}`
				return next
			},
		}

		const inputUrl = new URL("http://localhost/~acme/settings")
		expect(executeRewriteInput(rewrite, inputUrl).pathname).toBe("/settings")

		const outputUrl = new URL("http://localhost/settings")
		expect(executeRewriteOutput(rewrite, outputUrl).pathname).toBe("/~acme/settings")
	})

	it("lowercase normalization: case-insensitive routing via rewrite", () => {
		const rewrite: LocationRewrite = {
			input: ({ url }) => {
				const lower = url.pathname.toLowerCase()
				if (lower !== url.pathname) {
					const next = new URL(url)
					next.pathname = lower
					return next
				}
				return undefined
			},
		}

		expect(executeRewriteInput(rewrite, new URL("http://localhost/About/Team")).pathname).toBe(
			"/about/team",
		)
		expect(executeRewriteInput(rewrite, new URL("http://localhost/about/team")).pathname).toBe(
			"/about/team",
		)
	})

	it("vanity URL: map multiple aliases to same target", () => {
		const aliases: Record<string, string> = {
			"/careers": "/about/jobs",
			"/contact": "/about/contact",
			"/pricing": "/plans",
		}

		const rewrite: LocationRewrite = {
			input: ({ url }) => {
				const target = aliases[url.pathname]
				if (target) {
					const next = new URL(url)
					next.pathname = target
					return next
				}
				return undefined
			},
		}

		expect(executeRewriteInput(rewrite, new URL("http://localhost/pricing")).pathname).toBe(
			"/plans",
		)
		expect(executeRewriteInput(rewrite, new URL("http://localhost/careers")).pathname).toBe(
			"/about/jobs",
		)
		expect(executeRewriteInput(rewrite, new URL("http://localhost/normal")).pathname).toBe(
			"/normal",
		)
	})

	it("A/B test: rewrite percentage of traffic to variant", () => {
		/* Deterministic "A/B" rewrite using pathname hash */
		const rewrite: LocationRewrite = {
			input: ({ url }) => {
				if (url.pathname === "/landing") {
					const next = new URL(url)
					next.pathname = "/landing-variant-b"
					return next
				}
				return undefined
			},
		}

		const url = new URL("http://localhost/landing")
		expect(executeRewriteInput(rewrite, url).pathname).toBe("/landing-variant-b")

		/* Other pages unaffected */
		const other = new URL("http://localhost/about")
		expect(executeRewriteInput(rewrite, other).pathname).toBe("/about")
	})
})

/* ── Edge: idempotent rewrites ────────────────────────────────────────── */

describe("idempotent rewrites", () => {
	it("applying input twice gives same result (idempotent)", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" })

		const url = new URL("http://localhost/app/about")
		const once = executeRewriteInput(rewrite, url)
		const twice = executeRewriteInput(rewrite, once)

		/* After stripping /app once, /about doesn't start with /app, so second is identity */
		expect(once.pathname).toBe("/about")
		expect(twice.pathname).toBe("/about")
	})

	it("applying output twice doubles the prefix", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" })

		const url = new URL("http://localhost/about")
		const once = executeRewriteOutput(rewrite, url)
		const twice = executeRewriteOutput(rewrite, once)

		/* Output is NOT idempotent — /about → /app/about → /app/app/about */
		expect(once.pathname).toBe("/app/about")
		expect(twice.pathname).toBe("/app/app/about")
	})
})

/* ── Trailing slash handling ──────────────────────────────────────────── */

describe("trailing slash handling", () => {
	it("input: /app/ trailing slash", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" })
		const url = new URL("http://localhost/app/")
		const result = executeRewriteInput(rewrite, url)
		expect(result.pathname).toBe("/")
	})

	it("input: /app/about/ trailing slash preserved in rest", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" })
		const url = new URL("http://localhost/app/about/")
		const result = executeRewriteInput(rewrite, url)
		expect(result.pathname).toBe("/about/")
	})

	it("output: / with basePath produces /app not /app/", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" })
		const url = new URL("http://localhost/")
		const result = executeRewriteOutput(rewrite, url)
		expect(result.pathname).toBe("/app")
		expect(result.pathname.endsWith("/")).toBe(false)
	})
})

/* ── Multiple search params ───────────────────────────────────────────── */

describe("multiple search params through rewrite", () => {
	it("preserves multiple search params with same key", () => {
		const rewrite: LocationRewrite = {
			input: ({ url }) => {
				const next = new URL(url)
				next.pathname = "/target"
				return next
			},
		}
		const url = new URL("http://localhost/source?tag=a&tag=b&tag=c")
		const result = executeRewriteInput(rewrite, url)
		expect(result.pathname).toBe("/target")
		expect(result.searchParams.getAll("tag")).toEqual(["a", "b", "c"])
	})

	it("basePath preserves complex search params", () => {
		const rewrite = rewriteBasePath({ basePath: "/app" })
		const url = new URL("http://localhost/app/page?a=1&b=2&c=3&a=4")
		const result = executeRewriteInput(rewrite, url)
		expect(result.pathname).toBe("/page")
		expect(result.searchParams.getAll("a")).toEqual(["1", "4"])
		expect(result.searchParams.get("b")).toBe("2")
		expect(result.searchParams.get("c")).toBe("3")
	})
})
