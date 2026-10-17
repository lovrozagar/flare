import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { Plugin } from "vite"
import { expect, it } from "vitest"
import { canResolve, FEATURE_PEERS, missingPeers, peerGuard } from "./peers.ts"

const RANGES: Record<string, string> = JSON.parse(
	readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
).peerDependencies
// A file of the package itself, as Vite names an importer: the i18n matcher, which imports the three i18n peers.
const OWN = fileURLToPath(new URL("../../features/i18n/server/match.ts", import.meta.url))

type Resolved = { id: string } | null

// The plugin's resolveId, run with a stand-in for Vite's `this.resolve` that answers from `found`.
function resolveWith(plugin: Plugin, found: Record<string, Resolved>) {
	const hook = plugin.resolveId
	if (typeof hook !== "function") throw new Error("peerGuard has no resolveId function")
	const asked: string[] = []
	const context = {
		resolve: async (source: string, importer: string, options: { skipSelf?: boolean }) => {
			asked.push(`${source} ${options.skipSelf === true ? "skipSelf" : ""} ${importer === OWN ? "own" : importer}`)
			return found[source] ?? null
		},
	}
	const call = (source: string, importer: string | undefined) =>
		Reflect.apply(hook, context, [source, importer, { isEntry: false }]) as Promise<Resolved>
	return { call, asked }
}

it("feature peers", () => {
	expect(FEATURE_PEERS).toEqual({
		i18n: ["@formatjs/intl-localematcher", "isbot", "negotiator"],
		image: ["sharp"],
		query: ["@tanstack/solid-query"],
	})
	for (const peers of Object.values(FEATURE_PEERS)) for (const peer of peers) expect(RANGES[peer]).toMatch(/^>=/)
})

it("message", () => {
	expect(missingPeers("i18n", ["isbot", "negotiator"]).message).toBe(
		[
			`flare: i18n needs isbot. Install it: npm install isbot@"${RANGES["isbot"]}"`,
			`flare: i18n needs negotiator. Install it: npm install negotiator@"${RANGES["negotiator"]}"`,
		].join("\n"),
	)
})

// A missing peer resolves to nothing, or to Vite's stub for a missing optional peer: either way every missing peer of
// the feature is named in the one error, not only the one being imported.
it("missing peers", async () => {
	const { call } = resolveWith(peerGuard({ image: false }), {
		"@formatjs/intl-localematcher": { id: "__vite-optional-peer-dep:@formatjs/intl-localematcher:@lovrozagar/flare" },
		isbot: { id: "/app/node_modules/isbot/index.mjs" },
	})
	await expect(call("isbot", OWN)).rejects.toThrow(missingPeers("i18n", ["@formatjs/intl-localematcher", "negotiator"]))
})

it("present peers", async () => {
	const { call, asked } = resolveWith(peerGuard({ image: false }), {
		"@tanstack/solid-query": { id: "/app/node_modules/@tanstack/solid-query/build/index.js" },
	})
	expect(await call("@tanstack/solid-query", OWN)).toEqual({
		id: "/app/node_modules/@tanstack/solid-query/build/index.js",
	})
	expect(asked).toEqual(["@tanstack/solid-query skipSelf own", "@tanstack/solid-query skipSelf own"])
})

// The guard reads only the package's own imports of a peer: an app's own import, any other import, or one with no
// importer is Vite's to resolve.
it("not the package's", async () => {
	const { call, asked } = resolveWith(peerGuard({ image: false }), {})
	expect(await call("isbot", "/app/src/server.ts")).toBeNull()
	expect(await call("solid-js", OWN)).toBeNull()
	expect(await call("isbot", undefined)).toBeNull()
	expect(asked).toEqual([])
})

// The plugin's configResolved, run with a resolver that answers `has`.
function configResolved(image: boolean, has: (name: string) => boolean): unknown {
	const hook = peerGuard({ image, has }).configResolved
	if (typeof hook !== "function") throw new Error("peerGuard has no configResolved function")
	return Reflect.apply(hook, {}, [{}])
}

// `flare({ image })` needs sharp, used or not, so the build that turns it on says so, not a later image import.
it("image needs sharp", () => {
	expect(() => configResolved(true, () => false)).toThrow(missingPeers("image", ["sharp"]))
	expect(configResolved(true, (name) => name === "sharp")).toBeUndefined()
	expect(configResolved(false, () => false)).toBeUndefined()
})

// Resolution from the package's own location, as its `import("sharp")` resolves.
it("can resolve", () => {
	expect([canResolve("vite"), canResolve("flare-no-such-package")]).toEqual([true, false])
})
