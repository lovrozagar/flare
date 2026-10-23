import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { connect } from "node:net"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium, firefox, webkit } from "@playwright/test"
import { runPinned } from "./docker-run.ts"

// The pinned image every machine runs the browsers from (B70, B97). Its tag is the lockfile's Playwright version, and
// an upgrade changes the digest with it.
export const IMAGE_DIGEST = "7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf"
const PORT = 3333
const CONTAINER = "flare-browsers"
// Chromium's own container, its run-server's port, and the container-side port its proxy relay listens on.
const CHROMIUM_CONTAINER = "flare-chromium"
const CHROMIUM_PORT = 3334
const RELAY_PORT = 3129
// The volume both containers share for the loopback proxy's socket, and the label that marks what this script made.
// The label's value changes when the topology does, so containers from an older one are replaced; a container's adds
// the loopback proxy's version, since it runs the proxy its creator mounted, and a changed proxy must reach it.
const VOLUME = "flare-browsers-sock"
const LABEL = "flare.browsers=2"
// `docker inspect`'s JSON for `--ulimit core=0`. Playwright's WPE WebKit segfaults as it closes (BUGS.md 103.4), and a
// host whose core_pattern pipes to systemd-coredump spent 117 s of CPU on one grid's dumps, up to 6.1 GB each (103.6).
const NO_CORES = '[{"Name":"core","Hard":0,"Soft":0}]'

// Playwright pins a frozen WebKit for an OS it no longer builds for, macOS 14 among them: browsers.json's
// `revisionOverrides` names a `_special-` revision (webkit_mac14_arm64_special-2251 under Playwright 1.64.1). That
// build cannot speak the protocol of the Playwright that resolved it, so it launches and never opens a page (BUGS.md
// 351). The reason a skipped case carries, and whether an engine's executable is such a build: only the resolved path
// decides, never the OS, so Linux WebKit, the pinned container's and the local launcher's, is untouched.
export const FROZEN_WEBKIT = "BUGS 351: Playwright's frozen WebKit for macOS 14 cannot speak its protocol"

export function frozenWebkit(executable: string): boolean {
	return executable.split(/[\\/]/).some((part) => /^webkit.*_special-\d+$/.test(part))
}

// What the browser source reads of the machine. The native one is the real machine; a test passes its own.
export type BrowserDeps = {
	env: Readonly<Record<string, string | undefined>>
	docker: { run: (args: readonly string[]) => { status: number | null; stdout: string; stderr: string } }
	reachable: (port: number) => Promise<boolean>
	installed: () => boolean
	core: () => { dir: string; version: string }
	// This repo's scripts directory, mounted into the containers for the loopback proxy and its relay.
	scripts: () => string
	// A short hash of loopback-proxy.ts, in the containers' label.
	proxyVersion: () => string
	sleep: (ms: number) => Promise<void>
	// One line to the run's output.
	warn: (line: string) => void
}

// The run-servers to connect to: `endpoint` for Firefox and WebKit, and Chromium's own with the headers its connect
// sends (the launch options that route it through the loopback proxy).
export type BrowserEndpoints = {
	endpoint: string
	chromium: { endpoint: string; headers: Record<string, string> }
}

// What a FLARE_BROWSER_WS set where Docker answers costs: Chromium runs on that server, outside flare-chromium's own
// network namespace, so another process's interface change fails its loads (BUGS.md 484, 484.8).
export const ISOLATION_LOST =
	"FLARE_BROWSER_WS serves every engine, Chromium included, so Chromium runs outside flare-chromium's isolation " +
	"and a host interface change fails its loads with ERR_NETWORK_CHANGED (BUGS.md 484). " +
	"Unset it to use the pinned containers."

// The warn functions whose run already asked Docker about ISOLATION_LOST, whatever it answered: the native one once a
// process, so a run with FLARE_BROWSER_WS and no daemon does not spawn `docker version` on every call.
const asked = new WeakSet<(line: string) => void>()

// Where the engines come from (B97): `FLARE_BROWSER_WS`, which then serves every engine as it is (saying, where Docker
// answers, that Chromium leaves its isolation), else the pinned
// containers' run-servers when Docker answers, else Playwright's installed engines, as on the macOS runners and inside
// the CI image, which have no Docker. The endpoints, or undefined for the installed engines. With none of the three,
// one error names all three.
export async function browserEndpoint(deps: BrowserDeps = NATIVE): Promise<BrowserEndpoints | undefined> {
	const set = deps.env["FLARE_BROWSER_WS"]
	if (set !== undefined) {
		if (!asked.has(deps.warn)) {
			asked.add(deps.warn)
			if (daemon(deps)) deps.warn(ISOLATION_LOST)
		}
		return { endpoint: set, chromium: { endpoint: set, headers: {} } }
	}
	if (daemon(deps)) return browserServers(deps)
	if (deps.installed()) return undefined
	throw new Error(
		"No browsers: set FLARE_BROWSER_WS to a Playwright run-server, install Docker for the pinned container, or " +
			"install Playwright's engines (bunx playwright install chromium firefox webkit)",
	)
}

// Docker counts only when its daemon answers this shell: a binary on PATH whose daemon is down, or refuses a user
// outside the `docker` group, falls through to the installed engines.
function daemon(deps: BrowserDeps): boolean {
	return deps.docker.run(["version", "--format", "{{.Server.Version}}"]).status === 0
}

