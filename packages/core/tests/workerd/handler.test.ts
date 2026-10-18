import { spawnSync } from "node:child_process"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { convertV4MiniflareOptions, Miniflare } from "miniflare"
import { afterAll, beforeAll, expect, it } from "vitest"

const handlerPath = fileURLToPath(new URL("../../src/adapters/workers/handler.ts", import.meta.url))
const finalizePath = fileURLToPath(new URL("../../src/server/lifecycle/finalize.ts", import.meta.url))

const root = join(fileURLToPath(new URL(".", import.meta.url)), ".run")

// The worker's source: a server whose routes the cases call, behind createWorkersHandler with an assets binding.
const ENTRY = `import { createWorkersHandler } from ${JSON.stringify(handlerPath)};
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
	`

// The worker under test: createWorkersHandler over a server, bundled for workerd with its assets beside it.
async function start(): Promise<Miniflare> {
	await rm(root, { recursive: true, force: true })
	await mkdir(root, { recursive: true })
	const assets = join(root, "assets")
	await mkdir(join(assets, "a"), { recursive: true })
	await writeFile(join(assets, "a", "static.txt"), "canonical-asset")
	const entry = join(root, "entry.ts")
	await writeFile(entry, ENTRY)

	const worker = join(root, "worker.js")
	const built = spawnSync("bun", ["build", entry, "--outfile", worker, "--format=esm", "--target=browser"], {
		encoding: "utf8",
	})
	if (built.status !== 0) throw new Error(built.stderr || "workerd bundle failed")
	return new Miniflare(
		convertV4MiniflareOptions({
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
		}),
	)
}

let pinged = false
// Miniflare 5's dispatchFetch routes a request to workerd through an undici dispatcher, which Bun's fetch ignores, so
// under Bun the request leaves for its own host: the cases that dispatch run under Node, where the worker under test runs
// in workerd all the same (BUGS.md 377).
const dispatches = Reflect.get(globalThis, "Bun") === undefined

// The runtime, started only when a case runs: a run with every case skipped leaves nothing behind.
let mf: Miniflare | undefined

function runtime(): Miniflare {
	if (mf === undefined) throw new Error("workerd did not start")
	return mf
}

beforeAll(async () => {
	mf = await start()
}, 60_000)

afterAll(async () => {
	await mf?.dispose()
	await rm(root, { recursive: true, force: true })
})

it.runIf(dispatches)(
	"real binding",
	async () => {
		const response = await runtime().dispatchFetch("https://example.com/a//static.txt")
		expect(response.status).toBe(200)
		expect(await response.text()).toBe("canonical-asset")
	},
	20000,
)

it.runIf(dispatches)(
	"waitUntil",
	async () => {
		pinged = false
		const response = await runtime().dispatchFetch("https://example.com/background")
		expect(response.status).toBe(200)
		await new Promise((resolve) => setTimeout(resolve, 200))
		expect(pinged).toBe(true)
	},
	20000,
)

// A middleware's `new Response(response.body, response)` of the not-found answer still reaches the binding under
// workerd: the rewrap keeps the body stream the mark is read through (BUGS.md 272).
it.runIf(dispatches)(
	"rewrapped unmatched",
	async () => {
		const response = await runtime().dispatchFetch("https://example.com/a/static.txt?rewrap=1")
		expect([response.status, await response.text()]).toEqual([200, "canonical-asset"])
	},
	20000,
)
