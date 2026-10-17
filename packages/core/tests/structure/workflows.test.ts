import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
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
	expect(workflows.map((file) => file.name)).toEqual(["ci.yml", "consumers-newest.yml", "release.yml"])
	const unpinned = workflows.flatMap(({ name, text }) =>
		[...text.matchAll(/uses:\s*(\S+)/g)]
			.map((found) => found[1] ?? "")
			.filter((action) => !/^[\w.-]+\/[\w.-]+@[\da-f]{40}$/.test(action))
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
