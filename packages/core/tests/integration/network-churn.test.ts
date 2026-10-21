import { spawnSync } from "node:child_process"
import { createServer } from "node:http"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "@playwright/test"
import { afterAll, beforeAll, expect, it } from "vitest"
import { browserEndpoint, IMAGE_DIGEST, type BrowserEndpoints } from "../../../../scripts/browser-server.ts"
import { runPinned } from "../../../../scripts/docker-run.ts"

// Another process adding or removing a network interface, a Docker network, a container's veth, a VPN, fails every
// load Chromium has in flight with ERR_NETWORK_CHANGED when it shares that network namespace (BUGS.md 484). The
// browsers' topology keeps Chromium in a namespace of its own. The proof churns interfaces only in namespaces this test
// owns: never the host's, which would fail the browsers of every other run on the machine, and never the shared
// flare-chromium's, which every integration file and peer run uses at once. In a throwaway container, churn in the
// engines' own namespace fails Chromium's loads (the red control, the old topology's case with the host's churn) and
// leaves Firefox's and WebKit's, which stay on the host network; and the isolated Chromium loads everything while churn
// runs in any other namespace.

const IMAGE = `mcr.microsoft.com/playwright:v1.64.1-noble@sha256:${IMAGE_DIGEST}`
// busybox's `ip`, pinned, makes and drops addresses and dummy links every 50 ms.
const BUSYBOX = "busybox@sha256:fd7dc98638c8e305f4dc34e979f1c0fdfdcaeb0fbf8fcff77ae834b6da3d7e6e"
const CHURN =
	"i=0; while true; do i=$((i+1)); ip addr add 10.77.$((i%200)).1/32 dev lo; " +
	"ip link add d$((i%50)) type dummy 2>/dev/null && ip link set d$((i%50)) up; sleep 0.05; " +
	"ip addr del 10.77.$((i%200)).1/32 dev lo; ip link del d$((i%50)) 2>/dev/null; sleep 0.05; done"
const LABEL = "flare.churn=1"

const dockerRun = (args: readonly string[]) => {
	const done = spawnSync(process.env["FLARE_DOCKER"] ?? "docker", args, { encoding: "utf8" })
	return { status: done.status, stdout: done.stdout ?? "", stderr: done.stderr ?? "" }
}
const docker = (...args: string[]) => dockerRun(args)
let endpoints: BrowserEndpoints | undefined
let origin = ""
const server = createServer((req, res) => {
	if (new URL(req.url ?? "/", "http://x").pathname === "/") {
		const imports = Array.from({ length: 300 }, (_, i) => `import "/m/${i}.js"`).join("\n")
		res
			.writeHead(200, { "content-type": "text/html" })
			.end(`<script type="module">${imports}\nwindow.__done = true</script>`)
		return
	}
	setTimeout(() => res.writeHead(200, { "content-type": "text/javascript" }).end("export {}"), Math.random() * 60)
})

// The isolated topology exists only with Docker and no run-server the user set.
const isolated = (): boolean =>
	endpoints !== undefined && process.env["FLARE_BROWSER_WS"] === undefined && docker("version").status === 0

beforeAll(async () => {
	endpoints = await browserEndpoint()
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
	const address = server.address()
	origin = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`
})

afterAll(() => {
	server.close()
	const left = docker("ps", "-aq", "--filter", `label=${LABEL}`).stdout.split("\n").filter(Boolean)
	if (left.length > 0) docker("rm", "-f", ...left)
})

// A churn sidecar in `network` (another container's namespace, or a fresh one of its own), for the length of `run`.
async function churning<T>(network: string, run: () => Promise<T>): Promise<T> {
	const started = runPinned(dockerRun, BUSYBOX, [
		"run",
		"-d",
		"--rm",
		"--label",
		LABEL,
		"--network",
		network,
		"--cap-add",
		"NET_ADMIN",
		BUSYBOX,
		"sh",
		"-c",
		CHURN,
	])
	if (started.status !== 0) throw new Error(`the churn sidecar did not start: ${started.stderr}`)
	try {
		return await run()
	} finally {
		docker("rm", "-f", started.stdout.trim())
	}
}

// Three loads of the module page in the isolated Chromium: how many finished, and the network errors seen.
async function loads(): Promise<{ ok: number; errors: string[] }> {
	const at = endpoints?.chromium
	if (at === undefined) throw new Error("no isolated Chromium")
	const browser = await chromium.connect(at.endpoint, { headers: at.headers, timeout: 60_000 })
	const errors = new Set<string>()
	let ok = 0
	for (let round = 0; round < 3; round += 1) {
		const context = await browser.newContext()
		const tab = await context.newPage()
		tab.on("requestfailed", (request) => errors.add(request.failure()?.errorText ?? "?"))
		try {
			await tab.goto(`${origin}/?r=${round}`)
			await tab.waitForFunction(() => Reflect.get(window, "__done") === true, undefined, { timeout: 30_000 })
			ok += 1
		} catch {}
		await context.close()
	}
	await browser.close()
	return { ok, errors: [...errors] }
}

it("churn elsewhere does not reach chromium", async (context) => {
	if (!isolated()) return context.skip("the isolated topology needs Docker and no FLARE_BROWSER_WS")
	expect(await churning("none", loads)).toEqual({ ok: 3, errors: [] })
}, 300_000)

// The engines in a throwaway namespace with the churn in it: Chromium's loads fail with ERR_NETWORK_CHANGED, and
// Firefox and WebKit load anyway, so they need no isolation.
it("churn in its own namespace fails chromium only", async (context) => {
	if (!isolated()) return context.skip("the isolated topology needs Docker and no FLARE_BROWSER_WS")
	const core = dirname(fileURLToPath(import.meta.resolve("playwright-core/package.json")))
	const probe = fileURLToPath(new URL("network-churn.probe.mjs", import.meta.url))
	const name = `flare-churn-probe-${process.pid}`
	const box = runPinned(dockerRun, IMAGE, [
		"run",
		"-d",
		"--rm",
		"--init",
		"--label",
		LABEL,
		"--name",
		name,
		"--network",
		"none",
		"--shm-size=1g",
		"-e",
		"ENGINES=chromium,firefox,webkit",
		"-v",
		`${core}:/playwright-core:ro`,
		"-v",
		`${probe}:/probe.mjs:ro`,
		IMAGE,
		"sleep",
		"600",
	])
	if (box.status !== 0) throw new Error(`the probe container did not start: ${box.stderr}`)
	const lines = await churning(`container:${name}`, async () => docker("exec", name, "node", "/probe.mjs").stdout)
	const [chromiumLine, ...others] = lines
		.trim()
		.split("\n")
		.filter((line) => line.startsWith("PROBE"))
	const [, , ok, , changed] = (chromiumLine ?? "").split(" ")
	expect([Number(ok) < 3, changed]).toEqual([true, "true"])
	expect(others).toEqual(["PROBE firefox 3 0 false", "PROBE webkit 3 0 false"])
}, 600_000)
