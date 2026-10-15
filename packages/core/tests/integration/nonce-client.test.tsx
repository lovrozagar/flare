import { flush } from "solid-js"
import { render } from "@solidjs/web"
import { afterEach, expect, it, vi } from "vitest"
import { bootClient, type ClientEnv } from "../../src/client/boot/create-client.ts"
import { createReady, type ReadyContext } from "../../src/client/boot/ready.ts"
import { encodeFrame, type Frame } from "../../src/shared/protocol/index.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter } from "../../src/shared/router/create-router.ts"

// The client half of tests/integration/nonce.test.ts: a data navigation gets no new document policy, so a head
// tag the client applies carries the document's nonce, `self.flare.nonce` (dx/server.md).

type Dom = typeof globalThis & { flare?: unknown }

const root = createRootLayout("_root_").render((props) => ["root[", props.children, "]"])
const router = createRouter({
	layouts: { _root_: root },
	routeTree: [
		{ id: "_root_/", path: "/", module: createPage("_root_/").render(() => "home") },
		{ id: "_root_/about", path: "/about", module: createPage("_root_/about").render(() => "about") },
	],
})

const stops: (() => void)[] = []

afterEach(() => {
	for (const stop of stops.splice(0)) stop()
	delete (globalThis as Dom).flare
	history.replaceState(null, "", "/")
})

it("client head", async () => {
	const matches = [
		{ id: "_root_", params: {}, search: {}, data: null, preloader: {}, head: null, error: null },
		{ id: "_root_/", params: {}, search: {}, data: null, preloader: {}, head: null, error: null },
	]
	const state = { matches, nonce: "doc-nonce" }
	document.body.innerHTML = `<script>self.flare=${JSON.stringify(state)}</script><div id="app"></div>`
	;(globalThis as Dom).flare = state
	const host = document.getElementById("app")
	if (host === null) throw new Error("host")
	const frames: Frame[] = [
		{ t: "l", m: "_root_", d: null },
		{ t: "l", m: "_root_/about", d: null },
		{ t: "h", m: "_root_/about", d: { custom: { scripts: [{ children: "var y = 2" }] } } },
		{ t: "r" },
	]
	const env: ClientEnv = {
		mount: (code) => render(code, host),
		fetch: vi.fn<ClientEnv["fetch"]>(async () => new Response(frames.map(encodeFrame).join(""))),
		assign: vi.fn<(href: string) => void>(),
		dev: false,
		idle: { requestIdle: undefined, setTimeout: () => undefined },
		network: {},
		observe: () => () => undefined,
	}
	const ready = createReady()
	const navigates: ReadyContext["navigate"][] = []
	ready.api.onReady((ctx) => navigates.push(ctx.navigate))
	vi.spyOn(window, "scrollTo").mockImplementation(() => undefined)
	stops.push(await bootClient(router, ready, env))
	await navigates[0]({ to: "_root_/about" })
	flush()
	const script = [...document.head.querySelectorAll("script")].find((node) => node.textContent === "var y = 2")
	expect(script?.getAttribute("nonce")).toBe("doc-nonce")
})
