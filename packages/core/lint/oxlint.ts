import { spawnSync } from "node:child_process"
import { join } from "node:path"

// The lint rules' tests run oxlint over a project they wrote and read its verdict: 0, nothing reported, or 1, the rule
// reported. Anything else is no verdict and throws with what oxlint printed: a binary that never ran, a signal (the
// host's SIGKILL), another status, or a 1 that does not name the rule, a config or plugin failing. `status ?? 1` read
// each of those as the rule having fired (BUGS.md 494).

const OXLINT = join(import.meta.dirname, "../../../node_modules/.bin/oxlint")

export function lintVerdict(at: { dir: string; rule: string; bin?: string }): 0 | 1 {
	const proc = spawnSync(at.bin ?? OXLINT, ["--config", join(at.dir, ".oxlintrc.json"), at.dir], { encoding: "utf8" })
	const output = `${proc.stdout ?? ""}${proc.stderr ?? ""}`
	const named = `flare(${at.rule})`
	if (proc.error !== undefined) throw new Error(`oxlint did not run: ${proc.error.message}\n${output}`)
	if (proc.signal !== null) throw new Error(`oxlint ended by ${proc.signal}\n${output}`)
	if (proc.status === 0) return 0
	if (proc.status !== 1) throw new Error(`oxlint ended with status ${String(proc.status)}\n${output}`)
	if (!output.includes(named)) throw new Error(`oxlint ended with status 1 without ${named}\n${output}`)
	return 1
}