// The pinned image's run-servers, from the lockfile's playwright-core mounted read-only, in the host's IPC namespace
// (Chromium's shared memory, which Docker caps at 64 MB by default, plan 14 leaf 4.6), with core dumps off and the
// flare label. Firefox and WebKit run on the host network, as before, with the loopback proxy beside them on a Unix
// socket in the shared volume. Chromium runs on Docker's default bridge: in its own network namespace, no other
// process's interface change fails its loads with ERR_NETWORK_CHANGED (BUGS.md 484), and Firefox and WebKit do not
// react to one. Its run-server is published on the host's loopback only, and it reaches the test servers on the
// host's loopback through the relay to the proxy, which its connect names as a launch option. Containers that already
// are these are reused; any other is replaced, since only this script creates them. The machine's pruner removes the
// volume and the containers once idle, so each run makes what is missing.
async function browserServers(deps: BrowserDeps): Promise<BrowserEndpoints> {
	const core = deps.core()
	const image = `mcr.microsoft.com/playwright:v${core.version}-noble@sha256:${IMAGE_DIGEST}`
	const volume = deps.docker.run(["volume", "create", "--label", LABEL, VOLUME])
	if (volume.status !== 0) throw new Error(`the browser volume ${VOLUME} was not created: ${volume.stderr}`)
	const mounts = ["-v", `${core.dir}:/playwright-core:ro`, "-v", `${deps.scripts()}:/flare/scripts:ro`]
	const shared = [...mounts, "-v", `${VOLUME}:/run/flare`, image]
	const proxy = "node /flare/scripts/loopback-proxy.ts proxy /run/flare/proxy.sock"
	const relay = `node /flare/scripts/loopback-proxy.ts relay ${RELAY_PORT} /run/flare/proxy.sock`
	const serve = (port: number, host: string) =>
		`exec node /playwright-core/cli.js run-server --port ${port} --host ${host}`
	const label = `${LABEL}-${deps.proxyVersion()}`
	ensure(deps, image, label, {
		name: CONTAINER,
		network: "host",
		args: [...shared, "sh", "-c", `${proxy} & ${serve(PORT, "127.0.0.1")}`],
	})
	ensure(deps, image, label, {
		name: CHROMIUM_CONTAINER,
		network: "bridge",
		args: [
			"-p",
			`127.0.0.1:${CHROMIUM_PORT}:${CHROMIUM_PORT}`,
			...shared,
			"sh",
			"-c",
			`${relay} & ${serve(CHROMIUM_PORT, "0.0.0.0")}`,
		],
	})
	const options = JSON.stringify({ proxy: { server: `http://127.0.0.1:${RELAY_PORT}` } })
	return {
		endpoint: await answering(deps, PORT),
		chromium: { endpoint: await answering(deps, CHROMIUM_PORT), headers: { "x-playwright-launch-options": options } },
	}
}

// Starts `container` unless one of that name already has this shape: the image, the host's IPC, no core dumps, its
// network, and the label.
function ensure(
	deps: BrowserDeps,
	image: string,
	label: string,
	container: { name: string; network: string; args: string[] },
): void {
	const shape =
		'{{.Config.Image}}|{{.HostConfig.IpcMode}}|{{json .HostConfig.Ulimits}}|{{.HostConfig.NetworkMode}}|{{index .Config.Labels "flare.browsers"}}'
	const found = deps.docker.run(["inspect", "--format", shape, container.name])
	const current = found.status === 0 ? found.stdout.trim() : undefined
	const wanted = `${image}|host|${NO_CORES}|${container.network}|${label.split("=")[1]}`
	if (current === wanted) return
	if (current !== undefined) deps.docker.run(["rm", "-f", container.name])
	const head = ["run", "-d", "--rm", "--init", "--ipc=host", "--network", container.network, "--name", container.name]
	const started = runPinned(deps.docker.run, image, [
		...head,
		"--label",
		label,
		"--ulimit",
		"core=0",
		...container.args,
	])
	// A container of that name may be starting already, for another process of the same run.
	if (started.status !== 0 && !started.stderr.includes("already in use")) {
		throw new Error(`the browser container ${container.name} did not start: ${started.stderr}`)
	}
}

async function answering(deps: BrowserDeps, port: number): Promise<string> {
	const endpoint = `ws://127.0.0.1:${port}/`
	for (let waited = 0; waited < 120; waited += 1) {
		if (await deps.reachable(port)) return endpoint
		await deps.sleep(250)
	}
	throw new Error(`the browser run-server did not answer on ${endpoint}`)
}

const DOCKER = process.env["FLARE_DOCKER"] ?? "docker"

const NATIVE: BrowserDeps = {
	env: process.env,
	docker: {
		run(args) {
			const done = spawnSync(DOCKER, args, { encoding: "utf8" })
			return { status: done.status, stdout: done.stdout ?? "", stderr: done.stderr || String(done.error ?? "") }
		},
	},
	reachable: (port) =>
		new Promise((resolve) => {
			const socket = connect(port, "127.0.0.1")
			socket.once("connect", () => {
				socket.destroy()
				resolve(true)
			})
			socket.once("error", () => resolve(false))
		}),
	installed: () => [chromium, firefox, webkit].every((type) => existsSync(type.executablePath())),
	core() {
		const test = createRequire(import.meta.url).resolve("@playwright/test/package.json")
		const manifest = createRequire(test).resolve("playwright-core/package.json")
		const version = Reflect.get(Object(JSON.parse(readFileSync(manifest, "utf8"))), "version")
		if (typeof version !== "string") throw new Error("playwright-core has no version")
		return { dir: dirname(manifest), version }
	},
	scripts: () => dirname(fileURLToPath(import.meta.url)),
	warn: (line) => void process.stderr.write(`${line}\n`),
	proxyVersion: () =>
		createHash("sha256")
			.update(readFileSync(fileURLToPath(new URL("loopback-proxy.ts", import.meta.url))))
			.digest("hex")
			.slice(0, 12),
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}
