import { createComponent, flush } from "solid-js"
import { render } from "@solidjs/web"
import { afterEach, expect, it } from "vitest"
import { RouterContext } from "../../../shared/router/context.ts"
import { createRouter } from "../../../shared/router/create-router.ts"
import { ThemeScript } from "./script.tsx"

// ThemeScript on Solid's client build. The server rows are script.ssr.test.ts.
afterEach(() => {
	document.head.innerHTML = ""
})

// The server's script is in the document. A client render, here two of them, inserts no second one.
it("once", () => {
	document.head.innerHTML = '<script id="server-theme"></script>'
	const host = document.createElement("div")
	const router = createRouter({ layouts: {}, routeTree: [], theme: {} })
	const dispose = render(
		() =>
			createComponent(RouterContext, {
				value: router,
				get children() {
					return [createComponent(ThemeScript, {}), createComponent(ThemeScript, {})]
				},
			}),
		host,
	)
	flush()
	expect(document.querySelectorAll("script")).toHaveLength(1)
	expect(host.innerHTML).toBe("")
	dispose()
})
