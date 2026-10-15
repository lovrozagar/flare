import { createComponent, type Element } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { afterEach, expect, it, vi } from "vitest"
import { createMemoryStore } from "../cache/memory.ts"
import { createServer } from "../lifecycle/create.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { isDocument } from "./shape.ts"

// B37 through the real `createServer`: a root whose shell has no `<html>` or no `</body>` is a 500 in production,
// logged once, and served as written in dev (D22).

afterEach(() => {
	vi.unstubAllEnvs()
	vi.restoreAllMocks()
})

const div = (children: Element): Element =>
	createComponent(Dynamic, {
		component: "div",
		get children() {
			return children
		},
	})

function bareServer(): ReturnType<typeof createServer> {
	const root = createRootLayout("_bare_").render((props) => div(props.children))
	const page = createPage("_bare_/")
		.cache({ ssr: { ttl: "1m" } })
		.render(() => "bare page")
	const router = createRouter({ layouts: { _bare_: root }, routeTree: [{ id: "_bare_/", path: "/", module: page }] })
	return createServer({ router, site: "https://flare.test", store: createMemoryStore() })
}

it("document", () => {
	expect(isDocument("<html><body></body></html>")).toBe(true)
	expect(isDocument("<div>x</div>")).toBe(false)
	expect(isDocument("<html><div>")).toBe(false)
	expect(isDocument("<div></body>")).toBe(false)
})

// Production, stubbed: the document is the empty 500 a throw before the shell answers, and one log line names the
// root layout and what its shell lacks, however many requests and renders follow. Nothing is stored. A
// production-only header proves the stub took.
it("prod document-less", async () => {
	vi.stubEnv("DEV", false)
	vi.stubEnv("PROD", true)
	const lines: string[] = []
	vi.spyOn(console, "error").mockImplementation((...line: unknown[]) => void lines.push(line.join(" ")))
	const server = bareServer()
	for (const _ of [1, 2]) {
		const response = await server.fetch(new Request("https://flare.test/"))
		expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin")
		expect([response.status, response.headers.get("flare-cache"), await response.text()]).toEqual([500, null, ""])
	}
	expect(lines).toEqual(['[flare:render] root layout "_bare_" rendered no <html> or </body> (B37)'])
})

// Dev serves the shell as written (D22), and one warning names the root layout and what production answers, however
// many requests follow, so the 500 is no surprise at the first production deploy.
it("dev document-less", async () => {
	const lines: string[] = []
	vi.spyOn(console, "warn").mockImplementation((...line: unknown[]) => void lines.push(line.join(" ")))
	const server = bareServer()
	for (const _ of [1, 2]) {
		const response = await server.fetch(new Request("https://flare.test/"))
		expect(response.status).toBe(200)
		expect(await response.text()).toMatch(/<div[^>]*>bare page<\/div>/)
	}
	expect(lines).toEqual([
		'[flare:render] root layout "_bare_" rendered no <html> or </body>; production answers 500 (B37)',
	])
})
