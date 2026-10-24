import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import {
	attachHostState,
	hostState,
	run,
	type HostDeps,
	type Run,
	workerStates,
	writeWorkerState,
} from "./host-state.ts"

// A process table: this worker (100), its two dev servers (200, 300), a workerd under the second (301), and a process
// outside the tree (999).
const PS = [
	"  100     1 node",
	"  200   100 node",
	"  300   100 node",
	"  301   300 workerd",
	"  999     1 launchd",
	"",
].join("\n")

const LSOF = [
	"COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME",
	"node 100 runner cwd DIR 1,4 640 2 /",
	"node 100 runner 0u CHR 16,0 0t0 1 /dev/ttys000",
	"node 200 runner 0u CHR 16,0 0t0 1 /dev/ttys000",
	"node 200 runner 1u CHR 16,0 0t0 1 /dev/ttys000",
	"node 200 runner 2u CHR 16,0 0t0 1 /dev/ttys000",
	"workerd 301 runner 0u CHR 16,0 0t0 1 /dev/ttys000",
	"",
].join("\n")

const NETSTAT = [
	"tcp4 0 0 127.0.0.1.5173 127.0.0.1.50001 TIME_WAIT",
	"tcp4 0 0 127.0.0.1.5173 127.0.0.1.50002 ESTABLISHED",
	"tcp4 0 0 127.0.0.1.5173 127.0.0.1.50003 TIME_WAIT",
].join("\n")

const VM_STAT =
	"Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free:      1234.\nPages active:    5678.\n"

// Each command's stand-in, keyed by its name; a missing key rejects as a tool the host lacks would.
function runs(answers: Record<string, string | Error>): Run {
	return async (command) => {
		const answer = answers[command]
		if (answer === undefined) throw new Error(`spawn ${command} ENOENT`)
		if (answer instanceof Error) throw answer
		return answer
	}
}

function macDeps(run: Run): HostDeps {
	return {
		run,
		platform: "darwin",
		pid: 100,
		fdCount: () => Promise.reject(new Error("not Linux")),
		meminfo: () => Promise.reject(new Error("not Linux")),
	}
}

// On macOS a failed case's host state names the open-file limit, the process count, each process under this worker
// with its open descriptors from one lsof, the sockets in TIME_WAIT, and vm_stat (BUGS.md 504.9). A process lsof
// did not list reads `unknown`.
it("host state mac", async () => {
	const lines = await hostState(
		macDeps(runs({ sh: "256\nunlimited\n", ps: PS, lsof: LSOF, netstat: NETSTAT, vm_stat: VM_STAT })),
	)
	expect(lines).toEqual([
		"ulimit -n soft 256 hard unlimited",
		"processes 5",
		"fds 100 node 2",
		"fds 200 node 3",
		"fds 300 node unknown",
		"fds 301 workerd 1",
		"time_wait 2",
		"vm_stat Mach Virtual Memory Statistics: (page size of 16384 bytes)",
		"vm_stat Pages free:      1234.",
		"vm_stat Pages active:    5678.",
	])
})

// lsof exits 1 when a listed process is gone by the time it looks, and still prints the rest, which count.
it("host state lsof gone", async () => {
	const gone = Object.assign(new Error("Command failed: lsof"), { code: 1, stdout: LSOF })
	const lines = await hostState(macDeps(runs({ sh: "256\n256\n", ps: PS, lsof: gone, netstat: "", vm_stat: "" })))
	expect(lines.filter((line) => line.startsWith("fds "))).toEqual([
		"fds 100 node 2",
		"fds 200 node 3",
		"fds 300 node unknown",
		"fds 301 workerd 1",
	])
})

// Node's execFile hands a failed command's stdout to its callback, not to the error, so the default runner puts it on
// the rejection: lsof exits 1 when a listed process is gone and still prints the rest (BUGS.md 504.11).
it("host state run keeps stdout", async () => {
	const failed = await run("sh", ["-c", "printf 'COMMAND PID\\n'; exit 1"]).then(
		() => undefined,
		(error: unknown) => error,
	)
	expect([Reflect.get(Object(failed), "code"), Reflect.get(Object(failed), "stdout")]).toEqual([1, "COMMAND PID\n"])
})

// macOS lsof as a runner answers host-state's call (captured on the Mac, 2026-10-24): exit 1, as the `ps` that listed
// the tree is gone by then, nothing on stderr, and every other process's lines on stdout. Any exit with lsof's header
// counts; a gone process reads `unknown`; an answer without the header is unavailable (BUGS.md 504.11).
const MAC_LSOF = [
	"COMMAND   PID       USER   FD     TYPE             DEVICE  SIZE/OFF                NODE NAME",
	"node      100 lovrozagar  cwd      DIR               1,15      1312            78078237 /Users/lovrozagar/flare-probe",
	"node      100 lovrozagar  txt      REG               1,15 121482128              490031 /usr/local/bin/node",
	"node      200 lovrozagar    0u     CHR               16,0       0t0                   1 /dev/null",
	"",
].join("\n")

// The fds and lsof lines a Mac host gives for `lsof`'s answer, an answer or a failed run.
async function lsofFds(lsof: Error | string): Promise<string[]> {
	const lines = await hostState(macDeps(runs({ sh: "256\n256\n", ps: PS, lsof, netstat: "", vm_stat: "" })))
	return lines.filter((line) => line.startsWith("fds ") || line.startsWith("lsof"))
}

