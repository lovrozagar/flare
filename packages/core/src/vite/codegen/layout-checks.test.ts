import { expect, it } from "vitest"
import { assertOneLayout, assertRoot } from "./layout-checks.ts"

const root = { id: "_root_", file: "_root_/root.root-layout.tsx" }
const admin = { id: "_admin_", file: "_admin_/admin.root-layout.tsx" }

// A page passes under its own root's layout, and fails without it; every page missing one is named, by root, and a
// page outside any root folder alone (plan 21 13.3, BUGS.md 206).
it("own root", () => {
	const home = { id: "_root_/", file: "_root_/home.page.tsx" }
	const dash = { id: "_admin_/dash", file: "_admin_/dash/dash.page.tsx" }
	const loose = { id: "about", file: "about/about.page.tsx" }
	expect(() => assertRoot([home, dash], [root, admin])).not.toThrow()
	expect(() => assertRoot([home, dash, loose], [root, { id: "_root_/(a)", file: "_root_/(a)/a.layout.tsx" }])).toThrow(
		"no root layout for _admin_: _admin_/dash/dash.page.tsx; no root layout for about/about.page.tsx",
	)
})

// Each layout id has one file, whatever order the files come in.
it("one layout", () => {
	expect(() => assertOneLayout([root, admin])).not.toThrow()
	const twin = { id: "_root_", file: "_root_/main.layout.tsx" }
	expect(() => assertOneLayout([root, twin])).toThrow(
		"two layouts for _root_: _root_/main.layout.tsx, _root_/root.root-layout.tsx",
	)
	expect(() => assertOneLayout([twin, root])).toThrow("two layouts for _root_: _root_/main.layout.tsx")
})
