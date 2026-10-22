import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createServer as createViteServer, type ViteDevServer } from "vite"
import { afterAll, beforeAll, expect, it } from "vitest"
import { onFreePort } from "../../../../scripts/free-port.ts"
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
let root = ""
let origin = ""
let tab: WebSocket | undefined
const received: Payload[] = []

beforeAll(async () => {
	root = apps.make(PAGES)
	// A port taken between the pick and the strict listen is picked again (BUGS.md 493).
	vite = await onFreePort(async (port) => {
		const server = await createViteServer({
			root,
			configFile: false,
			logLevel: "silent",
			plugins: [flare()],
			server: { host: "127.0.0.1", port, strictPort: true },
		})
		try {
			return await server.listen()
		} catch (error) {
			await server.close()
			throw error
		}
	})
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
})

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
})

// The generated routes file and its last write.
function generated(): { text: string; written: number } {
	const path = join(root, "src/_gen/routes.gen.ts")
	return { text: readFileSync(path, "utf8"), written: statSync(path).mtimeMs }
}

// Polls `check` until it holds or `ms` pass.
async function until(check: () => boolean, ms: number): Promise<boolean> {
	for (const end = Date.now() + ms; Date.now() < end; await new Promise((resolve) => setTimeout(resolve, 50))) {
		if (check()) return true
	}
	return check()
}

// A source written under the app, and the event Vite's watcher gives flare for it. The fixture app lives under
// node_modules, which Vite's watcher always ignores, so the case hands it the event chokidar would emit.
function written(path: string, source: string, event: "add" | "change"): void {
	writeFileSync(join(root, path), source)
	vite?.watcher.emit("all", event, join(root, path))
}

// `vite dev` writes the generated files again after a short debounce when a source under src changes: a new route
// appears in routes.gen.ts. An edit that changes nothing it generates leaves the file unwritten, and a write to a
// generated file is no source (dx/plugin.md Codegen watch).
it("codegen watch", async () => {
	expect(generated().text).not.toContain("_root_/later")
	const page =
		'import { createPage } from "@lovrozagar/flare";\nexport const route = createPage("_root_/later").render(() => <p>later</p>);\n'
	mkdirSync(join(root, "src/routes/_root_/later"))
	written("src/routes/_root_/later/later.page.tsx", page, "add")
	expect(await until(() => generated().text.includes("_root_/later"), 5000)).toBe(true)
	const before = generated()
	const seen = new Set([before.written])
	// Every routes.gen.ts write from here, polled well inside the 50 ms debounce, until `check` holds.
	const watch = async (check: () => boolean, ms: number): Promise<boolean> => {
		for (const end = Date.now() + ms; Date.now() < end; await new Promise((resolve) => setTimeout(resolve, 5))) {
			seen.add(generated().written)
			if (check()) return true
		}
		return false
	}
	written("src/routes/_root_/later/later.page.tsx", page.replace("<p>later</p>", "<p>later, edited</p>"), "change")
	await watch(() => false, 250)
	vite?.watcher.emit("all", "change", join(root, "src/_gen/routes.gen.ts"))
	await watch(() => false, 250)
	// An edit that changes the output: its write shows the watcher handled the two events before it, each past its
	// own debounce, and neither of those wrote.
	mkdirSync(join(root, "src/routes/_root_/later2"))
	written("src/routes/_root_/later2/later2.page.tsx", page.replaceAll("later", "later2"), "add")
	expect(await watch(() => generated().text.includes("_root_/later2"), 5000)).toBe(true)
	expect(seen.size).toBe(2)
}, 20_000)
