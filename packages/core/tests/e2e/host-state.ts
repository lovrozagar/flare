import { execFile } from "node:child_process"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

// The host as a failed case left it (BUGS.md 504.9): 453, 504, and 504.8 fail only inside a whole e2e-mac shard, as a
// server that takes a request and goes quiet, and never alone, so the shard may exhaust something a single case never
// reaches. A failed case's host-state.txt (crash.ts) holds the open-file limit, the open descriptors of this worker
// and each process under it (its dev servers among them), the sockets in TIME_WAIT, the memory, and the process
// count. A tool the host lacks reads `unavailable`, and the rest still print.

// A command's stdout, or a rejection when it cannot run or fails.
export type Run = (command: string, args: readonly string[]) => Promise<string>

export type HostDeps = {
	run: Run
	platform: NodeJS.Platform
	pid: number
	// The descriptor count of a Linux process, from its fd directory.
	fdCount: (pid: number) => Promise<number>
	// The Linux memory table.
	meminfo: () => Promise<string>
}

// A failed command rejects with its stdout on the error: execFile hands it to the callback alone, and lsof exits 1 with
// a full answer when a listed process is gone (BUGS.md 504.11).
export const run: Run = (command, args) =>
	new Promise((resolve, reject) => {
		execFile(command, [...args], { timeout: 10_000, maxBuffer: 64 * 1024 * 1024 }, (error, stdout) =>
			error === null ? resolve(stdout) : reject(Object.assign(error, { stdout })),
		)
	})

const PROC = "/proc"

const defaults: HostDeps = {
	run,
	platform: process.platform,
	pid: process.pid,
	fdCount: async (pid) => (await readdir(`${PROC}/${pid}/fd`)).length,
	meminfo: () => readFile(`${PROC}/meminfo`, "utf8"),
}

type Proc = { pid: number; ppid: number; command: string }

// Every line, each section on its own: one failing never hides the others.
export async function hostState(deps: HostDeps = defaults): Promise<string[]> {
	const sections = await Promise.all([limits(deps), processes(deps), timeWait(deps), memory(deps)])
	return sections.flat()
}

async function limits(deps: HostDeps): Promise<string[]> {
	const out = await attempt("ulimit -n", () => deps.run("sh", ["-c", "ulimit -Sn; ulimit -Hn"]))
	if (typeof out !== "string") return out
	const [soft = "", hard = ""] = out.trim().split("\n")
	return [`ulimit -n soft ${soft.trim()} hard ${hard.trim()}`]
}

// The process count, then this worker and each process under it with its open descriptors: on macOS from one lsof over
// them all, on Linux from each one's fd directory.
async function processes(deps: HostDeps): Promise<string[]> {
	const out = await attempt("ps", () => deps.run("ps", ["-A", "-o", "pid=,ppid=,comm="]))
	if (typeof out !== "string") return out
	const all = parsePs(out)
	const tree = subtree(all, deps.pid)
	const counts = await descriptors(deps, tree)
	if (!(counts instanceof Map)) return [`processes ${all.length}`, ...counts]
	return [
		`processes ${all.length}`,
		...tree.map((proc) => `fds ${proc.pid} ${proc.command} ${counts.get(proc.pid) ?? "unknown"}`),
	]
}

function parsePs(out: string): Proc[] {
	return out
		.split("\n")
		.map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
		.filter((match) => match !== null)
		.map(([, pid = "", ppid = "", command = ""]) => ({ pid: Number(pid), ppid: Number(ppid), command: command.trim() }))
}

// `root` and every process under it, parents first.
function subtree(all: readonly Proc[], root: number): Proc[] {
	const found = all.filter((proc) => proc.pid === root)
	for (let index = 0; index < found.length; index += 1) {
		const parent = found[index]?.pid
		found.push(...all.filter((proc) => proc.ppid === parent && proc.pid !== parent))
	}
	return found
}

async function descriptors(deps: HostDeps, tree: readonly Proc[]): Promise<Map<number, number> | string[]> {
	if (deps.platform === "linux") {
		const counts = await Promise.all(
			tree.map(async (proc) => [proc.pid, await deps.fdCount(proc.pid).catch(() => NaN)]),
		)
		return new Map(counts.filter((entry): entry is [number, number] => !Number.isNaN(entry[1])))
	}
	const pids = tree.map((proc) => proc.pid).join(",")
	// lsof exits 1 when one of the processes is gone by the time it looks, as the ps that listed them always is; it still
	// prints the others, so any answer with its header counts, whatever the exit.
	const out = await attempt("lsof", () => deps.run("lsof", ["-n", "-P", "-p", pids]).then(lsofAnswer, lsofOutput))
	if (typeof out !== "string") return out
	const counts = new Map<number, number>()
	for (const line of out.split("\n").slice(1)) {
		const pid = Number(line.trim().split(/\s+/)[1])
		if (Number.isInteger(pid) && pid > 0) counts.set(pid, (counts.get(pid) ?? 0) + 1)
	}
	return counts
}

