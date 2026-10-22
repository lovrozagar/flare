import { spawn, type ChildProcess } from "node:child_process"
import { rmSync } from "node:fs"
import type { Boot } from "./boot.ts"
import { capture } from "./server-log.ts"

// What the boot harness reads of a child process it started: its printed origin, its end, and how it ended.
// Split from boot.ts at its 300-line limit.

// How a child ended: its exit code, or the signal that ended it, so a kill (SIGKILL, SIGTERM) reads apart from a crash
// (SIGSEGV, SIGABRT) and from a plain exit (BUGS.md 128.5).
export function exitOf(code: number | null, signal: NodeJS.Signals | null): string {
	return signal === null ? `code ${String(code)}` : `signal ${signal}`
}

export function readOrigin(child: ChildProcess): Promise<string> {
	return new Promise((resolve, reject) => {
		let text = ""
		const onData = (chunk: Buffer) => {
			text += chunk.toString()
			const found = text.match(/http:\/\/127\.0\.0\.1:\d+/)
			if (!found) return
			resolve(found[0])
		}
		child.stdout?.on("data", onData)
		child.stderr?.on("data", onData)
		child.once("exit", (code, signal) => reject(new Error(`vite exited (${exitOf(code, signal)})\n${text}`)))
		child.once("error", reject)
	})
}

export function exited(child: ChildProcess): Promise<void> {
	// A child a signal ended has no exit code, only a signal code.
	if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
	return new Promise((resolve) => {
		child.once("exit", () => resolve())
	})
}

// Every process in the child's group: it leads one (spawned detached). A group with nothing left, or a child that never
// started, has nothing to signal.
export function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
	if (child.pid === undefined) return
	try {
		process.kill(-child.pid, signal)
	} catch {
		// The group has ended.
	}
}

// The cache dir, and any other dir the boot made, go when the child exits for any reason, when it cannot start, and
// when the test process exits first, so a failed or timed-out run leaves nothing behind. The child leads its own
// process group, so its own children (the Workers dev server's workerd) end with it: when it cannot start, on close,
// and when the test process exits (BUGS.md 128.7).
export function bootChild(input: {
	appDir: string
	cacheDir: string
	bin: string
	args?: readonly string[]
	dirs?: readonly string[]
	env?: Record<string, string>
}): Promise<Boot> {
	const { appDir, cacheDir } = input
	const child = spawn(input.bin, input.args ?? [], {
		cwd: appDir,
		// Playwright sets FORCE_COLOR. A colored URL would never match readOrigin, and NO_COLOR wins over it.
		env: { ...process.env, ...input.env, FLARE_VITE_CACHE: cacheDir, NO_COLOR: "1" },
		stdio: ["ignore", "pipe", "pipe"],
		detached: true,
	})
	const output = capture()
	output.attach(child.stdout)
	output.attach(child.stderr)
	const clean = (): void => remove([cacheDir, ...(input.dirs ?? [])])
	// The exiting test process cannot await the child: SIGKILL, and a second removal after a write in flight lands.
	const onExit = (): void => {
		signalGroup(child, "SIGKILL")
		clean()
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
		clean()
	}
	child.once("exit", clean)
	child.once("error", clean)
	process.once("exit", onExit)
	const started = readOrigin(child).catch((error: unknown) => {
		signalGroup(child, "SIGKILL")
		throw error
	})
	return started.then((url) => ({
		origin: url,
		appDir,
		cacheDir,
		logs: output.logs,
		// The group gets SIGTERM, the child is awaited, and whatever of the group ignored it is killed.
		async close() {
			process.off("exit", onExit)
			signalGroup(child, "SIGTERM")
			await exited(child)
			signalGroup(child, "SIGKILL")
			clean()
		},
	}))
}

export function remove(dirs: readonly string[]): void {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
}
