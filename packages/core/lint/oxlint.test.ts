import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { lintVerdict } from "./oxlint.ts"

const made: string[] = []

afterEach(() => {
	for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// A project for the funnel-only rule holding `code` at a loader's path.
function project(code: string): string {
	const dir = mkdtempSync(join(tmpdir(), "flare-oxlint-"))
	made.push(dir)
	writeFileSync(
		join(dir, ".oxlintrc.json"),
		JSON.stringify({
			plugins: [],
			categories: { correctness: "off", suspicious: "off" },
			jsPlugins: [{ name: "flare", specifier: join(import.meta.dirname, "funnel-only.js") }],
			rules: { "flare/funnel-only": "error" },
		}),
	)
	mkdirSync(join(dir, "src/server/loaders"), { recursive: true })
	writeFileSync(join(dir, "src/server/loaders/run.ts"), code)
	return dir
}

// A stand-in for oxlint: a shell script with this body.
function fakeBin(body: string): string {
	const dir = mkdtempSync(join(tmpdir(), "flare-oxlint-bin-"))
	made.push(dir)
	const bin = join(dir, "oxlint")
	writeFileSync(bin, `#!/bin/sh\n${body}\n`)
	chmodSync(bin, 0o755)
	return bin
}

const FIRES = "export function load() {\n\treturn new Response();\n}\n"
const CLEAN = "export function load() {\n\treturn 1;\n}\n"

// The rule fired is status 1 with the rule named; a clean file is 0.
it("fired and clean", () => {
	expect(lintVerdict({ dir: project(FIRES), rule: "funnel-only" })).toBe(1)
	expect(lintVerdict({ dir: project(CLEAN), rule: "funnel-only" })).toBe(0)
})

// oxlint that never ran, or that a signal ended, is no verdict: the error names why, with what it printed, instead of
// reading as the rule having fired (a `status ?? 1` did, BUGS.md 494).
it("no verdict", () => {
	const dir = project(FIRES)
	expect(() => lintVerdict({ dir, rule: "funnel-only", bin: "/nonexistent/oxlint" })).toThrow(/ENOENT/)
	expect(() => lintVerdict({ dir, rule: "funnel-only", bin: fakeBin("echo half a report; kill -9 $$") })).toThrow(
		/SIGKILL[\s\S]*half a report/,
	)
	expect(() => lintVerdict({ dir, rule: "funnel-only", bin: fakeBin("echo config broke; exit 1") })).toThrow(
		/without flare\(funnel-only\)[\s\S]*config broke/,
	)
	expect(() => lintVerdict({ dir, rule: "funnel-only", bin: fakeBin("exit 2") })).toThrow(/status 2/)
})