function lsofOutput(error: unknown): string {
	const stdout = Reflect.get(Object(error), "stdout")
	if (typeof stdout === "string" && stdout.startsWith("COMMAND")) return stdout
	throw error
}

function lsofAnswer(stdout: string): string {
	if (!stdout.startsWith("COMMAND")) throw new Error("no lsof header")
	return stdout
}

// macOS's netstat; Linux's ss, which lists only the TIME_WAIT sockets with no header, as hosts without net-tools have it.
async function timeWait(deps: HostDeps): Promise<string[]> {
	if (deps.platform === "linux") {
		const out = await attempt("ss", () => deps.run("ss", ["-Htan", "state", "time-wait"]))
		if (typeof out !== "string") return out
		return [`time_wait ${out.split("\n").filter((line) => line.trim() !== "").length}`]
	}
	const out = await attempt("netstat", () => deps.run("netstat", ["-an"]))
	if (typeof out !== "string") return out
	return [`time_wait ${out.split("\n").filter((line) => line.includes("TIME_WAIT")).length}`]
}

// macOS's vm_stat, whole, or Linux's MemAvailable line.
async function memory(deps: HostDeps): Promise<string[]> {
	if (deps.platform === "linux") {
		const out = await attempt("meminfo", deps.meminfo)
		if (typeof out !== "string") return out
		return out.split("\n").filter((line) => line.startsWith("MemAvailable:"))
	}
	const out = await attempt("vm_stat", () => deps.run("vm_stat", []))
	if (typeof out !== "string") return out
	return out
		.trim()
		.split("\n")
		.map((line) => `vm_stat ${line.trim()}`)
}

async function attempt(name: string, read: () => Promise<string>): Promise<string | string[]> {
	try {
		return await read()
	} catch (error) {
		return [`${name}: unavailable (${error instanceof Error ? error.message : String(error)})`]
	}
}

// What attachHostState needs of Playwright's TestInfo.
type CaseInfo = {
	outputPath(name: string): string
	attach(name: string, options: { path: string; contentType: string }): Promise<void>
}

// A failed case's host-state.txt, in its output directory, which CI uploads.
export async function attachHostState(info: CaseInfo, deps: HostDeps = defaults): Promise<void> {
	const path = info.outputPath("host-state.txt")
	await writeFile(path, `${(await hostState(deps)).join("\n")}\n`)
	await info.attach("host state", { path, contentType: "text/plain" })
}

// Each worker's host state at its end, in `<outputDir>/host-state/worker-<index>.txt`: the baseline a failure's
// snapshot is read against, since a green run shows the levels a runner normally ends at (BUGS.md 504.9).
export async function writeWorkerState(outputDir: string, index: number, deps: HostDeps = defaults): Promise<void> {
	const dir = join(outputDir, BASELINE)
	await mkdir(dir, { recursive: true })
	await writeFile(join(dir, `worker-${index}.txt`), `${(await hostState(deps)).join("\n")}\n`)
}

const BASELINE = "host-state"

// Every worker's end state under `outputDirs`, as one log group per run: CI uploads test-results only when a job
// fails, so a green run's baseline reaches the job log this way (global-teardown.ts). Nothing when no worker wrote one.
export async function workerStates(outputDirs: readonly string[]): Promise<string> {
	const files = await Promise.all(
		[...new Set(outputDirs)].map(async (outputDir) => {
			const dir = join(outputDir, BASELINE)
			const names = await readdir(dir).catch(() => [])
			const ordered = names.toSorted((a, b) => indexOf(a) - indexOf(b))
			return Promise.all(ordered.map(async (name) => `== ${name}\n${await readFile(join(dir, name), "utf8")}`))
		}),
	)
	const text = files.flat().join("")
	return text === "" ? "" : `::group::host state per worker at its end\n${text}::endgroup::\n`
}

function indexOf(name: string): number {
	return Number(/(\d+)/.exec(name)?.[1] ?? 0)
}
