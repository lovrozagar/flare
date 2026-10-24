import { afterEach, expect, it, vi } from "vitest"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { userWork } from "../navigation/user-work.ts"
import { createRouterStore } from "../router/store.ts"
import { browserPrefetcher } from "./browser-prefetcher.ts"

afterEach(() => {
	vi.restoreAllMocks()
	for (const link of document.head.querySelectorAll('link[rel="prefetch"]')) link.remove()
})

const root = createRootLayout("_root_").render((props) => props.children)
const home = createPage("_root_/").render(() => "home")
const chunks = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`_root_/m${index}`, `/m${index}.js`]))

// The window prefetcher reads the document's protocol from its navigation entry: over h2 the warm keeps six links in
// flight, and with no navigation entry two (BUGS.md 520, decision B127).
it("warm reads the protocol", () => {
	const router = createRouter({
		layouts: { _root_: root },
		routeTree: [{ id: "_root_/", path: "/", module: home }],
		chunks,
	})
	const store = createRouterStore(
		{ location: { pathname: "/", search: "", hash: "" }, matches: [], status: 200 } as never,
		() => undefined,
	)
	const env = {
		fetch: vi.fn<(url: string, init: RequestInit) => Promise<Response>>(),
		dev: false,
		network: {},
		observe: () => () => undefined,
		idle: { requestIdleCallback: undefined, setTimeout: () => 0, addEventListener: () => undefined } as never,
	}
	// jsdom has no rel=prefetch; a browser that has it takes the link path.
	vi.spyOn(DOMTokenList.prototype, "supports").mockReturnValue(true)
	const open = (entries: object[]): number => {
		vi.spyOn(performance, "getEntriesByType").mockReturnValue(entries as PerformanceEntryList)
		for (const link of document.head.querySelectorAll('link[rel="prefetch"]')) link.remove()
		const prefetcher = browserPrefetcher(router, store, { env, build: "b1", work: userWork(() => 0) })
		prefetcher.all()
		return document.head.querySelectorAll('link[rel="prefetch"]').length
	}
	expect([open([{ nextHopProtocol: "h2" }]), open([])]).toEqual([6, 2])
})
