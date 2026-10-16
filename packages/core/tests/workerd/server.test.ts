import { spawnSync } from "node:child_process"
import { connect } from "node:net"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Miniflare } from "miniflare"
import { afterAll, expect, it } from "vitest"

// The real `createServer` behind `createWorkersHandler` in workerd (B96, dx/adapters.md Workers): a worker bundled
// with Solid's server build, run by Miniflare with an assets binding, the way Cloudflare runs a deploy.
const src = fileURLToPath(new URL("../../src/", import.meta.url))
const root = join(fileURLToPath(new URL(".", import.meta.url)), ".run-server")
await rm(root, { recursive: true, force: true })
await mkdir(join(root, "assets/a"), { recursive: true })
await writeFile(join(root, "assets/a/static.txt"), "canonical-asset")
const at = (path: string): string => JSON.stringify(join(src, path))
await writeFile(
	join(root, "entry.ts"),
	`import { createWorkersHandler } from ${at("adapters/workers/handler.ts")};
import { createServer } from ${at("server/lifecycle/create.ts")};
import { createCacheApiStore } from ${at("adapters/stores/cache-api/store.ts")};
import { createRouter } from ${at("shared/router/create-router.ts")};
import { createPage } from ${at("shared/route-builder/page.ts")};
import { createRootLayout } from ${at("shared/route-builder/root-layout.ts")};
import { createComponent } from "solid-js";
import { Dynamic } from "@solidjs/web";

// A full document, as a deployed root renders: a shared write stores only a document with <html> and </body> (B46).
const element = (component, children) => createComponent(Dynamic, { component, get children() { return children; } });
const root = createRootLayout("_root_").render((props) => element("html", [element("head", []), element("body", props.children)]));
const home = createPage("_root_/").render(() => "worker home");
const stored = createPage("_root_/stored").cache({ ssr: { ttl: "1m" } }).render(() => "stored page");
const nested = createPage("_root_/a/b").response(() => new Response("ab"));
const routeTree = [
	{ id: "_root_/", path: "/", module: home },
	{ id: "_root_/stored", path: "/stored", module: stored },
	{ id: "_root_/a/b", path: "/a/b", module: nested },
];
const server = createServer({
	router: createRouter({ layouts: { _root_: root }, routeTree }),
	site: "https://flare.test",
	store: createCacheApiStore({ cacheName: "server" }),
});
const handler = createWorkersHandler(server, { assets: "ASSETS" });
// The platform's ctx, wrapped: each promise the handler hands waitUntil is counted under its request's path, then
// handed on. workerd finishes a local write without waitUntil, so only the count shows the handler kept the work alive.
const handed = {};
export default {
	fetch(request, env, ctx) {
		const path = new URL(request.url).pathname;
		if (path === "/__handed") return Response.json(handed);
		const counted = { waitUntil: (promise) => { handed[path] = (handed[path] ?? 0) + 1; ctx.waitUntil(promise); } };
		return handler.fetch(request, env, counted);
	},
};
`,
)
// Solid's server build: the \`worker\` condition, which a Workers bundle resolves, under a target with no \`browser\`.
const built = spawnSync(
	"bun",
	[
		"build",
		join(root, "entry.ts"),
		"--outfile",
		join(root, "worker.js"),
		"--format=esm",
		"--target=node",
		"--conditions=worker",
	],
	// A deploy's environment, not the test runner's: Bun inlines \`import.meta.env\` from it, and a runner's DEV would
	// bundle a dev server.
	{ encoding: "utf8", env: { PATH: process.env["PATH"] ?? "", HOME: process.env["HOME"] ?? "" } },
)
if (built.status !== 0) throw new Error(built.stderr || "workerd bundle failed")

const mf = new Miniflare({
	modules: true,
	scriptPath: join(root, "worker.js"),
	compatibilityDate: "2026-07-10",
	compatibilityFlags: ["nodejs_compat"],
	assets: {
		directory: join(root, "assets"),
		binding: "ASSETS",
		routerConfig: { invoke_user_worker_ahead_of_assets: true, has_user_worker: true },
	},
})

