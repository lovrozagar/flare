import { expect, it } from "vitest"
import { browserEndpoint, frozenWebkit, IMAGE_DIGEST, type BrowserDeps } from "./browser-server.ts"

const IMAGE = `mcr.microsoft.com/playwright:v1.64.1-noble@sha256:${IMAGE_DIGEST}`
const VERSION = ["version", "--format", "{{.Server.Version}}"]
const SHAPE =
	'{{.Config.Image}}|{{.HostConfig.IpcMode}}|{{json .HostConfig.Ulimits}}|{{.HostConfig.NetworkMode}}|{{index .Config.Labels "flare.browsers"}}'
const inspect = (name: string) => ["inspect", "--format", SHAPE, name]
const NO_CORES = '[{"Name":"core","Hard":0,"Soft":0}]'
const VOLUME = ["volume", "create", "--label", "flare.browsers=2", "flare-browsers-sock"]
const CORE = "/repo/node_modules/playwright-core"
const MOUNTS = [
	"-v",
	`${CORE}:/playwright-core:ro`,
	"-v",
	"/repo/scripts:/flare/scripts:ro",
	"-v",
	"flare-browsers-sock:/run/flare",
]
const head = (name: string, network: string) => [
	"run",
	"-d",
	"--rm",
	"--init",
	"--ipc=host",
	"--network",
	network,
	"--name",
	name,
	"--label",
	"flare.browsers=2-p1",
	"--ulimit",
	"core=0",
]
const RUN_SHARED = [
	...head("flare-browsers", "host"),
	...MOUNTS,
	IMAGE,
	"sh",
	"-c",
	"node /flare/scripts/loopback-proxy.ts proxy /run/flare/proxy.sock & " +
		"exec node /playwright-core/cli.js run-server --port 3333 --host 127.0.0.1",
]
const RUN_CHROMIUM = [
	...head("flare-chromium", "bridge"),
	"-p",
	"127.0.0.1:3334:3334",
	...MOUNTS,
	IMAGE,
	"sh",
	"-c",
	"node /flare/scripts/loopback-proxy.ts relay 3129 /run/flare/proxy.sock & " +
		"exec node /playwright-core/cli.js run-server --port 3334 --host 0.0.0.0",
]
const SHARED_SHAPE = `${IMAGE}|host|${NO_CORES}|host|2-p1`
const CHROMIUM_SHAPE = `${IMAGE}|host|${NO_CORES}|bridge|2-p1`
const CONTAINERS = { "flare-browsers": SHARED_SHAPE, "flare-chromium": CHROMIUM_SHAPE }
const ISOLATED = {
	endpoint: "ws://127.0.0.1:3333/",
	chromium: {
		endpoint: "ws://127.0.0.1:3334/",
		headers: { "x-playwright-launch-options": '{"proxy":{"server":"http://127.0.0.1:3129"}}' },
	},
}

type Answer = { status: number; stdout?: string; stderr?: string }

// A machine, recorded: what the env holds, whether Docker answers, the containers `docker inspect` describes by name,
// which ports listen, which engines are installed. `docker run` starts a server that listens on its port.
function machine(
	input: {
		env?: Record<string, string>
		docker?: boolean
		installed?: boolean
		containers?: Record<string, string>
	} = {},
) {
	const runs: (readonly string[])[] = []
	const answers: Record<string, Answer> = {}
	const listening = new Set<number>()
	for (const name of Object.keys(input.containers ?? {})) listening.add(name === "flare-chromium" ? 3334 : 3333)
	const deps: BrowserDeps = {
		env: input.env ?? {},
		docker: {
			run(args) {
				runs.push(args)
				const answer = answers[args[0] ?? ""]
				if (answer !== undefined) return { stdout: "", stderr: "", ...answer }
				if (args[0] === "version") {
					return input.docker === true
						? { status: 0, stdout: "29.7.2\n", stderr: "" }
						: { status: null, stdout: "", stderr: "Error: spawnSync docker ENOENT" }
				}
				if (args[0] === "inspect") {
					const found = input.containers?.[args.at(-1) ?? ""]
					return found === undefined
						? { status: 1, stdout: "", stderr: `Error: No such object: ${args.at(-1)}` }
						: { status: 0, stdout: `${found}\n`, stderr: "" }
				}
				if (args[0] === "run") listening.add(args.includes("flare-chromium") ? 3334 : 3333)
				return { status: 0, stdout: "", stderr: "" }
			},
		},
		reachable: async (port) => listening.has(port),
		installed: () => input.installed ?? false,
		core: () => ({ dir: CORE, version: "1.64.1" }),
		scripts: () => "/repo/scripts",
		proxyVersion: () => "p1",
		sleep: async () => undefined,
	}
	return { deps, runs, answers }
}

