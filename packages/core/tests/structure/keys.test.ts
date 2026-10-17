import { expect, it } from "vitest"
import { storeKey } from "../../src/server/cache/key.ts"
import { matchId } from "../../src/shared/route-tree/index.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter } from "../../src/shared/router/create-router.ts"

// Every route shape of up to three param segments, each a plain, optional, catch-all, or optional catch-all param,
// with a static segment after each, through the real router: two URLs whose raw params differ never share a store key
// or a match id, whatever their values hold, `&`, `=`, `%`, an escape, or nothing (plan 21 7.8).

const KINDS = ["[p]", "[[p]]", "[...p]", "[[...p]]"] as const
const VALUES = ["a", "b", "a&b=c", "%26", "=", "a%2Fb"]

function shapes(depth: number): string[][] {
	if (depth === 0) return [[]]
	return shapes(depth - 1).flatMap((shape) => KINDS.map((kind) => [...shape, kind.replace("p", `p${shape.length}`)]))
}

// The URL segments one param can take: a value, two of them for a catch-all, none for an optional one.
function choices(kind: string): string[][] {
	const one = VALUES.map((value) => [value])
	const many = kind.startsWith("[...") || kind.startsWith("[[...")
	const two = many
		? [
				["a", "b"],
				["a&b", "c"],
			]
		: []
	return [...one, ...two, ...(kind.startsWith("[[") ? [[]] : [])]
}

function product(lists: string[][][]): string[][][] {
	return lists.reduce<string[][][]>((all, list) => all.flatMap((prefix) => list.map((item) => [...prefix, item])), [[]])
}

it("no shared key", () => {
	const root = createRootLayout("_root_").render(() => "root")
	let checked = 0
	for (const shape of [1, 2, 3].flatMap(shapes)) {
		const pattern = shape.map((segment, index) => `${segment}/s${index}`).join("/")
		const id = `_root_/${pattern}`
		const router = createRouter({
			layouts: { _root_: root },
			routeTree: [{ id, path: `/${pattern}`, module: createPage(id as never).render(() => "p") }],
		})
		const seen = new Map<string, string>()
		const ids = new Map<string, string>()
		for (const values of product(shape.map(choices))) {
			const path = `/${values.map((segments, index) => [...segments, `s${index}`].join("/")).join("/")}`
			const matched = router.match(path)
			if (matched.id !== id) continue
			const params = Object.fromEntries(
				Object.entries(matched.params).filter((entry): entry is [string, string | string[]] => entry[1] !== undefined),
			)
			const raw = JSON.stringify(Object.entries(params).toSorted())
			const key = storeKey({ build: "b", route: id, pattern: `/${pattern}`, params, class: "anonymous" })
			const match = matchId(params, "q=1")
			for (const [label, table, value] of [
				["key", seen, key],
				["id", ids, match],
			] as const) {
				const earlier = table.get(value)
				expect(earlier === undefined || earlier === raw, `${label} ${value}: ${earlier} and ${raw}`).toBe(true)
				table.set(value, raw)
			}
			checked += 1
		}
	}
	expect(checked).toBeGreaterThan(1000)
})
