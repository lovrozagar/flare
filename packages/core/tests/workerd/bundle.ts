import type { SpawnSyncReturns } from "node:child_process"
import { exitOf } from "../e2e/child.ts"

// A workerd test's `bun build` of its worker: a build that did not finish throws how it ended, its code or the signal
// that killed it, then its stderr, so a bundle the host killed reads as a kill (BUGS.md 500.8).
export function bundled(result: SpawnSyncReturns<string>): void {
	if (result.status === 0) return
	const printed = result.stderr === "" ? "" : `\n${result.stderr}`
	throw new Error(`workerd bundle ${exitOf(result.status, result.signal)}${printed}`)
}
