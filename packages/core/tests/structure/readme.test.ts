import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, it } from "vitest"
import { installCommand, quickStart, readme, repo, tableRows, ticked } from "./readme.ts"

// The README is the package's front page: npm renders the tarball's copy, so its links are absolute, and it names only
// the v1 surface (plan 14 leaf 12.3). The checks against the packed exports and the quick start's compile are in
// exports.test.ts, which already packs.
const BLOB = "https://github.com/lovrozagar/flare/blob/main/"

// Every link is absolute or an anchor on the page: a relative link breaks on npm, which has no repository to resolve it
// against. A link into the repo points at a file that exists.
it("links", () => {
	const wrong: string[] = []
	for (const [, target = ""] of readme.matchAll(/\]\(([^)\s]+)\)/g)) {
		if (target.startsWith("#")) continue
		if (!target.startsWith("https://")) wrong.push(`relative: ${target}`)
		if (target.startsWith(BLOB) && !existsSync(join(repo, target.slice(BLOB.length).split("#")[0] ?? ""))) {
			wrong.push(`missing: ${target}`)
		}
		if (target.includes("blueprint/") && !target.startsWith(BLOB)) wrong.push(`not the repo: ${target}`)
	}
	expect(wrong).toEqual([])
	expect(readme).toContain(`${BLOB}blueprint/dx/README.md`)
})

// v0 names the README once documented and v1 does not have: the tracing entry and the other v0 subpaths, the `dev.*`
// option flags, the v0 CLI commands (v1's binary runs `flare codegen` only), and the v0 version.
const DENIED = [
	/tracing/i,
	/\bdev\.[A-Za-z]/,
	/flare (generate|gen|add|font|routes|status|validate)\b/,
	/@lovrozagar\/flare\/(codegen|generators|validation|virtual-types)\b/,
	/0\.1\.1/,
]

it("no v0 names", () => {
	expect(DENIED.filter((pattern) => pattern.test(readme)).map(String)).toEqual([])
})

// The quick start is marked block by block, each with the path it is compiled at.
it("quick start marked", () => {
	const paths = quickStart(readme).map((block) => block.path)
	expect(paths).toContain("tsconfig.json")
	expect(paths).toContain("src/server.ts")
	expect(new Set(paths).size).toBe(paths.length)
})

// The Install section is what an app runs: its `bun add` line names the package and every peer an app needs, each with
// the range the package declares, since a bare name installs the `latest` tag and solid-js's is 1.9 (BUGS.md 299); its
// table names every peer with that range (plan 21 5.5). The consumer cell `readme install` runs that line.
// The install line splits as a shell would: a quoted spec is one, its range's spaces included (BUGS.md 426).
it("install tokens", () => {
	const text =
		'## Install\n\nbun add @lovrozagar/flare "solid-js@>=2.0.0-rc.15 <2.0.0-rc.16" "vite@>=8.1.4" magic-string\n'
	expect(installCommand(text)).toEqual([
		"@lovrozagar/flare",
		"solid-js@>=2.0.0-rc.15 <2.0.0-rc.16",
		"vite@>=8.1.4",
		"magic-string",
	])
})

it("install names every peer", () => {
	const manifest = JSON.parse(readFileSync(join(repo, "packages/core/package.json"), "utf8"))
	const peers: Record<string, string> = manifest.peerDependencies
	const meta: Record<string, { optional?: boolean }> = manifest.peerDependenciesMeta
	const required = Object.keys(peers).filter((name) => meta[name]?.optional !== true)
	const [name, ...packages] = installCommand(readme)
	const specs = required.map((peer) => `${peer}@${peers[peer]}`).toSorted()
	expect([name, packages.toSorted()]).toEqual(["@lovrozagar/flare", specs])
	const listed: Record<string, string> = {}
	for (const [names = "", ranges = ""] of tableRows(readme, "peer")) {
		const [first, ...rest] = ticked(ranges)
		ticked(names).forEach((peer, index) => {
			listed[peer] = rest.length === 0 ? String(first) : String(ticked(ranges)[index])
		})
	}
	expect(listed).toEqual(peers)
})
