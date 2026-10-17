import { spawnSync } from "node:child_process"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Miniflare } from "miniflare"
import { afterAll, expect, it } from "vitest"

const handlerPath = fileURLToPath(new URL("../../src/adapters/workers/handler.ts", import.meta.url))
const finalizePath = fileURLToPath(new URL("../../src/server/lifecycle/finalize.ts", import.meta.url))

const root = join(fileURLToPath(new URL(".", import.meta.url)), ".run")
await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })
const assets = join(root, "assets")
await mkdir(join(assets, "a"), { recursive: true })
await writeFile(join(assets, "a", "static.txt"), "canonical-asset")
const entry = join(root, "entry.ts")
await writeFile(
	entry,
	`import { createWorkersHandler } from ${JSON.stringify(handlerPath)};
import { markUnmatched, rewrapWatch } from ${JSON.stringify(finalizePath)};

const server = {
	async fetch(request, env, ctx) {
		const path = new URL(request.url).pathname;
		if (path === "/background") {
			ctx.waitUntil((async () => {
				await scheduler.wait(50);
				await env.PING.fetch(new Request("https://ping/"));
			})());
			return new Response("scheduled");
		}
		// The router's answer to a document no route matched, the one the binding gets (plan 21 13.4).
		const routed = () => Promise.resolve(markUnmatched(new Response("missing", { status: 404 })));
		if (!new URL(request.url).searchParams.has("rewrap")) return routed();
		// A middleware's rewrap over the same body, which workerd keeps as the same stream (BUGS.md 272).
		const watch = rewrapWatch(routed);
		const answer = await watch.inner();
		return watch.carried(new Response(answer.body, answer));
	},
};

const handler = createWorkersHandler(server, { assets: "ASSETS" });

export default {
	fetch(request, env, ctx) {
		return handler.fetch(request, env, ctx);
	},
};
`,
)

const worker = join(root, "worker.js")
const built = spawnSync("bun", ["build", entry, "--outfile", worker, "--format=esm", "--target=browser"], {
	encoding: "utf8",
})
if (built.status !== 0) throw new Error(built.stderr || "workerd bundle failed")

let pinged = false
const mf = new Miniflare({
	modules: true,
	scriptPath: join(root, "worker.js"),
	compatibilityDate: "2026-07-10",
	assets: {
		directory: assets,
		binding: "ASSETS",
		routerConfig: { invoke_user_worker_ahead_of_assets: true, has_user_worker: true },
	},
	serviceBindings: {
		PING() {
			pinged = true
			return new Response("pong")
		},
	},
})

afterAll(async () => {
	await mf.dispose()
	await rm(root, { recursive: true, force: true })
})

it("real binding", async () => {
	const response = await mf.dispatchFetch("https://example.com/a//static.txt")
	expect(response.status).toBe(200)
	expect(await response.text()).toBe("canonical-asset")
}, 20000)

it("waitUntil", async () => {
	pinged = false
	const response = await mf.dispatchFetch("https://example.com/background")
	expect(response.status).toBe(200)
	await new Promise((resolve) => setTimeout(resolve, 200))
	expect(pinged).toBe(true)
}, 20000)

// A middleware's `new Response(response.body, response)` of the not-found answer still reaches the binding under
// workerd: the rewrap keeps the body stream the mark is read through (BUGS.md 272).
it("rewrapped unmatched", async () => {
	const response = await mf.dispatchFetch("https://example.com/a/static.txt?rewrap=1")
	expect([response.status, await response.text()]).toEqual([200, "canonical-asset"])
}, 20000)