afterAll(async () => {
	await mf.dispose()
	await rm(root, { recursive: true, force: true })
})

// `fetch` calls the server's fetch: the page renders in workerd as production. A stored render's write to the Cache
// API is work the handler hands `ctx.waitUntil`, and a live page hands none; the next request is a hit.
it("worker server", async () => {
	const page = await mf.dispatchFetch("https://example.com/")
	expect(page.status).toBe(200)
	expect(await page.text()).toContain("worker home")
	// Production: dev drops Cross-Origin-Opener-Policy. HSTS is not the proof here, since under the Bun runtime
	// Miniflare hands workerd the request as http.
	expect(page.headers.get("cross-origin-opener-policy")).toBe("same-origin")
	const first = await mf.dispatchFetch("https://example.com/stored")
	expect([first.status, first.headers.get("flare-cache")]).toEqual([200, "miss"])
	await first.text()
	await expect
		.poll(async () => (await mf.dispatchFetch("https://example.com/stored")).headers.get("flare-cache"))
		.toBe("hit")
	const handed: unknown = await (await mf.dispatchFetch("https://example.com/__handed")).json()
	expect(Object.keys(Object(handed))).toEqual(["/stored"])
	expect(Reflect.get(Object(handed), "/stored")).toBeGreaterThan(0)
}, 30_000)

// On Workers the URL is the edge's, so a hostile Host header never routes to another page (BUGS.md 150). Two outcomes
// occur: under Node, Miniflare replaces the header on the way in and the home page answers 200; under Bun it forwards
// the header as-is and workerd rejects it before Flare runs ("invalid hostname when stringifying URL"), a 500.
it("worker host", async () => {
	const page = await mf.dispatchFetch("https://example.com/", { headers: { host: "evil.example/stored?" } })
	const text = await page.text()
	expect(text).not.toContain("stored page")
	expect(page.status === 200 ? text.includes("worker home") : page.status >= 400).toBe(true)
})

// A raw request line to workerd's own socket: the status line and the body, so no client parses the URL first.
async function raw(target: string): Promise<string> {
	const { hostname, port } = await mf.ready
	return new Promise((resolve) => {
		const socket = connect(Number(port), hostname)
		let text = ""
		socket.on("data", (chunk: Buffer) => void (text += chunk.toString("latin1")))
		socket.on("close", () => {
			const [head = "", body = ""] = text.split("\r\n\r\n")
			const chunked = /^transfer-encoding: chunked$/im.test(head)
			resolve(`${head.split("\r\n")[0] ?? ""} ${chunked ? (body.split("\r\n")[1] ?? "") : body}`)
		})
		socket.end(`GET ${target} HTTP/1.1\r\nhost: example.com\r\nconnection: close\r\n\r\n`)
	})
}

// workerd reads a backslash as WHATWG's parser does, before Flare runs: `/a\b` is `/a/b`, served, and `/\a/b` is
// `//a/b`, a 400, the same answers as Node and Bun (BUGS.md 163).
it("worker backslash", async () => {
	expect(await raw("/a\\b")).toBe("HTTP/1.1 200 OK ab")
	expect((await raw("/\\a/b")).startsWith("HTTP/1.1 400")).toBe(true)
})

// After routing, an unmatched GET or HEAD goes to the binding, and a file comes back untouched; a path the binding
// lacks is the app's own 404 with its security headers; an unmatched POST is 405 and never reaches the binding.
it("worker assets", async () => {
	const file = await mf.dispatchFetch("https://example.com/a/static.txt")
	expect([file.status, await file.text()]).toEqual([200, "canonical-asset"])
	const head = await mf.dispatchFetch("https://example.com/a/static.txt", { method: "HEAD" })
	expect(head.status).toBe(200)
	const missing = await mf.dispatchFetch("https://example.com/nope")
	expect(missing.status).toBe(404)
	expect(missing.headers.get("x-content-type-options")).toBe("nosniff")
	await missing.text()
	const post = await mf.dispatchFetch("https://example.com/a/static.txt", { method: "POST", body: "x" })
	expect(post.status).toBe(405)
	expect(await post.text()).not.toBe("canonical-asset")
}, 30_000)
