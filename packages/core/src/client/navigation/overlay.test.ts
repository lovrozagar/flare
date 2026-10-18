import { expect, it } from "vitest"
import type { Overlay } from "../../shared/components/index.ts"
import type { Match } from "../../shared/router/create-router.ts"
import type { StoreSnapshot } from "../router/store.ts"
import { createMatchCache } from "../router/match-cache.ts"
import { closesOverlay, overlayFor, showOverlay, type OverlayDeps, type Shown } from "./overlay.ts"

const intercept = { from: ["_root_/"], render: "preview" }
const home = { pathname: "/", search: "", hash: "" }

function target(match: Partial<Match> = {}) {
	return {
		url: "/photos/1",
		location: { pathname: "/photos/1", search: "", hash: "" },
		match: { params: {}, chain: [], ...match },
	}
}

function snapshot(page: string, overlay?: Overlay): StoreSnapshot {
	const matches = [{ id: page, kind: "page" as const, module: {}, params: {}, search: {}, data: null }]
	return overlay === undefined
		? { matches, heads: [], location: home }
		: { matches, heads: [], location: home, overlay }
}

const open: Overlay = {
	route: "_root_/photos/[id]",
	label: "preview",
	data: "P1",
	params: { id: "1" },
	search: {},
	preloader: {},
	location: { pathname: "/photos/1", search: "", hash: "" },
	background: { ...home, params: {} },
}

it("opens from", () => {
	expect(overlayFor(target({ intercept }), snapshot("_root_/"), { trigger: "navigation" })).toBe(intercept)
	expect(overlayFor(target({ intercept }), snapshot("_root_/about"), { trigger: "navigation" })).toBeUndefined()
	expect(overlayFor(target(), snapshot("_root_/"), { trigger: "navigation" })).toBeUndefined()
})

it("revalidation", () => {
	expect(overlayFor(target({ intercept }), snapshot("_root_/", open), { trigger: "revalidation" })).toBe(intercept)
	expect(overlayFor(target({ intercept }), snapshot("_root_/"), { trigger: "revalidation" })).toBeUndefined()
})

it("pop", () => {
	const from = snapshot("_root_/")
	expect(overlayFor(target({ intercept }), from, { trigger: "navigation", pop: true, overlay: true })).toBe(intercept)
	expect(overlayFor(target({ intercept }), from, { trigger: "navigation", pop: true, overlay: false })).toBeUndefined()
})

it("closes", () => {
	expect(closesOverlay(snapshot("_root_/", open), "/")).toEqual(snapshot("_root_/"))
	expect(closesOverlay(snapshot("_root_/", open), "/elsewhere")).toBeUndefined()
	expect(closesOverlay(snapshot("_root_/"), "/")).toBeUndefined()
})

// Opening the overlay pushes its entry. A navigation inside the open overlay with `replace` replaces that entry, so one
// Back still closes it; one without `replace` pushes (plan 21 13.12, BUGS.md 214).
it("overlay entry", () => {
	const written: string[] = []
	const deps = {
		cache: createMatchCache({ staleTime: 0, gcTime: 60_000 }),
		// The store calls `shown` as the commit goes on screen.
		store: { commit: async (_next: unknown, shown?: () => void) => shown?.() },
		history: {
			index: () => 1,
			push: (url: string) => void written.push(`push ${url}`),
			replace: (url: string) => void written.push(`replace ${url}`),
		},
		scroll: { save: () => undefined },
	} as unknown as OverlayDeps
	const page = { id: "_root_/photos/[id]", kind: "page" as const, module: {} }
	const shown = (previous: StoreSnapshot, replace: boolean): Shown => ({
		target: target({ chain: [page] }),
		chain: [page],
		landing: { data: { [page.id]: "P1" }, heads: {} },
		previous,
		intercept,
		write: true,
		options: { replace },
	})
	showOverlay(deps, shown(snapshot("_root_/"), true))
	showOverlay(deps, shown(snapshot("_root_/", open), true))
	showOverlay(deps, shown(snapshot("_root_/", open), false))
	expect(written).toEqual(["push /photos/1", "replace /photos/1", "push /photos/1"])
})
