import { spawn } from "node:child_process"
import { request } from "node:http"
import { expect, it } from "vitest"

const ADAPTERS = new URL("../../src/adapters/", import.meta.url).pathname
const bun: unknown = Reflect.get(globalThis, "Bun")

// A server whose answer streams "a", then "b" 400 ms later, and hands two pieces of background work to `waitUntil`: a
// store write done at 300 ms and a purge at 600 ms. Each prints its line when it lands.
const SERVER = `
const say = (line) => process.stdout.write(line + "\\n");
const later = (ms, line) => new Promise((resolve) => setTimeout(() => { say(line); resolve(); }, ms));
const server = {
	fetch(request, env, ctx) {
		ctx.waitUntil(later(300, "written"));
		ctx.waitUntil(later(600, "purged"));
		const body = new ReadableStream({
			async start(controller) {
				controller.enqueue(new TextEncoder().encode("a"));
				await new Promise((resolve) => setTimeout(resolve, 400));
				controller.enqueue(new TextEncoder().encode("b"));
				controller.close();
			},
		});
		return new Response(body);
	},
};
`

// dx/adapters.md's SIGTERM wiring for each runtime: stop accepting, drain, exit.
const NODE = `${SERVER}
import { createServer } from "node:http";
import { createNodeListener } from "${ADAPTERS}node/listener.ts";
const listener = createNodeListener(server);
const http = createServer(listener).listen(0, "127.0.0.1", () => say("port " + http.address().port));
process.once("SIGTERM", async () => {
	http.close();
	const drained = await listener.drain({ timeout: "5s" });
	say("drained " + drained);
	process.exit(drained ? 0 : 1);
});
`

const BUN = `${SERVER}
import { createBunFetch } from "${ADAPTERS}bun/serve.ts";
const app = createBunFetch(server);
const served = Bun.serve({ hostname: "127.0.0.1", port: 0, ...app });
say("port " + served.port);
process.once("SIGTERM", async () => {
	void served.stop();
	const drained = await app.drain({ timeout: "5s" });
	say("drained " + drained);
	process.exit(drained ? 0 : 1);
});
`

type Run = { body: string; lines: string[]; code: number | null }

// Starts the child, asks it for a page, sends SIGTERM once the answer's headers arrive, and reads the rest of the body
// and the child's lines until it exits.
function terminated(command: string, args: readonly string[]): Promise<Run> {
	const child = spawn(command, args, { stdio: ["ignore", "pipe", "inherit"] })
	const lines: string[] = []
	const port = Promise.withResolvers<number>()
	let buffered = ""
	child.stdout.on("data", (chunk: Buffer) => {
		buffered += chunk.toString()
		const parts = buffered.split("\n")
		buffered = parts.pop() ?? ""
		for (const line of parts) {
			if (line.startsWith("port ")) port.resolve(Number(line.slice(5)))
			else lines.push(line)
		}
	})
	const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)))
	return port.promise.then(
		(at) =>
			new Promise<Run>((resolve, reject) => {
				request({ host: "127.0.0.1", port: at, path: "/" }, (response) => {
					child.kill("SIGTERM")
					let body = ""
					response.on("data", (chunk: Buffer) => void (body += chunk.toString()))
					response.on("close", () => void exited.then((code) => resolve({ body, lines, code })))
				})
					.on("error", reject)
					.end()
			}),
	)
}

// A SIGTERM while a page streams and its store write and purge are pending: the page is sent whole, both land, and
// the process exits 0 after them (plan 21 16.11).
it("node sigterm", async () => {
	const run = await terminated("node", ["--input-type=module", "-e", NODE])
	expect(run.body).toBe("ab")
	expect(run.lines).toEqual(["written", "purged", "drained true"])
	expect(run.code).toBe(0)
}, 20_000)

it.runIf(bun !== undefined)(
	"bun sigterm",
	async () => {
		const run = await terminated(process.execPath, ["-e", BUN])
		expect(run.body).toBe("ab")
		expect(run.lines).toEqual(["written", "purged", "drained true"])
		expect(run.code).toBe(0)
	},
	20_000,
)