// lsof as execFile fails it: the exit code, and the stdout the runner keeps.
function lsofExit(code: number, stdout: string): Error {
	return Object.assign(new Error(`Command failed: lsof -n -P -p 100,200,300,301\n`), { code, stdout })
}

it("host state mac lsof shapes", async () => {
	const counted = ["fds 100 node 2", "fds 200 node 1", "fds 300 node unknown", "fds 301 workerd unknown"]
	expect(await lsofFds(lsofExit(1, MAC_LSOF))).toEqual(counted)
	expect(await lsofFds(lsofExit(2, MAC_LSOF))).toEqual(counted)
	expect(await lsofFds(lsofExit(1, ""))).toEqual([
		"lsof: unavailable (Command failed: lsof -n -P -p 100,200,300,301\n)",
	])
	expect(await lsofFds("no header here\n")).toEqual(["lsof: unavailable (no lsof header)"])
})

// On Linux the descriptors come from each process's fd directory, TIME_WAIT from ss, and the memory from MemAvailable; a process gone
// before its directory is read reads `unknown`.
it("host state linux", async () => {
	const fds = new Map([
		[100, 40],
		[200, 900],
		[301, 12],
	])
	const lines = await hostState({
		run: runs({
			sh: "1024\n524288\n",
			ps: PS,
			ss: "0 0 127.0.0.1:5173 127.0.0.1:50001\n0 0 127.0.0.1:5173 127.0.0.1:50003\n",
		}),
		platform: "linux",
		pid: 100,
		fdCount: async (pid) => {
			const count = fds.get(pid)
			if (count === undefined) throw new Error("ENOENT")
			return count
		},
		meminfo: async () => "MemTotal: 32000000 kB\nMemAvailable: 12000000 kB\n",
	})
	expect(lines).toEqual([
		"ulimit -n soft 1024 hard 524288",
		"processes 5",
		"fds 100 node 40",
		"fds 200 node 900",
		"fds 300 node unknown",
		"fds 301 workerd 12",
		"time_wait 2",
		"MemAvailable: 12000000 kB",
	])
})

// A host without a tool names it unavailable and prints every other section.
it("host state missing tools", async () => {
	const lines = await hostState(macDeps(runs({ sh: "256\n256\n", ps: PS })))
	expect(lines).toEqual([
		"ulimit -n soft 256 hard 256",
		"processes 5",
		"lsof: unavailable (spawn lsof ENOENT)",
		"netstat: unavailable (spawn netstat ENOENT)",
		"vm_stat: unavailable (spawn vm_stat ENOENT)",
	])
	const bare = await hostState(macDeps(runs({})))
	expect(bare).toEqual([
		"ulimit -n: unavailable (spawn sh ENOENT)",
		"ps: unavailable (spawn ps ENOENT)",
		"netstat: unavailable (spawn netstat ENOENT)",
		"vm_stat: unavailable (spawn vm_stat ENOENT)",
	])
})

// The real host answers every section: this machine has each tool, and this process is in its own tree.
it("host state here", async () => {
	const lines = await hostState()
	expect(lines.some((line) => line.includes("unavailable"))).toBe(false)
	expect(lines[0]).toMatch(/^ulimit -n soft \d+ hard (\d+|unlimited)$/)
	expect(lines).toContainEqual(expect.stringMatching(new RegExp(`^fds ${process.pid} \\S+ \\d+$`)))
})

// A failed case gets host-state.txt in its output directory, attached as `host state` (crash.ts).
it("host state attached", async () => {
	const dir = mkdtempSync(join(tmpdir(), "flare-host-state-"))
	try {
		const attached: Array<{ name: string; path: string }> = []
		const info = {
			outputPath: (name: string) => join(dir, name),
			attach: async (name: string, options: { path: string }) => void attached.push({ name, path: options.path }),
		}
		await attachHostState(info, macDeps(runs({ sh: "256\n256\n", ps: PS })))
		expect(attached).toEqual([{ name: "host state", path: join(dir, "host-state.txt") }])
		expect(readFileSync(join(dir, "host-state.txt"), "utf8").split("\n").slice(0, 2)).toEqual([
			"ulimit -n soft 256 hard 256",
			"processes 5",
		])
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})

// Each worker's state at its end is a file under the output directory, and the teardown prints them all as one log
// group in worker order, so a green run carries the baseline (BUGS.md 504.9). With none written it prints nothing.
it("host state baseline", async () => {
	const dir = mkdtempSync(join(tmpdir(), "flare-host-state-"))
	try {
		expect(await workerStates([dir])).toBe("")
		await writeWorkerState(dir, 10, macDeps(runs({ sh: "256\n256\n" })))
		await writeWorkerState(dir, 2, macDeps(runs({ sh: "512\n512\n" })))
		const text = await workerStates([dir, dir])
		expect(
			text.split("\n").filter((line) => line.startsWith("::") || line.startsWith("==") || line.startsWith("ulimit")),
		).toEqual([
			"::group::host state per worker at its end",
			"== worker-2.txt",
			"ulimit -n soft 512 hard 512",
			"== worker-10.txt",
			"ulimit -n soft 256 hard 256",
			"::endgroup::",
		])
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
})
