import { createComponent, useContext } from "solid-js"
import { render } from "@solidjs/web"
import { vi } from "vitest"
import { InterceptOutlet, Link, type InterceptState } from "../../shared/components/index.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { PrefetchContext, useRouter, type LinkPrefetch } from "../../shared/router/context.ts"
import { createRouter, type Router } from "../../shared/router/create-router.ts"
import type { ClientEnv } from "./create-client.ts"

// The app, the router, the document state, and the browser surface the create-client tests boot.

export type Dom = typeof globalThis & { _$HY?: unknown; flare?: unknown }

export const seen: { router?: Router; prefetcher?: LinkPrefetch | null } = {}

const root = createRootLayout("_root_").render((props) => [
	"root[",
	props.children,
	createComponent(InterceptOutlet, { children: (state: InterceptState) => `|overlay:${state.render}` }),
	"]",
])
const photo = createPage("_root_/photo")
	.intercept({ from: ["_root_/"], render: "preview" })
	.render(() => "photo")
const home = createPage("_root_/").render((props) => {
	seen.router = useRouter()
	seen.prefetcher = useContext(PrefetchContext)
	return [`home:${String(props.loaderData)}`, createComponent(Link, { to: "_root_/about", children: "" })]
})
const about = createPage("_root_/about").render((props) => `about:${String(props.loaderData)}`)
const broken = createPage("_root_/broken").render(() => {
	throw new Error("render broke")
})

export function routerOf(chunks: Record<string, string> = {}): Router {
	return createRouter({
		chunks,
		layouts: { _root_: root },
		routeTree: [
			{ id: "_root_/", path: "/", module: () => Promise.resolve(home) },
			{ id: "_root_/about", path: "/about", module: about },
			{ id: "_root_/broken", path: "/broken", module: broken },
			{ id: "_root_/photo", path: "/photo", module: photo },
			{
				id: "_root_/lazy",
				path: "/lazy",
				module: () => Promise.reject(new TypeError("Failed to fetch dynamically imported module")),
			},
		],
	})
}

export const stops: (() => void)[] = []

export function install(build?: string, extra: Record<string, unknown> = {}): HTMLElement {
	const matches = [
		{ id: "_root_", params: {}, search: {}, data: null, preloader: {}, head: null, error: null },
		{ id: "_root_/", params: {}, search: {}, data: "start", preloader: {}, head: { title: "Home" }, error: null },
	]
	// jsdom does not run a script set through innerHTML. A browser would, so the test assigns self.flare too.
	const state = { ...(build === undefined ? { matches, nonce: "" } : { matches, nonce: "", build }), ...extra }
	document.body.innerHTML = `<script>self.flare=${JSON.stringify(state)}</script><div id="app"></div>`
	;(globalThis as Dom).flare = { ...state }
	return document.getElementById("app") as HTMLElement
}

export function env(host: HTMLElement, fetch: ClientEnv["fetch"] = vi.fn<ClientEnv["fetch"]>()): ClientEnv {
	return {
		mount: (code) => render(code, host),
		fetch,
		assign: vi.fn<(href: string) => void>(),
		dev: false,
		idle: { requestIdle: undefined, setTimeout: (run) => run() },
		network: {},
		observe: () => () => undefined,
	}
}
