import { createComponent, type Element } from "solid-js"
import { Dynamic } from "@solidjs/web"
import type { FlareStore } from "../../src/server/cache/contract.ts"
import { createServer } from "../../src/server/lifecycle/create.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter, type RouteModule, type RouterOptions } from "../../src/shared/router/create-router.ts"

// Routes made with the real builders, served by the real createServer(...).fetch, for dx/builder.md's integration
// tests (B96).

export const SITE = "https://example.com"

export function documentOf(children: Element): Element {
	return createComponent(Dynamic, {
		component: "html",
		get children() {
			return [
				createComponent(Dynamic, { component: "head", children: [] }),
				createComponent(Dynamic, { component: "body", children }),
			]
		},
	})
}

export const root = createRootLayout("_root_").render((props) => documentOf(props.children))

export type Answer = { status: number; headers: Headers; text: string }

export type Serve = (path: string, init?: RequestInit) => Promise<Answer>

export type ServeOptions = {
	layouts?: RouterOptions["layouts"]
	authenticate?: (input: { request: Request; callerData: unknown[] }) => unknown
	security?: Parameters<typeof createServer>[0]["security"]
	serverContext?: (input: { request: Request; env: unknown }) => unknown
	// The store a stored page is written to; `site` is SITE.
	store?: FlareStore
	// The fetch env each request is served with.
	env?: unknown
}

// The pages under the root, or under the root the case passes, with the server options the case passes.
export function serve(pages: Array<{ id: string; path: string; module: unknown }>, options: ServeOptions = {}): Serve {
	const router = createRouter({
		layouts: { _root_: root, ...options.layouts },
		routeTree: pages.map((page) => ({ ...page, module: page.module as RouteModule })),
	})
	const app = createServer({
		router,
		site: SITE,
		...(options.authenticate && { authenticate: options.authenticate as never }),
		...(options.security && { security: options.security }),
		...(options.serverContext && { serverContext: options.serverContext as never }),
		...(options.store && { store: options.store }),
	})
	return async (path, init) => {
		const response = await app.fetch(new Request(`${SITE}${path}`, { redirect: "manual", ...init }), options.env)
		return { status: response.status, headers: response.headers, text: await response.text() }
	}
}

// The data stream's frames, parsed.
export function frames(text: string): Array<Record<string, unknown>> {
	return text
		.trim()
		.split("\n")
		.filter((line) => line !== "")
		.map((line) => JSON.parse(line) as Record<string, unknown>)
}

// The document's body, the hydration markers and comments taken out.
export function bodyOf(html: string): string {
	return (/<body[^>]*>(.*)<\/body>/s.exec(html)?.[1] ?? "")
		.replace(/<!--.*?-->/gs, "")
		.replace(/<script[^>]*>.*?<\/script>/gs, "")
		.replace(/ _hk=\w+/g, "")
}