// A run-server the user set serves every engine as it is: no container, no proxy.
it("endpoint env", async () => {
	const { deps, runs } = machine({ env: { FLARE_BROWSER_WS: "ws://10.0.0.2:3000/" }, docker: true, installed: true })
	expect(await browserEndpoint(deps)).toEqual({
		endpoint: "ws://10.0.0.2:3000/",
		chromium: { endpoint: "ws://10.0.0.2:3000/", headers: {} },
	})
	expect(runs).toEqual([])
})

// Two containers from the pinned image, each with the lockfile's playwright-core and the repo's scripts mounted
// read-only, the host's IPC namespace (Chromium's shared memory is not Docker's 64 MB default), no core dumps (BUGS.md
// 103.6), and the flare label. Firefox and WebKit run on the host network, which is also where the loopback proxy
// listens on its socket in the shared volume. Chromium runs on Docker's default bridge, where no other process's
// interface change reaches it (BUGS.md 484), its run-server published on the host's loopback only, and reaches the
// test servers through the relay to that socket: its endpoint carries the proxy as a launch option. Containers that
// already are these are reused (B97); the volume is created on demand, since the machine's pruner removes it when idle.
it("container", async () => {
	const fresh = machine({ docker: true, installed: true })
	expect(await browserEndpoint(fresh.deps)).toEqual(ISOLATED)
	expect(fresh.runs).toEqual([
		VERSION,
		VOLUME,
		inspect("flare-browsers"),
		RUN_SHARED,
		inspect("flare-chromium"),
		RUN_CHROMIUM,
	])
	const running = machine({ docker: true, containers: CONTAINERS })
	expect(await browserEndpoint(running.deps)).toEqual(ISOLATED)
	expect(running.runs).toEqual([VERSION, VOLUME, inspect("flare-browsers"), inspect("flare-chromium")])
})

// A container that runs another image, without the host's IPC, with core dumps, on another network, or from before the
// isolation (no label, or an older one), or from another version of the loopback proxy (a different label) is replaced:
// only this script creates them, and a container runs the proxy its creator mounted.
it("container stale", async () => {
	const cases = [
		["flare-browsers", `${IMAGE}|private|${NO_CORES}|host|2-p1`],
		["flare-browsers", `mcr.microsoft.com/playwright:v1.60.0-noble|host|${NO_CORES}|host|2-p1`],
		["flare-browsers", `${IMAGE}|host|[]|host|2-p1`],
		["flare-browsers", `${IMAGE}|host|null|host|2-p1`],
		["flare-browsers", `${IMAGE}|host|${NO_CORES}|host|`],
		["flare-chromium", `${IMAGE}|host|${NO_CORES}|host|2-p1`],
		["flare-chromium", `${IMAGE}|host|${NO_CORES}|bridge|1`],
		["flare-browsers", `${IMAGE}|host|${NO_CORES}|host|2-p0`],
		["flare-chromium", `${IMAGE}|host|${NO_CORES}|bridge|2-p0`],
	] as const
	for (const [name, shape] of cases) {
		const stale = machine({ docker: true, containers: { ...CONTAINERS, [name]: shape } })
		expect(await browserEndpoint(stale.deps)).toEqual(ISOLATED)
		const removed = stale.runs.findIndex((args) => args[0] === "rm")
		expect(stale.runs[removed], shape).toEqual(["rm", "-f", name])
		expect(stale.runs[removed + 1], shape).toEqual(name === "flare-browsers" ? RUN_SHARED : RUN_CHROMIUM)
	}
})

