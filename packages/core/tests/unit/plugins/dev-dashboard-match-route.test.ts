import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { collectLocaleMatch } from "../../../src/plugins/dev-dashboard/plugin.ts"
import {
	extractLocaleMatchFromModule,
	matchRouteTree,
	type MatchTreeNode,
} from "../../../src/plugins/dev-dashboard/match-route-tree.ts"

const EN_LOCALE = { paramName: "locale", locales: ["en", "hr"] } as const

function node(segment: string, children: MatchTreeNode[] = []): MatchTreeNode {
	return { children, segment }
}

describe("matchRouteTree — locale allow-list", () => {
	it("/docs against required [locale] is not consumed as locale", () => {
		const tree = [node("", [node("[locale]")])]
		const result = matchRouteTree(tree, "/docs", EN_LOCALE)
		expect(result.params.locale).toBeUndefined()
	})

	it("/en against required [locale] is consumed", () => {
		const tree = [node("", [node("[locale]")])]
		const result = matchRouteTree(tree, "/en", EN_LOCALE)
		expect(result.params).toEqual({ locale: "en" })
	})

	it("/about prefers static sibling over [locale] when allow-list is set", () => {
		const tree = [node("", [node("[locale]"), node("about")])]
		const result = matchRouteTree(tree, "/about", EN_LOCALE)
		expect(result.params.locale).toBeUndefined()
		expect(result.chain.some((c) => c.node.segment === "about")).toBe(true)
	})

	it("/docs against [locale] without localeMatch is greedy", () => {
		const tree = [node("", [node("[locale]")])]
		const result = matchRouteTree(tree, "/docs")
		expect(result.params).toEqual({ locale: "docs" })
	})

	it("/about against [[locale]]/about skips optional locale", () => {
		const tree = [node("", [node("[[locale]]", [node("about")])])]
		const result = matchRouteTree(tree, "/about", EN_LOCALE)
		expect(result.params.locale).toBeUndefined()
		expect(result.chain.some((c) => c.node.segment === "about")).toBe(true)
	})

	it("/en/about against [[locale]]/about consumes locale", () => {
		const tree = [node("", [node("[[locale]]", [node("about")])])]
		const result = matchRouteTree(tree, "/en/about", EN_LOCALE)
		expect(result.params).toEqual({ locale: "en" })
		expect(result.chain.some((c) => c.node.segment === "about")).toBe(true)
	})

	it("/docs against [[locale]] is not consumed", () => {
		const tree = [node("", [node("[[locale]]")])]
		const result = matchRouteTree(tree, "/docs", EN_LOCALE)
		expect(result.params.locale).toBeUndefined()
	})

	it("/[id] is not constrained by locale allow-list", () => {
		const tree = [node("", [node("users", [node("[id]")])])]
		const result = matchRouteTree(tree, "/users/docs", EN_LOCALE)
		expect(result.params).toEqual({ id: "docs" })
	})

	it("/en matches [locale] even when that node has unused children", () => {
		const tree = [node("", [node("[locale]", [node("about")])])]
		const result = matchRouteTree(tree, "/en", EN_LOCALE)
		expect(result.params).toEqual({ locale: "en" })
		expect(result.chain.some((c) => c.node.segment === "[locale]")).toBe(true)
		expect(result.chain.some((c) => c.node.segment === "about")).toBe(false)
	})

	it("/about matches a static node that still has children", () => {
		const tree = [node("", [node("about", [node("settings")])])]
		const result = matchRouteTree(tree, "/about")
		expect(result.chain.some((c) => c.node.segment === "about")).toBe(true)
		expect(result.chain.some((c) => c.node.segment === "settings")).toBe(false)
	})
})

describe("extractLocaleMatchFromModule", () => {
	it("reads named localeConfig export", () => {
		expect(
			extractLocaleMatchFromModule({
				localeConfig: { defaultLocale: "en", locales: ["en", "hr"], paramName: "locale" },
			}),
		).toEqual({ locales: ["en", "hr"], paramName: "locale" })
	})

	it("falls back to router.locale", () => {
		expect(
			extractLocaleMatchFromModule({
				router: { locale: { locales: ["en", "fr"], paramName: "lang" } },
			}),
		).toEqual({ locales: ["en", "fr"], paramName: "lang" })
	})

	it("defaults paramName to locale when omitted", () => {
		expect(extractLocaleMatchFromModule({ localeConfig: { locales: ["en"] } })).toEqual({
			locales: ["en"],
			paramName: "locale",
		})
	})

	it("returns undefined when no locale config is present", () => {
		expect(extractLocaleMatchFromModule({ router: { routeTree: {} } })).toBeUndefined()
		expect(extractLocaleMatchFromModule({})).toBeUndefined()
	})

	it("ignores malformed locales arrays", () => {
		expect(extractLocaleMatchFromModule({ localeConfig: { locales: [1, 2] } })).toBeUndefined()
		expect(extractLocaleMatchFromModule({ localeConfig: { locales: "en" } })).toBeUndefined()
	})
})

describe("collectLocaleMatch", () => {
	const roots: string[] = []

	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { force: true, recursive: true })
		}
	})

	function makeRoot(fileName: "router.ts" | "router.tsx"): string {
		const root = join(tmpdir(), `flare-locale-match-${Date.now()}-${Math.random().toString(16).slice(2)}`)
		mkdirSync(join(root, "src"), { recursive: true })
		writeFileSync(join(root, "src", fileName), "export const localeConfig = { locales: ['en'] }\n")
		roots.push(root)
		return root
	}

	it("returns undefined without an SSR runner", async () => {
		expect(await collectLocaleMatch(undefined, makeRoot("router.ts"))).toBeUndefined()
	})

	it("returns undefined when no router file exists", async () => {
		const root = join(tmpdir(), `flare-locale-match-empty-${Date.now()}`)
		mkdirSync(root, { recursive: true })
		roots.push(root)
		const runner = { import: async () => ({ localeConfig: { locales: ["en"] } }) }
		expect(await collectLocaleMatch(runner, root)).toBeUndefined()
	})

	it("imports ./src/router.ts and extracts localeMatch", async () => {
		const root = makeRoot("router.ts")
		const seen: string[] = []
		const runner = {
			import: async (id: string) => {
				seen.push(id)
				return {
					localeConfig: { locales: ["en", "hr", "fr"], paramName: "locale" },
				}
			},
		}
		expect(await collectLocaleMatch(runner, root)).toEqual({
			locales: ["en", "hr", "fr"],
			paramName: "locale",
		})
		expect(seen).toEqual(["./src/router.ts"])
	})

	it("falls through when the runner throws", async () => {
		const root = makeRoot("router.ts")
		const runner = {
			import: async () => {
				throw new Error("ssr boom")
			},
		}
		expect(await collectLocaleMatch(runner, root)).toBeUndefined()
	})
})
