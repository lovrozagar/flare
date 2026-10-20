import { expect, it } from "vitest"
import { newestReport, peerSpecs } from "./stage.ts"

// A manifest shaped as packages/core/package.json: each peer's range is `>=` its exact devDependency (B79).
const MANIFEST = {
	peerDependencies: { "solid-js": ">=2.0.0-rc.15 <2.0.0-rc.16", vite: ">=8.1.4", sharp: ">=0.35.5", isbot: ">=5.2.0" },
	peerDependenciesMeta: { sharp: { optional: true }, isbot: { optional: true } },
	devDependencies: { "solid-js": "2.0.0-rc.15", vite: "8.1.4", sharp: "0.35.5", isbot: "5.2.0", vitest: "4.1.10" },
}

it("floor specs", () => {
	expect(peerSpecs(MANIFEST, "floor")).toEqual(["isbot@5.2.0", "sharp@0.35.5", "solid-js@2.0.0-rc.15", "vite@8.1.4"])
})

it("newest specs", () => {
	expect(peerSpecs(MANIFEST, "newest")).toEqual([
		"isbot@>=5.2.0",
		"sharp@>=0.35.5",
		"solid-js@>=2.0.0-rc.15 <2.0.0-rc.16",
		"vite@>=8.1.4",
	])
})

it("without optional peers", () => {
	expect(peerSpecs(MANIFEST, "floor", { without: ["sharp", "isbot"] })).toEqual(["solid-js@2.0.0-rc.15", "vite@8.1.4"])
})

it("without a required peer", () => {
	expect(() => peerSpecs(MANIFEST, "floor", { without: ["vite"] })).toThrow("stage: vite is not an optional peer")
})

it("peer without a floor", () => {
	const manifest = { ...MANIFEST, devDependencies: { vite: "8.1.4" } }
	expect(() => peerSpecs(manifest, "floor")).toThrow("stage: isbot has no exact devDependency, so no floor")
})

// The newest version a range admits, pre-releases included, beside the one npm installed: a pre-release range
// matches only its own release line in npm, so a later pre-release shows here as a mismatch.
it("newest report", () => {
	const report = newestReport(
		{ "solid-js": "2.0.0-rc.15", vite: "8.3.4" },
		{ "solid-js": ["1.9.17", "2.0.0-rc.15", "2.0.1-beta.1"], vite: ["8.1.4", "8.3.4", "9.0.0-beta.0"] },
		{ "solid-js": ">=2.0.0-rc.15", vite: ">=8.1.4" },
	)
	expect(report).toEqual([
		{ name: "solid-js", installed: "2.0.0-rc.15", newest: "2.0.1-beta.1", same: false },
		{ name: "vite", installed: "8.3.4", newest: "9.0.0-beta.0", same: false },
	])
})

it("newest report agrees", () => {
	const report = newestReport({ isbot: "5.2.2" }, { isbot: ["5.2.0", "5.2.2"] }, { isbot: ">=5.2.0" })
	expect(report).toEqual([{ name: "isbot", installed: "5.2.2", newest: "5.2.2", same: true }])
})

it("newest report, nothing admitted", () => {
	const report = newestReport({ isbot: "5.2.2" }, { isbot: ["4.0.0"] }, { isbot: ">=5.2.0" })
	expect(report).toEqual([{ name: "isbot", installed: "5.2.2", newest: "none", same: false }])
})
