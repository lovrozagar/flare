// The api a harness tree or app is built from, and the modules each side loads it from (hydrate.harness.ts). Split
// from the harness at its 300-line limit.
import type * as solid from "solid-js"
import type * as web from "@solidjs/web"
import type * as progress from "../../src/client/navigation/progress.ts"
import type * as outlet from "../../src/shared/components/outlet.tsx"
import type * as outletNodes from "../../src/shared/components/outlet-nodes.ts"
import type * as router from "../../src/shared/router/create-router.ts"
import type * as routerContext from "../../src/shared/router/context.ts"
import type * as page from "../../src/shared/route-builder/page.ts"
import type * as rootLayout from "../../src/shared/route-builder/root-layout.ts"
import type * as layout from "../../src/shared/route-builder/layout.ts"
import type * as errors from "../../src/shared/errors/index.ts"
import type * as intercept from "../../src/shared/components/intercept-outlet.tsx"
import type * as deferred from "../../src/shared/components/use-deferred.ts"
import type * as memory from "../../src/server/cache/memory.ts"
import type * as link from "../../src/shared/components/link.tsx"

// What a tree builds from. Each side gets its own build of these modules: the server render the ones Vite's SSR
// runner loads (Solid's server build), the browser the ones Vite serves it (Solid's browser build).
export type Api = {
	solid: typeof solid
	web: typeof web
	progress: typeof progress
	outlet: typeof outlet
	outletNodes: typeof outletNodes
	router: typeof router
	routerContext: typeof routerContext
	page: typeof page
	rootLayout: typeof rootLayout
	layout: typeof layout
	errors: typeof errors
	intercept: typeof intercept
	deferred: typeof deferred
	// The in-memory store, for an app whose server stores pages. Its module loads on both sides and runs on the server.
	memory: typeof memory
	link: typeof link
	// An element with an id and lazy children, so a tree needs no JSX transform.
	h: (tag: string, id: string, children?: () => unknown) => web.JSX.Element
}

export type Side = "server" | "client"

// A tree is compiled into each side as source, the way an app's one source builds twice, so it reads only `api`
// and `side`: a value it closes over does not exist in the browser.
export type Tree = (api: Api, side: Side) => web.JSX.Element

// Where each side imports the api's modules from, under packages/core.
export const MODULES: Record<keyof Omit<Api, "solid" | "web" | "h">, string> = {
	progress: "/src/client/navigation/progress.ts",
	outlet: "/src/shared/components/outlet.tsx",
	outletNodes: "/src/shared/components/outlet-nodes.ts",
	router: "/src/shared/router/create-router.ts",
	routerContext: "/src/shared/router/context.ts",
	page: "/src/shared/route-builder/page.ts",
	rootLayout: "/src/shared/route-builder/root-layout.ts",
	layout: "/src/shared/route-builder/layout.ts",
	errors: "/src/shared/errors/index.ts",
	intercept: "/src/shared/components/intercept-outlet.tsx",
	deferred: "/src/shared/components/use-deferred.ts",
	memory: "/src/server/cache/memory.ts",
	link: "/src/shared/components/link.tsx",
}
