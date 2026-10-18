import { existsSync, mkdtempSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import * as nodeModule from "node:module"
import { connect } from "node:net"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"
import { boot, bootChild } from "./boot.ts"

// A test that boots a real vite dev server in a child process. Under the parallel suite that boot can pass the 5 s
// default, so these tests alone get more room. The global timeout stays.
const VITE_BOOT = 30_000

// A closed server refuses the request: Node says "fetch failed", Bun "Unable to connect" (with ECONNREFUSED from 1.4).
const CLOSED = /fetch failed|ECONNREFUSED|Unable to connect/

it(
	"serves",
	async () => {
		const session = await boot({ app: "minimal", runtime: "node", mode: "dev" })
		const response = await fetch(`${session.origin}/`)
		expect(response.status).toBe(200)
		await session.close()
		await expect(fetch(`${session.origin}/`)).rejects.toThrow(CLOSED)
	},
	VITE_BOOT,
)

it(
	"port",
	async () => {
		const [first, second] = await Promise.all([
			boot({ app: "minimal", runtime: "node", mode: "dev" }),
			boot({ app: "minimal", runtime: "node", mode: "dev" }),
		])
		expect(first.origin).not.toBe(second.origin)
		await first.close()
		await second.close()
	},
	VITE_BOOT,
)

// The docs app boots like the others (B94): its home answers in the path's locale.
it(
	"docs app",
	async () => {
		const session = await boot({ app: "docs", runtime: "node", mode: "dev" })
		try {
			const response = await fetch(`${session.origin}/hr`)
			expect(response.status).toBe(200)
			expect(await response.text()).toContain("Bok")
		} finally {
			await session.close()
		}
	},
	VITE_BOOT,
)

// The dashboard app boots like the others (B146): it lives under /app, and its sign-in page answers there.
it(
	"dashboard app",
	async () => {
		const session = await boot({ app: "dashboard", runtime: "node", mode: "dev" })
		try {
			const response = await fetch(`${session.origin}/app/login`)
			expect(response.status).toBe(200)
			expect(await response.text()).toContain("Sign in")
		} finally {
			await session.close()
		}
	},
	VITE_BOOT,
)

// B94 retired the i18n app into docs.
it("i18n retired", async () => {
	await expect(boot({ app: "i18n", runtime: "node", mode: "dev" })).rejects.toThrow(/i18n/)
})

it("unknown app", async () => {
	await expect(boot({ app: "product", runtime: "node", mode: "dev" })).rejects.toThrow(/product/)
})

it("deno", async () => {
	await expect(boot({ app: "minimal", runtime: "deno", mode: "dev" })).rejects.toThrow(/deno/)
})

it("browser is not a runtime", async () => {
	await expect(boot({ app: "minimal", runtime: "firefox", mode: "dev" })).rejects.toThrow(/firefox/)
})

it("preview", async () => {
	await expect(boot({ app: "minimal", runtime: "node", mode: "preview" })).rejects.toThrow(/preview/)
})

// A production boot: `vite build` on Node into a temp outDir, then the runtime's adapter over that output (B70). The
// document has no dev client, every response names the build, and the hashed client entry is served. Close removes
// the output.
const PROD_BOOT = 120_000

// Returns what the boot captured from its runtime.
// The user agent each prod server renders with. The Node server runs on the test's own runtime, which is Bun under
// the Bun run.
const RUNTIME = {
	node: new RegExp(`^${navigator.userAgent.split("/")[0]}/`),
	bun: /^Bun\//,
	workers: /^Cloudflare-Workers$/,
}

async function prod(runtime: "node" | "bun" | "workers"): Promise<readonly string[]> {
	const session = await boot({ app: "minimal", runtime, mode: "prod" })
	try {
		const response = await fetch(`${session.origin}/`)
		const html = await response.text()
		expect(response.status).toBe(200)
		expect(html).not.toContain("@vite/client")
		expect(response.headers.get("flare-build")).toMatch(/^[0-9a-f]{12}$/)
		expect(response.headers.get("x-runtime")).toMatch(RUNTIME[runtime])
		const entry = /import\("([^"]+)"\)/.exec(html)?.[1] ?? ""
		expect(entry).toMatch(/^\/assets\/client-[\w-]+\.js$/)
		const script = await fetch(`${session.origin}${entry}`)
		expect(script.status).toBe(200)
		expect(script.headers.get("content-type")).toMatch(/javascript/)
	} finally {
		await session.close()
	}
	expect(existsSync(session.cacheDir)).toBe(false)
	await expect(fetch(`${session.origin}/`)).rejects.toThrow(CLOSED)
	return session.logs()
}

