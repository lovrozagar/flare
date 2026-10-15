import { spawn } from "node:child_process"
import { expect, it } from "vitest"
import { exited, exitOf, readOrigin } from "./child.ts"

// A child that dies names its exit code or signal, so a kill (SIGKILL, SIGTERM) reads apart from a crash (SIGSEGV,
// SIGABRT) and from a plain exit: before, a dev server or a production compile that died left only its output
// (BUGS.md 128.5).
it("death named", async () => {
	const script = 'console.log("starting"); process.kill(process.pid, "SIGKILL")'
	const child = spawn(process.execPath, ["-e", script], { stdio: ["ignore", "pipe", "pipe"] })
	await expect(readOrigin(child)).rejects.toThrow(/^vite exited \(signal SIGKILL\)\nstarting/)
	await exited(child)
	expect(exitOf(1, null)).toBe("code 1")
	expect(exitOf(null, "SIGKILL")).toBe("signal SIGKILL")
})
