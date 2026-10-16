import { afterAll, expect, it } from "vitest"
import { builtServer, fixtureApps } from "./vite-app.ts"

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
