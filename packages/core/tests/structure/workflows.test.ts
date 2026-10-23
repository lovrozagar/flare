import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { load } from "js-yaml"
import { expect, it } from "vitest"
import { distTag } from "../../../../scripts/release.ts"

// The repo's GitHub workflows, which the release job runs with publish credentials: every action is pinned to a commit
// SHA, so a moved tag cannot swap the code that runs, and nothing installs `@latest` (plan 21 14.4, BUGS.md 219).
const dir = fileURLToPath(new URL("../../../../.github/workflows/", import.meta.url))
const workflows = readdirSync(dir)
	.filter((name) => name.endsWith(".yml"))
	.toSorted()
	.map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }))

it("pinned actions", () => {
	expect(workflows.map((file) => file.name)).toEqual([
		"ci.yml",
		"consumers-newest.yml",
		"nightly.yml",
		"release.yml",
		"repro.yml",
	])
	const unpinned = workflows.flatMap(({ name, text }) =>
		[...text.matchAll(/uses:\s*(\S+)/g)]
			.map((found) => found[1] ?? "")
			// An action, or a sub-action under its repo (`actions/cache/restore`), always at a commit.
			.filter((action) => !/^[\w.-]+\/[\w.-]+(?:\/[\w.-]+)*@[\da-f]{40}$/.test(action))
			.map((action) => `${name}: ${action}`),
	)
	expect(unpinned).toEqual([])
})

// A prerelease tag, `v1.0.0-rc.1` say, publishes to GitHub Packages under the `next` dist-tag, as `scripts/release.ts`
// does to npm, and its GitHub Release is marked a prerelease; a plain tag keeps `latest` (flare-e4's RC request).
it("prerelease tags", () => {
	const text = workflows.find((file) => file.name === "release.yml")?.text ?? ""
	// Build metadata after `+` is not a prerelease, as `distTag` reads it: the checks drop it before they look for `-`.
	expect(text).toContain('case "${tag%%+*}" in *-*) dist="--tag next" ;; esac')
	expect(text).toContain('npm publish "$tarball" --access public --registry https://npm.pkg.github.com $dist')
	expect(text).toContain('case "${tag%%+*}" in *-*) prerelease="--prerelease" ;; esac')
	// Each check, run by the shell on a tag, agrees with distTag on that tag.
	const checks = [...text.matchAll(/case "\$\{tag%%\+\*\}" in \*-\*\) (\w+)=/g)]
	expect(checks).toHaveLength(2)
	for (const tag of ["1.0.0", "1.0.0-rc.1", "1.0.0+build-5", "1.0.0-rc.1+build-5"]) {
		const script = `tag=${tag}; out=plain; case "\${tag%%+*}" in *-*) out=pre ;; esac; printf %s "$out"`
		const read = execFileSync("sh", ["-c", script], { encoding: "utf8" })
		expect([tag, read]).toEqual([tag, distTag(tag).length > 0 ? "pre" : "plain"])
	}
	expect(text).toContain('gh release create "$tag" --generate-notes --title "${tag#v}" $prerelease')
})

it("nothing latest", () => {
	expect(workflows.filter(({ text }) => /@latest\b/.test(text)).map((file) => file.name)).toEqual([])
})

