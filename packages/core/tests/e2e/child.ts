import type { ChildProcess } from "node:child_process"

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