// The pruner may have taken the volume or a container between runs: each is made again, and a second setup in a row
// starts and removes nothing.
it("recreated on demand", async () => {
	const gone = machine({ docker: true, containers: { "flare-browsers": SHARED_SHAPE } })
	expect(await browserEndpoint(gone.deps)).toEqual(ISOLATED)
	expect(gone.runs).toEqual([VERSION, VOLUME, inspect("flare-browsers"), inspect("flare-chromium"), RUN_CHROMIUM])
	const again = machine({ docker: true, containers: CONTAINERS })
	await browserEndpoint(again.deps)
	await browserEndpoint(again.deps)
	expect(again.runs.filter((args) => args[0] === "run" || args[0] === "rm")).toEqual([])
})

// The pruner can take the pinned image's layers while a container starts from it: the image is pulled again by its
// digest and the start retried (docker-run.ts), so the run goes on.
it("pruned image", async () => {
	const fresh = machine({ docker: true })
	const real = fresh.deps.docker.run
	let lost = false
	fresh.deps.docker.run = (args) => {
		if (args[0] === "run" && !lost) {
			lost = true
			fresh.runs.push(args)
			return { status: 125, stdout: "", stderr: "NotFound: parent snapshot sha256:6cd03 does not exist: not found." }
		}
		return real(args)
	}
	expect(await browserEndpoint(fresh.deps)).toEqual(ISOLATED)
	expect(fresh.runs.slice(3, 6)).toEqual([RUN_SHARED, ["pull", IMAGE], RUN_SHARED])
})

// A container that cannot start, a volume that cannot be made, or a run-server that never answers names the cause. A
// name already in use is another process of the same run starting it, so the run-server is awaited.
it("container fails", async () => {
	const refused = machine({ docker: true })
	refused.answers["run"] = { status: 1, stderr: "permission denied while trying to connect" }
	await expect(browserEndpoint(refused.deps)).rejects.toThrow(
		"the browser container flare-browsers did not start: permission denied while trying to connect",
	)
	const named = machine({ docker: true })
	named.answers["run"] = { status: 125, stderr: 'Conflict. The container name "/flare-browsers" is already in use' }
	await expect(browserEndpoint(named.deps)).rejects.toThrow(
		"the browser run-server did not answer on ws://127.0.0.1:3333/",
	)
	const volume = machine({ docker: true })
	volume.answers["volume"] = { status: 1, stderr: "Error response from daemon: no space left" }
	await expect(browserEndpoint(volume.deps)).rejects.toThrow(
		"the browser volume flare-browsers-sock was not created: Error response from daemon: no space left",
	)
})

// The macOS runners and the CI image have no Docker and launch the installed engines themselves.
it("local engines", async () => {
	const { deps, runs } = machine({ installed: true })
	expect(await browserEndpoint(deps)).toBeUndefined()
	expect(runs).toEqual([VERSION])
})

// Docker counts only when its daemon answers: a binary whose daemon refuses this shell (no group, daemon down) falls
// through to the installed engines instead of failing on the container.
it("docker unreachable", async () => {
	const { deps, runs, answers } = machine({ installed: true })
	answers["version"] = { status: 1, stdout: "", stderr: "permission denied while trying to connect to the docker API" }
	expect(await browserEndpoint(deps)).toBeUndefined()
	expect(runs).toEqual([VERSION])
})

it("none", async () => {
	await expect(browserEndpoint(machine().deps)).rejects.toThrow(
		"No browsers: set FLARE_BROWSER_WS to a Playwright run-server, install Docker for the pinned container, or " +
			"install Playwright's engines (bunx playwright install chromium firefox webkit)",
	)
})

// Only a `_special-` WebKit build, the one Playwright pins for macOS 14, is frozen: Playwright's own WebKit on Linux,
// the local launcher, and a path that merely mentions the word are not (BUGS.md 351).
it("frozen webkit", () => {
	expect(frozenWebkit("/Users/u/Library/Caches/ms-playwright/webkit_mac14_arm64_special-2251/pw_run.sh")).toBe(true)
	expect(frozenWebkit("C:\\ms-playwright\\webkit_mac14_special-2251\\Playwright.exe")).toBe(true)
	expect(frozenWebkit("/home/u/.cache/ms-playwright/webkit-2370/pw_run.sh")).toBe(false)
	expect(frozenWebkit("/home/u/.cache/flare-gates/wk-libs/run.sh")).toBe(false)
	expect(frozenWebkit("/tmp/notes_special-1/webkit/pw_run.sh")).toBe(false)
})