// The browsers' topology is browser-server.ts's, the same in CI as on a machine (BUGS.md 484): the lint job's runner has
// Docker, so its `test` runs the two containers, and no workflow sets an endpoint or the proxy by hand. The e2e grid
// runs inside the pinned image and the Mac job installs its engines, so both launch them directly.
it("browsers from browser-server", () => {
	const byHand = /FLARE_BROWSER_WS|FLARE_CHROMIUM_WS|FLARE_CHROMIUM_HEADERS|loopback-proxy|x-playwright-launch-options/
	expect(workflows.filter(({ text }) => byHand.test(text)).map((file) => file.name)).toEqual([])
	const ci = workflows.find((file) => file.name === "ci.yml")?.text ?? ""
	const job = (name: string): string =>
		new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z][\\w-]*:\\n|$)`).exec(ci)?.[1] ?? ""
	expect(job("e2e-linux")).toMatch(
		/container:\s+image: mcr\.microsoft\.com\/playwright:v[\d.]+-noble@sha256:[0-9a-f]{64}/,
	)
	expect(job("e2e-mac")).toMatch(
		/runs-on: macos-latest[\s\S]*bunx playwright install --with-deps chromium firefox webkit/,
	)
})

// The nightly (plan 21 15.6, 17.1): scheduled and on demand; every job feeds the issues job, which runs whatever they did and
// alone may write issues, so a job 17.1 adds without joining it fails here; the benches restore the previous night
// before comparing and save tonight only after a pass; the baseline checks its budgets.
it("nightly", () => {
	const text = workflows.find((file) => file.name === "nightly.yml")?.text ?? ""
	expect(text).toContain('cron: "41 3 * * *"')
	expect(text).toContain("workflow_dispatch:")
	const jobs = [...text.slice(text.indexOf("\njobs:\n")).matchAll(/^ {2}([\w-]+):$/gm)].map((found) => found[1])
	expect(jobs).toEqual([
		"benches",
		"baseline",
		"perf-e2e",
		"black-box-hostile",
		"black-box-parity",
		"black-box-chaos",
		"issues",
	])
	const reported = jobs.filter((job) => job !== "issues")
	expect(text).toContain(`needs: [${reported.join(", ")}]`)
	// The issues job reports every job it waits for: one left out of its loop would fail in silence.
	expect(text).toContain(`for job in ${reported.join(" ")}; do`)
	// A black-box job's failure names its seed and the command that replays it.
	for (const job of reported.filter((name) => name.startsWith("black-box-"))) {
		expect(text).toMatch(new RegExp(`${job}:[\\s\\S]*?outputs:\\s+replay:`))
	}
	expect(text).toContain(".outputs.replay")
	expect(text).toContain("if: always()")
	expect(text.match(/issues: write/g)).toHaveLength(1)
	expect(text.indexOf("issues: write")).toBeGreaterThan(text.indexOf("  issues:"))
	expect(text).toMatch(/^permissions:\n {2}contents: read$/m)
	const restore = text.indexOf("actions/cache/restore@")
	const compare = text.indexOf("tests/perf/bench-compare.ts")
	const save = text.indexOf("actions/cache/save@")
	expect(restore).toBeGreaterThan(-1)
	expect(compare).toBeGreaterThan(restore)
	expect(save).toBeGreaterThan(compare)
	expect(text).toContain("tests/perf/baseline.ts --v0")
	expect(text).toContain("--check")
})

// The repro job (plan 41 2.2.1): dispatched by hand with a ref, a spec, a grep, projects, a repeat count, and a runner
// class, it runs main's file against the checked-out ref, so a ref older than the file runs too; it traces the dev
// servers, uploads the test results whatever the outcome, and counts each project's runs in the job summary, so a
// dispatch reads without a download (BUGS.md 453).
it("repro", () => {
	const text = workflows.find((file) => file.name === "repro.yml")?.text ?? ""
	expect(text).toMatch(/^on:\n {2}workflow_dispatch:\n {4}inputs:/m)
	for (const input of ["ref", "spec", "grep", "projects", "repeat-each", "timeout", "runner"])
		expect(text).toContain(`      ${input}:\n`)
	// Inputs reach a script through env only: spec and grep are free text, and an expression inside `run:` would be
	// pasted into the shell. The timeout passes only when set, so an empty one keeps the config's.
	const steps: Array<{ run?: string }> = Object(load(text)).jobs.repro.steps
	expect(steps.filter((step) => step.run?.includes("${{") === true).map((step) => step.run)).toEqual([])
	expect(text).toContain("TIMEOUT: ${{ inputs.timeout }}")
	expect(text).toContain('if [ -n "$TIMEOUT" ]; then args+=(--timeout "$TIMEOUT"); fi')
	expect(text).toContain("options: [macos-latest, ubuntu-latest]")
	expect(text).toContain("runs-on: ${{ inputs.runner }}")
	expect(text).toMatch(/uses: actions\/checkout@[\da-f]{40} # [^\n]+\n\s+with:\n\s+ref: \$\{\{ inputs\.ref \}\}/)
	expect(text).toContain('FLARE_E2E_TRACE: "1"')
	expect(text).toContain('--repeat-each "$REPEAT" --retries 0')
	expect(text).toContain("GITHUB_STEP_SUMMARY")
	expect(text).toMatch(/- if: always\(\)\n\s+uses: actions\/upload-artifact@/)
	expect(text).toMatch(/^permissions:\n {2}contents: read$/m)
})
