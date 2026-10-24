import { spawn } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"
import { bootChild, exited, exitOf, explained, readOrigin } from "./child.ts"

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

// A boot child's status reads `running` while it serves and its exit once it ends, a signal by name: a server that died
// under a request reads apart from one that dropped it alive (BUGS.md 517).
it("child status", async () => {
	const appDir = fileURLToPath(new URL("./apps/minimal/", import.meta.url))
	const boot = (body: string) =>
		bootChild({
			appDir,
			cacheDir: mkdtempSync(join(tmpdir(), "flare-vite-")),
			bin: process.execPath,
			args: ["-e", `console.log("http://127.0.0.1:1"); ${body}`],
		})
	const ending = await boot("setTimeout(() => process.exit(3), 100)")
	const killed = await boot('setTimeout(() => process.kill(process.pid, "SIGKILL"), 100)')
	try {
		expect([ending.status?.(), killed.status?.()]).toEqual(["running", "running"])
		await expect.poll(() => [ending.status?.(), killed.status?.()]).toEqual(["code 3", "signal SIGKILL"])
	} finally {
		await ending.close()
		await killed.close()
	}
})

// A check that fails against a boot says which boot, the server's status at that moment, and the last of its output,
// and keeps the failure as its cause (BUGS.md 517).
it("boot failure explained", () => {
	const lines = Array.from({ length: 70 }, (_, index) => `line ${index}`)
	const failure = new TypeError("fetch failed")
	const told = explained("node prod", { logs: () => lines, status: () => "signal SIGKILL" }, failure)
	expect(told.cause).toBe(failure)
	expect(told.message.split("\n")).toEqual([
		"node prod boot: fetch failed (server signal SIGKILL); its last 60 lines:",
		...lines.slice(10),
	])
	const inProcess = explained("workers dev", { logs: () => [] }, "gone")
	expect(inProcess.message).toBe("workers dev boot: gone (server in this process); its last 0 lines:")
})
