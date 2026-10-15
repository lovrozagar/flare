import { createComponent, useContext } from "solid-js"
import { renderToString } from "@solidjs/web"
import { expect, it } from "vitest"
import {
	BlockerContext,
	IDLE_NAVIGATION,
	LocationContext,
	NavigateContext,
	NavigationContext,
	NO_BLOCKERS,
	PrefetchContext,
	RouterContext,
} from "../router/context.ts"
import { createRouter } from "../router/create-router.ts"
import { appTree, type AppValues } from "./app-tree.ts"
import { OverlayContext } from "./intercept-outlet.tsx"

const router = createRouter({ layouts: {}, routeTree: [] })

function Probe(props: { seen: unknown[] }): string {
	props.seen.push(
		useContext(RouterContext),
		useContext(LocationContext)(),
		useContext(NavigateContext),
		useContext(NavigationContext),
		useContext(BlockerContext),
		useContext(PrefetchContext),
		useContext(OverlayContext)(),
	)
	return "probed"
}

it("providers", () => {
	const location = { pathname: "/a", search: "", hash: "" }
	const values: AppValues = {
		router,
		location: () => location,
		navigate: null,
		navigation: IDLE_NAVIGATION,
		blockers: NO_BLOCKERS,
		prefetcher: null,
		overlay: () => undefined,
	}
	const seen: unknown[] = []
	const html = renderToString(() => appTree(values, () => createComponent(Probe, { seen })))
	expect(html).toContain("probed")
	expect(seen).toEqual([router, location, null, IDLE_NAVIGATION, NO_BLOCKERS, null, undefined])
})

it("server defaults", async () => {
	expect(IDLE_NAVIGATION.pending()).toBe(false)
	expect(IDLE_NAVIGATION.begin()()).toBeUndefined()
	expect(NO_BLOCKERS.register(() => false)()).toBeUndefined()
	const place = { hash: "", pathname: "/", search: "", params: {} }
	const args = { current: place, next: place, trigger: "navigation" as const }
	expect(NO_BLOCKERS.run(args, { write: () => undefined, pushed: 0, go: () => undefined })).toBe(true)
	expect(NO_BLOCKERS.beforeUnload(new Event("beforeunload"), place)).toBeUndefined()
})
