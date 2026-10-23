import { afterAll, expect, it } from "vitest"
import { exitOf } from "../e2e/child.ts"
import { builtServer, failedBuild, fixtureApps, viteBuild } from "./vite-app.ts"

// A fixture build that dies names how: its exit code, or the signal that killed it, before whatever it printed. A
// build killed with no output was an empty error (BUGS.md 128.13).

const apps = fixtureApps()

afterAll(() => apps.removeAll())

// A build whose config runs `how` first.
function dies(how: string): Promise<unknown> {
	return builtServer(apps.make({ "vite.config.mjs": `${how}\nexport default {}\n` }))
}

it("dead build named", async () => {
	await expect(dies('process.kill(process.pid, "SIGKILL")')).rejects.toThrow(/^vite build exited \(signal SIGKILL\)$/)
	await expect(dies('console.error("broke"); process.exit(3)')).rejects.toThrow(/^vite build exited \(code 3\)\nbroke/)
})

// A build a signal ended is a kill, never the build's own failure: failedBuild throws naming the signal, where a case
// that wants the build's error would otherwise read empty output, and an assert on `[exitOf, output]` shows the signal
// (BUGS.md 500.6).
it("killed build named", async () => {
	const killed = await viteBuild(apps.make({ "vite.config.mjs": 'process.kill(process.pid, "SIGKILL")\n' }))
	expect(exitOf(killed.status, killed.signal)).toBe("signal SIGKILL")
	expect(() => failedBuild(killed)).toThrow(/^vite build signal SIGKILL$/)
	const broken = await viteBuild(apps.make({ "vite.config.mjs": 'throw new Error("config broke")\n' }))
	expect(failedBuild(broken)).toContain("config broke")
	expect(() => failedBuild({ status: 0, signal: null, output: "built" })).toThrow("the build passed")
})
