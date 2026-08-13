import { bench, describe } from "vitest"
import { computeMatchId, parseMatchId } from "../src/router-primitives/match-id"

describe("computeMatchId", () => {
	bench("simple route — no deps", () => {
		computeMatchId({
			loaderDeps: () => [],
			params: { id: "42" },
			routeId: "/users/[id]",
			search: {},
		})
	})

	bench("route with loader deps", () => {
		computeMatchId({
			loaderDeps: () => [{ key: "page" }, { key: "sort" }],
			params: { id: "42" },
			routeId: "/users/[id]/posts",
			search: { page: "1", sort: "name" },
		})
	})

	bench("nested params", () => {
		computeMatchId({
			loaderDeps: () => [],
			params: { category: "tech", locale: "en", slug: "intro" },
			routeId: "/[locale]/blog/[category]/[slug]",
			search: {},
		})
	})
})

describe("parseMatchId", () => {
	const id = computeMatchId({
		loaderDeps: () => [{ key: "page" }],
		params: { id: "42" },
		routeId: "/users/[id]",
		search: { page: "3" },
	})

	bench("parse valid id", () => {
		parseMatchId(id)
	})

	bench("parse invalid id", () => {
		parseMatchId("garbage-string")
	})
})
