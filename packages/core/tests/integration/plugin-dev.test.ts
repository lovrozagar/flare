import { createServer as createViteServer, type ViteDevServer } from "vite"
import { afterAll, beforeAll, expect, it } from "vitest"
import { flare } from "../../src/vite/plugin/flare.ts"
import { builtServer, fixtureApps, rootLayout, type Server } from "./vite-app.ts"

// dx/plugin.md's development errors through a real app (B96): `vite dev` with flare() on a port, a WebSocket client
// on Vite's hot channel standing for the tab, announcing the tab token the document carries, as the client does
// (client/dev/tab.ts), and the same app built for production.

const apps = fixtureApps()

const PAGES: Record<string, string> = {
	"src/routes/_root_/root.root-layout.tsx": rootLayout("_root_"),
	"src/routes/_root_/home.page.tsx":
		'import { createPage } from "@lovrozagar/flare";\nexport const route = createPage("_root_/").render(() => <p id="page">home</p>);\n',
	"src/routes/_root_/boom/boom.page.tsx":
		'import { createPage } from "@lovrozagar/flare";\nexport const route = createPage("_root_/boom").loader(() => { throw new Error("boom-message"); }).render(() => <p>never</p>);\n',
	"src/routes/_root_/safe/safe.page.tsx":
		'import { createPage, markSafeError } from "@lovrozagar/flare";\nexport const route = createPage("_root_/safe").loader(() => { throw markSafeError(new Error("safe-message")); }).render(() => <p>never</p>);\n',
	"src/routes/_root_/gone/gone.page.tsx":
		'import { createPage, notFound } from "@lovrozagar/flare";\nexport const route = createPage("_root_/gone").loader(() => { throw notFound(); }).render(() => <p>never</p>);\n',
}

type Payload = { type: string; err?: { message?: string; stack?: string } }

let vite: ViteDevServer | undefined
let origin = ""
let tab: WebSocket | undefined
const received: Payload[] = []

beforeAll(async () => {
	const root = apps.make(PAGES)
	vite = await createViteServer({
		root,
		configFile: false,
		logLevel: "silent",
		plugins: [flare()],
		server: { host: "127.0.0.1", port: 0 },
	})
	await vite.listen()
	origin = vite.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? ""
	const socket = new WebSocket(`${origin.replace("http", "ws")}/?token=${vite.config.webSocketToken}`, "vite-hmr")
	await new Promise<void>((resolve, reject) => {
		socket.addEventListener("message", (event) => {
			const payload: Payload = JSON.parse(String(event.data))
			if (payload.type === "connected") resolve()
			else received.push(payload)
		})
		socket.addEventListener("error", () => reject(new Error("the hot channel did not open")))
	})
	tab = socket
}, 120_000)

afterAll(async () => {
	tab?.close()
	await vite?.close()
	apps.removeAll()
})

function get(path: string, token?: string): Promise<Response> {
	return fetch(`${origin}${path}`, { headers: token === undefined ? {} : { "flare-dev-tab": token } })
}

// The error payloads the tab received, once the hot channel has had time to deliver.
async function payloads(): Promise<Payload[]> {
	await new Promise((resolve) => setTimeout(resolve, 300))
	return received.filter((payload) => payload.type === "error")
}

// A runtime bug in dev: the document body carries the message and the stack, the overlay payload reaches the tab
// that made the request and no other, and `notFound()` sends nothing.
it("dev error overlay", async () => {
	const document = await (await get("/")).text()
	const token = /<meta name="flare-dev-tab" content="([^"]+)"/.exec(document)?.[1]
	expect(token).toMatch(/\S/)
	tab?.send(JSON.stringify({ type: "custom", event: "flare:tab", data: { token } }))
	const boom = await get("/boom", token)
	const body = await boom.text()
	expect(boom.status).toBe(500)
	expect(body).toContain("boom-message")
	expect(body).toContain("boom.page.tsx")
	const sent = await payloads()
	expect(sent).toHaveLength(1)
	expect(sent[0]?.err?.message).toBe("boom-message")
	expect(sent[0]?.err?.stack).toContain("boom.page.tsx")
	await (await get("/boom")).text()
	await (await get("/boom", "another-tab")).text()
	const gone = await get("/gone", token)
	expect(gone.status).toBe(404)
	await gone.text()
	expect(await payloads()).toHaveLength(1)
})

let built: Server | undefined

// Production sends nothing and writes no thrown message or stack: a generic message and a digest; `markSafeError`
// keeps its message and still no stack.
it("production error", async () => {
	built ??= await builtServer(apps.make(PAGES))
	const boom = await built.fetch(new Request("http://localhost/boom"))
	const body = await boom.text()
	expect(boom.status).toBe(500)
	expect(body).not.toContain("boom-message")
	expect(body).not.toContain("boom.page")
	expect(body).toMatch(/digest/i)
	const safe = await built.fetch(new Request("http://localhost/safe"))
	const safeBody = await safe.text()
	expect(safeBody).toContain("safe-message")
	expect(safeBody).not.toContain("safe.page")
}, 120_000)
