import { expect, it } from "vitest"
import { browserEndpoint, IMAGE_DIGEST, type BrowserDeps } from "./browser-server.ts"

const IMAGE = `mcr.microsoft.com/playwright:v1.64.1-noble@sha256:${IMAGE_DIGEST}`
const VERSION = ["version", "--format", "{{.Server.Version}}"]
const INSPECT = [
	"inspect",
	"--format",
	"{{.Config.Image}}|{{.HostConfig.IpcMode}}|{{json .HostConfig.Ulimits}}",
	"flare-browsers",
]
const NO_CORES = '[{"Name":"core","Hard":0,"Soft":0}]'
const RUN = [
	"run",
	"-d",
	"--rm",
	"--init",
	"--ipc=host",
	"--network",
	"host",
	"--name",
	"flare-browsers",
	"--ulimit",
	"core=0",
	"-v",
	"/repo/node_modules/playwright-core:/playwright-core:ro",
	IMAGE,
	"node",
	"/playwright-core/cli.js",
	"run-server",
	"--port",
	"3333",
	"--host",
	"127.0.0.1",
]

type Answer = { status: number; stdout?: string; stderr?: string }

// A machine, recorded: what the env holds, whether Docker answers, the container `docker inspect` describes, which
// ports listen, which engines are installed. `docker run` starts a server that listens.
function machine(
	input: { env?: Record<string, string>; docker?: boolean; installed?: boolean; up?: boolean; container?: string } = {},
) {
	const runs: (readonly string[])[] = []
	const answers: Record<string, Answer> = {}
	let listening = input.up ?? false
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
					const found = input.container
					return found === undefined
						? { status: 1, stdout: "", stderr: "Error: No such object: flare-browsers" }
						: { status: 0, stdout: `${found}\n`, stderr: "" }
				}
				if (args[0] === "run") listening = true
				return { status: 0, stdout: "", stderr: "" }
			},
		},
		reachable: async () => listening,
		installed: () => input.installed ?? false,
		core: () => ({ dir: "/repo/node_modules/playwright-core", version: "1.64.1" }),
		sleep: async () => undefined,
	}
	return { deps, runs, answers }
}

it("endpoint env", async () => {
	const { deps, runs } = machine({ env: { FLARE_BROWSER_WS: "ws://10.0.0.2:3000/" }, docker: true, installed: true })
	expect(await browserEndpoint(deps)).toBe("ws://10.0.0.2:3000/")
	expect(runs).toEqual([])
})

// The pinned image's run-server, from the lockfile's playwright-core mounted read-only, on the host network and the
// host's IPC namespace, so Chromium's shared memory is not Docker's 64 MB default, with no core dumps: a crashing
// engine process dumps nothing for the host to collect (BUGS.md 103.6). A container that is already the pinned one is
// reused (B97).
it("container", async () => {
	const fresh = machine({ docker: true, installed: true })
	expect(await browserEndpoint(fresh.deps)).toBe("ws://127.0.0.1:3333/")
	expect(fresh.runs).toEqual([VERSION, INSPECT, RUN])
	const running = machine({ docker: true, up: true, container: `${IMAGE}|host|${NO_CORES}` })
	expect(await browserEndpoint(running.deps)).toBe("ws://127.0.0.1:3333/")
	expect(running.runs).toEqual([VERSION, INSPECT])
})

// A `flare-browsers` that runs another image, without the host's IPC, or with core dumps, is replaced: only this
// script creates it.
it("container stale", async () => {
	for (const container of [
		`${IMAGE}|private|${NO_CORES}`,
		`mcr.microsoft.com/playwright:v1.60.0-noble|host|${NO_CORES}`,
		`${IMAGE}|host|[]`,
		`${IMAGE}|host|null`,
	]) {
		const stale = machine({ docker: true, up: true, container })
		expect(await browserEndpoint(stale.deps)).toBe("ws://127.0.0.1:3333/")
		expect(stale.runs).toEqual([VERSION, INSPECT, ["rm", "-f", "flare-browsers"], RUN])
	}
})

// A container that cannot start, or a run-server that never answers, names the cause. A name already in use is
// another process of the same run starting it, so the run-server is awaited.
it("container fails", async () => {
	const refused = machine({ docker: true })
	refused.answers["run"] = { status: 1, stderr: "permission denied while trying to connect" }
	await expect(browserEndpoint(refused.deps)).rejects.toThrow(
		"the browser container did not start: permission denied while trying to connect",
	)
	const named = machine({ docker: true })
	named.answers["run"] = { status: 125, stderr: 'Conflict. The container name "/flare-browsers" is already in use' }
	await expect(browserEndpoint(named.deps)).rejects.toThrow(
		"the browser run-server did not answer on ws://127.0.0.1:3333/",
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
