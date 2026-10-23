import { spawnSync } from "node:child_process"
import { expect, it } from "vitest"
import { bundled } from "./bundle.ts"

// A workerd test's `bun build` that a signal ended throws naming the signal, so a bundle the host killed reads as a
// kill, not as "workerd bundle failed"; one that failed on its own throws its stderr. The child is real: sh SIGKILLs
// itself as the host's reaper kills a build (BUGS.md 500.8).
it("killed bundle named", () => {
	expect(() => bundled(spawnSync("sh", ["-c", "kill -9 $$"], { encoding: "utf8" }))).toThrow(
		/^workerd bundle signal SIGKILL$/,
	)
	expect(() => bundled(spawnSync("sh", ["-c", "echo broke >&2; exit 3"], { encoding: "utf8" }))).toThrow(
		/^workerd bundle code 3\nbroke/,
	)
	expect(() => bundled(spawnSync("sh", ["-c", "true"], { encoding: "utf8" }))).not.toThrow()
})
