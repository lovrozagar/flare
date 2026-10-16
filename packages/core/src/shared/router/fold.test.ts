import { expect, it } from "vitest"
import { createRouter, type RouteNode } from "./create-router.ts"
import { foldCase } from "./fold.ts"

// The rows are server/lifecycle/canonical-redirect.test.ts. These cases hold the fold alone.
const page = (id: string, path: string): RouteNode => ({ id, path, module: {} })

it("route spelling", () => {
	const router = createRouter({
		basePath: "/app",
		layouts: { _root_: {} },
		routeTree: [
			page("_root_/", "/"),
			page("_root_/[[locale]]/Docs/[...rest]", "/[[locale]]/Docs/[...rest]"),
			page("_root_/[_]id]", "/[_]id]"),
		],
		locale: { locales: ["en-US", "hr"], defaultLocale: "hr" },
	})
	expect(foldCase(router, "/app/EN-US/docs/A/b%C4%8D/")).toBe("/app/en-US/Docs/A/b%C4%8D/")
	expect(foldCase(router, "/app/docs/X")).toBe("/app/Docs/X")
	// `FR` is no configured tag, so it is an ordinary segment, no route matches, and nothing folds (plan 21 3.8).
	expect(foldCase(router, "/app/FR/docs/X")).toBe("/app/FR/docs/X")
	expect(foldCase(router, "/app/[ID]")).toBe("/app/[id]")
	expect(foldCase(router, "/app")).toBe("/app")
	expect(foldCase(router, "/app/")).toBe("/app/")
	expect(foldCase(router, "/elsewhere/X")).toBe("/elsewhere/X")
	// The fold reads only its router's match. Given one that takes any locale value, an unconfigured tag stays as sent.
	const open = createRouter({
		basePath: "/app",
		layouts: { _root_: {} },
		routeTree: [page("_root_/[[locale]]/Docs/[...rest]", "/[[locale]]/Docs/[...rest]")],
	})
	expect(foldCase({ match: open.match, basePath: "/app", locale: router.locale }, "/app/FR/docs/X")).toBe(
		"/app/FR/Docs/X",
	)
	// Without a locale config, a param is never respelled.
	const plain = createRouter({ layouts: { _root_: {} }, routeTree: [page("_root_/[locale]", "/[locale]")] })
	expect(foldCase(plain, "/EN-US")).toBe("/EN-US")
})