// A prod server's child is captured like a dev one: the origin it prints is the first line.
it("node prod", async () => expect((await prod("node"))[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/), PROD_BOOT)

it("bun prod", async () => expect((await prod("bun"))[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/), PROD_BOOT)

// A Workers build composes the Cloudflare plugin, which needs node:module's registerHooks, so under the Bun run, where
// the child Vite is Bun too, every Workers case is skipped by that feature check (B109).
const HOOKS = typeof Reflect.get(nodeModule, "registerHooks") === "function"

// The one file a Workers run may leave in the app (B70's exception, B109): the Cloudflare plugin's deploy pointer, which
// it writes at the Vite root on every build and which only `wrangler deploy` reads. No worker state, no cached `cf`.
const DEPLOY_POINTER = ["deploy", "deploy/config.json"]

function wranglerEntries(appDir: string): string[] {
	const dir = join(appDir, ".wrangler")
	return existsSync(dir) ? readdirSync(dir, { recursive: true, encoding: "utf8" }).toSorted() : []
}

it.skipIf(!HOOKS)(
	"workers prod",
	async () => {
		await prod("workers")
		expect(wranglerEntries(fileURLToPath(new URL("./apps/minimal/", import.meta.url)))).toEqual(DEPLOY_POINTER)
	},
	PROD_BOOT,
)

// A raw request to a page with a live defer, whose socket closes after the headers or before them, as a closed tab's
// does (BUGS.md B28).
function drop(origin: string, after: "headers" | "connect"): Promise<void> {
	const { hostname, port } = new URL(origin)
	return new Promise((resolve) => {
		const socket = connect(Number(port), hostname, () => {
			socket.write(`GET /playground HTTP/1.1\r\nHost: ${hostname}:${port}\r\nAccept: text/html\r\n\r\n`)
			if (after === "connect") socket.destroy()
		})
		socket.on("data", (chunk: Buffer) => {
			if (chunk.toString().includes("\r\n\r\n")) socket.destroy()
		})
		socket.on("close", () => resolve())
	})
}

async function survives(runtime: "node" | "bun" | "workers"): Promise<unknown[]> {
	const session = await boot({ app: "docs", runtime, mode: "prod" })
	try {
		for (let index = 0; index < 5; index += 1) await drop(session.origin, "headers")
		await drop(session.origin, "connect")
		const health = await fetch(`${session.origin}/healthz`).catch((error: unknown) => error)
		return [runtime, health instanceof Response ? health.status : String(health)]
	} finally {
		await session.close()
	}
}

it(
	"disconnect survives",
	async () => {
		expect(await survives("node")).toEqual(["node", 200])
		expect(await survives("bun")).toEqual(["bun", 200])
	},
	2 * PROD_BOOT,
)

it.skipIf(!HOOKS)(
	"workers disconnect survives",
	async () => expect(await survives("workers")).toEqual(["workers", 200]),
	PROD_BOOT,
)

// `vite dev` under the Bun runtime (bits/16).
it(
	"bun dev",
	async () => {
		const session = await boot({ app: "minimal", runtime: "bun", mode: "dev" })
		try {
			const response = await fetch(`${session.origin}/`)
			expect(response.status).toBe(200)
			expect(response.headers.get("flare-build")).toBe("dev")
			expect(response.headers.get("x-runtime")).toMatch(/^Bun\//)
		} finally {
			await session.close()
		}
	},
	VITE_BOOT,
)

// `vite dev` in workerd through the app's own Cloudflare plugin (B109): its banner names the worker debug URL, which
// only a worker it runs prints. Skipped on the Bun run, as every Workers case.
it.skipIf(!HOOKS)(
	"workers dev",
	async () => {
		const session = await boot({ app: "minimal", runtime: "workers", mode: "dev" })
		try {
			const response = await fetch(`${session.origin}/`)
			expect(response.status).toBe(200)
			expect(response.headers.get("flare-build")).toBe("dev")
			// workerd rendered it, not the dev server's own Node listener (BUGS.md 76).
			expect(response.headers.get("x-runtime")).toBe("Cloudflare-Workers")
			expect(session.logs().some((line) => line.includes("/__debug"))).toBe(true)
		} finally {
			await session.close()
		}
		// Dev writes nothing under `.wrangler/` (BUGS.md 85): only a build before it may have left the deploy pointer.
		expect(DEPLOY_POINTER).toEqual(expect.arrayContaining(wranglerEntries(session.appDir)))
	},
	2 * VITE_BOOT,
)

// In Workers dev the render runs in workerd, and its console reaches the boot's captured log through the Cloudflare
// plugin's structured logs, after the response (BUGS.md 93): the changelog's fill runs its `broken` hole, which logs.
it.skipIf(!HOOKS)(
	"workers dev log",
	async () => {
		const session = await boot({ app: "docs", runtime: "workers", mode: "dev" })
		try {
			// The fill runs the stored page's holes, `broken` among them, to the end of its stream.
			expect(await (await fetch(`${session.origin}/changelog?_flare=fill`)).text()).toContain('"k":"broken"')
			await expect
				.poll(() => session.logs().some((line) => line.includes("The stats service is down")), { timeout: 10_000 })
				.toBe(true)
		} finally {
			await session.close()
		}
	},
	2 * VITE_BOOT,
)

// Two Workers dev boots started together both come up: each worker's inspector takes a port the OS assigns, so they
// cannot race for the same one (BUGS.md 85).
it.skipIf(!HOOKS)(
	"workers dev twice",
	async () => {
		const sessions = await Promise.all([
			boot({ app: "minimal", runtime: "workers", mode: "dev" }),
			boot({ app: "minimal", runtime: "workers", mode: "dev" }),
		])
		try {
			for (const session of sessions) expect((await fetch(`${session.origin}/`)).status).toBe(200)
		} finally {
			for (const session of sessions) await session.close()
		}
	},
	2 * VITE_BOOT,
)

it(
	"basepath",
	async () => {
		const session = await boot({ app: "basepath", runtime: "node", mode: "dev" })
		expect(session.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
		const app = await fetch(`${session.origin}/app`)
		expect(app.status).toBe(200)
		const root = await fetch(`${session.origin}/`)
		expect(root.status).toBe(404)
		await session.close()
		await expect(fetch(`${session.origin}/app`)).rejects.toThrow(CLOSED)
	},
	VITE_BOOT,
)

it(
	"no copy",
	async () => {
		const session = await boot({ app: "minimal", runtime: "node", mode: "dev" })
		expect(session.appDir.endsWith("packages/core/tests/e2e/apps/minimal")).toBe(true)
		expect(readdirSync(session.appDir).includes("package.json")).toBe(true)
		expect(readdirSync(new URL("./apps/", import.meta.url)).filter((name) => name.startsWith("minimal"))).toEqual([
			"minimal",
		])
		await session.close()
	},
	VITE_BOOT,
)

it(
	"temp",
	async () => {
		const session = await boot({ app: "minimal", runtime: "node", mode: "dev" })
		expect(session.cacheDir.startsWith(session.appDir)).toBe(false)
		expect(existsSync(session.cacheDir)).toBe(true)
		await session.close()
		expect(existsSync(session.cacheDir)).toBe(false)
	},
	VITE_BOOT,
)

// The boot keeps what its child prints, stdout and stderr, in memory in the order it arrived, one entry per line,
// as plain text, and writes none of it to disk (BUGS.md B8). Bun colors console.error under Playwright's FORCE_COLOR,
// so escape codes are dropped.
it("logs captured", async () => {
	const cacheDir = mkdtempSync(join(tmpdir(), "flare-vite-"))
	const appDir = fileURLToPath(new URL("./apps/minimal/", import.meta.url))
	const script = [
		"const later = (ms, fn) => new Promise((resolve) => setTimeout(() => resolve(fn()), ms));",
		'process.stdout.write("one\\ntw");',
		'await later(50, () => process.stdout.write("o\\n"));',
		'await later(50, () => process.stderr.write("\\u001b[0m\\u001b[31mthree\\u001b[39m\\n"));',
		'await later(50, () => console.log("http://127.0.0.1:1"));',
		"setInterval(() => undefined, 1000);",
	].join("\n")
	const session = await bootChild({
		appDir,
		cacheDir,
		bin: process.execPath,
		args: ["--input-type=module", "-e", script],
	})
	try {
		expect(session.logs()).toEqual(["one", "two", "three", "http://127.0.0.1:1"])
		expect(readdirSync(cacheDir)).toEqual([])
	} finally {
		await session.close()
	}
})

it("failed boot", async () => {
	const cacheDir = mkdtempSync(join(tmpdir(), "flare-vite-"))
	const appDir = fileURLToPath(new URL("./apps/minimal/", import.meta.url))
	// A child that exits at once without printing an origin. The runtime itself, since macOS has no /bin/false.
	const exits = { bin: process.execPath, args: ["-e", "process.exit(1)"] }
	await expect(bootChild({ appDir, cacheDir, ...exits })).rejects.toThrow(/vite exited/)
	expect(existsSync(cacheDir)).toBe(false)
	const missing = mkdtempSync(join(tmpdir(), "flare-vite-"))
	await expect(bootChild({ appDir, cacheDir: missing, bin: "/nonexistent/vite" })).rejects.toThrow(/ENOENT/)
	expect(existsSync(missing)).toBe(false)
})

// Whether a process is still alive: signal 0 checks without signalling.
function alive(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

// A runtime that starts a long-lived child of its own, as the Workers dev server starts workerd, and prints both pids.
const GRANDCHILD = [
	'import { spawn } from "node:child_process";',
	'const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
	'console.log("child " + process.pid + " grandchild " + grandchild.pid);',
].join("\n")

function grandparent(body: string): { bin: string; args: string[] } {
	return { bin: process.execPath, args: ["--input-type=module", "-e", `${GRANDCHILD}\n${body}`] }
}

// The child's and the grandchild's pids, from what the child printed.
function pids(text: string): number[] {
	return (/child (\d+) grandchild (\d+)/.exec(text) ?? []).slice(1).map(Number)
}

// A boot child's own children go with it. A server that dies while starting leaves nothing of its process group alive,
// and a normal close ends the whole group and still waits for the child itself, so no zombie stays. Before, a dead dev
// server's workerd outlived it by hours (BUGS.md 128.7).
it("group closed", async () => {
	const appDir = fileURLToPath(new URL("./apps/minimal/", import.meta.url))
	const dying = grandparent("setTimeout(() => process.exit(1), 200)")
	const failure = await bootChild({ appDir, cacheDir: mkdtempSync(join(tmpdir(), "flare-vite-")), ...dying }).then(
		() => "",
		(error: unknown) => String(error),
	)
	const [, lost] = pids(failure)
	expect(lost).toBeGreaterThan(0)
	await expect.poll(() => alive(lost ?? 0)).toBe(false)
	const serving = grandparent('console.log("http://127.0.0.1:1"); setInterval(() => {}, 1000)')
	const session = await bootChild({ appDir, cacheDir: mkdtempSync(join(tmpdir(), "flare-vite-")), ...serving })
	await expect.poll(() => pids(session.logs().join("\n")).length).toBe(2)
	const [child, grandchild] = pids(session.logs().join("\n"))
	await session.close()
	expect(alive(child ?? 0)).toBe(false)
	await expect.poll(() => alive(grandchild ?? 0)).toBe(false)
})

// A child that ignores SIGTERM and keeps writing its cache dir, as Vite's graceful shutdown keeps working after it: the
// test process's exit leaves no cache dir behind (CI 38597128404's `exit cleans`, BUGS.md 116).
it("exit cleans a writer", async () => {
	const cacheDir = mkdtempSync(join(tmpdir(), "flare-vite-"))
	const appDir = fileURLToPath(new URL("./apps/minimal/", import.meta.url))
	const script = [
		'import { mkdirSync, writeFileSync } from "node:fs";',
		"const dir = process.env.FLARE_VITE_CACHE;",
		'process.on("SIGTERM", () => {});',
		// A broken exit path must not leave a writer behind: the stub ends itself.
		"setTimeout(() => process.exit(0), 5000);",
		'console.log("http://127.0.0.1:1");',
		'setInterval(() => { mkdirSync(dir, { recursive: true }); writeFileSync(dir + "/dep", "x"); }, 1);',
	].join("\n")
	const session = await bootChild({
		appDir,
		cacheDir,
		bin: process.execPath,
		args: ["--input-type=module", "-e", script],
	})
	await new Promise((resolve) => setTimeout(resolve, 50))
	process.emit("exit", 0)
	expect(existsSync(cacheDir)).toBe(false)
	await new Promise((resolve) => setTimeout(resolve, 100))
	expect(existsSync(cacheDir)).toBe(false)
	await session.close()
})

// A boot whose child a signal already ended still closes: a killed child has a signal code and no exit code, and
// `close()` once waited for an exit event that had already fired (BUGS.md 116).
it("close after a kill", async () => {
	const cacheDir = mkdtempSync(join(tmpdir(), "flare-vite-"))
	const appDir = fileURLToPath(new URL("./apps/minimal/", import.meta.url))
	const script = 'console.log("http://127.0.0.1:1"); setTimeout(() => process.exit(0), 5000);'
	const session = await bootChild({
		appDir,
		cacheDir,
		bin: process.execPath,
		args: ["--input-type=module", "-e", script],
	})
	process.emit("exit", 0)
	// The kill's exit event fires before `close()` is called.
	await new Promise((resolve) => setTimeout(resolve, 100))
	const closed = session.close().then(() => "closed")
	const hung = new Promise((resolve) => setTimeout(() => resolve("hung"), 2000))
	expect(await Promise.race([closed, hung])).toBe("closed")
})

it(
	"exit cleans",
	async () => {
		const session = await boot({ app: "minimal", runtime: "node", mode: "dev" })
		process.emit("exit", 0)
		expect(existsSync(session.cacheDir)).toBe(false)
		await session.close()
	},
	VITE_BOOT,
)
