import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"
import { flare } from "./flare.ts"
import { parseOptions, type FlareOptions } from "./options.ts"

const widths = [640, 750, 828, 1080, 1200, 1920]

it("assets base", () => {
	expect(parseOptions().assetsBase).toBe("/assets")
	expect(parseOptions({ assetsBase: "/assets" }).assetsBase).toBe("/assets")
	expect(parseOptions({ assetsBase: "/" }).assetsBase).toBe("/")
	expect(parseOptions({ assetsBase: "/cdn" }).assetsBase).toBe("/cdn")
	expect(() => parseOptions({ assetsBase: "assets" })).toThrow("assets")
	expect(() => parseOptions({ assetsBase: "/assets/" })).toThrow("/assets/")
	expect(() => parseOptions({ assetsBase: "/assets?x" })).toThrow("/assets?x")
	expect(() => parseOptions({ assetsBase: "/assets#x" })).toThrow("/assets#x")
})

it("image empty", () => {
	// `{}` turns the image plugin on. Absent, there is none, and sharp never loads.
	expect(flare({ image: {} }).map((plugin) => plugin.name)).toContain("flare:image")
	expect(flare().map((plugin) => plugin.name)).not.toContain("flare:image")
	expect(parseOptions().image).toBeUndefined()
	expect(parseOptions({ image: {} }).image).toEqual({ widths, quality: 75 })
})

it("css key", () => {
	expect(() => {
		// @ts-expect-error css only accepts reset
		parseOptions({ css: { nope: true } })
	}).toThrow(/nope/)
})

it("top level", () => {
	expect(() => {
		// @ts-expect-error reset is css.reset, not a top-level option
		parseOptions({ reset: true })
	}).toThrow(/reset/)
})

it("reset on", () => {
	expect(parseOptions({ css: { reset: true } }).css).toEqual({ reset: true })
})

// Omission, an empty object, and `reset: false` parse to the same value.
it("reset off", () => {
	expect(parseOptions().css).toEqual({ reset: false })
	expect(parseOptions({ css: {} }).css).toEqual({ reset: false })
	expect(parseOptions({ css: { reset: false } }).css).toEqual({ reset: false })
})

const ENABLED = fileURLToPath(new URL("../../client/sync/enabled.ts", import.meta.url))

// The core plugin's load hook, as the named environment calls it for `id`.
type Load = { options?: FlareOptions; name: string; command: "serve" | "build"; id?: string }

function loaded({ options, name, command, id = ENABLED }: Load): unknown {
	const core = flare(options).find((plugin) => plugin.name === "flare")
	const load = core?.load
	if (typeof load !== "function") throw new Error("load")
	return Reflect.apply(load, { environment: { name, config: { command, root: "/app" } } }, [id])
}

// Omitted and `true` leave client/sync/enabled.ts as its source, `broadcastEnabled = true`, in every environment.
it("broadcast on", () => {
	expect(parseOptions().broadcast).toBe(true)
	expect(parseOptions({ broadcast: true }).broadcast).toBe(true)
	for (const options of [{}, { broadcast: true }])
		for (const command of ["serve", "build"] as const) expect(loaded({ options, name: "client", command })).toBeNull()
})

// `false` replaces the module in the client environment, in dev and in the client build. The server copy stays.
it("broadcast off", () => {
	expect(parseOptions({ broadcast: false }).broadcast).toBe(false)
	expect(() => parseOptions({ broadcast: "no" } as unknown as FlareOptions)).toThrow(/broadcast/)
	const off = { broadcast: false }
	for (const command of ["serve", "build"] as const) {
		expect(loaded({ options: off, name: "client", command })).toBe("export const broadcastEnabled = false;\n")
		expect(loaded({ options: off, name: "ssr", command })).toBeNull()
		expect(loaded({ options: off, name: "flare_prerender", command })).toBeNull()
	}
	expect(loaded({ options: off, name: "client", command: "serve", id: "/app/src/enabled.ts" })).toBeNull()
})

const banned = [
	"alias",
	"codegen",
	"dev",
	"ignorePrefix",
	"logLevel",
	"port",
	"purge",
	"retainPreviousAssets",
	"serviceWorker",
	"site",
	"solid",
	"sx",
]

const typed: Array<[string, () => void]> = [
	[
		"alias",
		() => {
			// @ts-expect-error alias does not exist
			parseOptions({ alias: true })
		},
	],
	[
		"codegen",
		() => {
			// @ts-expect-error codegen does not exist
			parseOptions({ codegen: true })
		},
	],
	[
		"dev",
		() => {
			// @ts-expect-error dev does not exist
			parseOptions({ dev: true })
		},
	],
	[
		"ignorePrefix",
		() => {
			// @ts-expect-error ignorePrefix does not exist
			parseOptions({ ignorePrefix: true })
		},
	],
	[
		"logLevel",
		() => {
			// @ts-expect-error logLevel does not exist
			parseOptions({ logLevel: true })
		},
	],
	[
		"port",
		() => {
			// @ts-expect-error port does not exist
			parseOptions({ port: true })
		},
	],
	[
		"purge",
		() => {
			// @ts-expect-error purge does not exist
			parseOptions({ purge: true })
		},
	],
	[
		"retainPreviousAssets",
		() => {
			// @ts-expect-error retainPreviousAssets does not exist
			parseOptions({ retainPreviousAssets: true })
		},
	],
	[
		"serviceWorker",
		() => {
			// @ts-expect-error serviceWorker does not exist
			parseOptions({ serviceWorker: true })
		},
	],
	[
		"site",
		() => {
			// @ts-expect-error site does not exist
			parseOptions({ site: true })
		},
	],
	[
		"solid",
		() => {
			// @ts-expect-error solid does not exist
			parseOptions({ solid: true })
		},
	],
	[
		"sx",
		() => {
			// @ts-expect-error sx does not exist
			parseOptions({ sx: true })
		},
	],
]

it("unknown", () => {
	for (const key of banned) expect(() => parseOptions({ [key]: true } as unknown as FlareOptions)).toThrow(key)
	for (const [key, run] of typed) expect(run).toThrow(new RegExp(key))
})

function tokenEnv(): Record<string, unknown> {
	return { TOKEN: "t" }
}

// Omitted and `false` are off, `true` is every default, and an object is checked key by key (dx/plugin.md).
it("prerender", () => {
	expect(parseOptions().prerender).toBe(false)
	expect(parseOptions({ prerender: false }).prerender).toBe(false)
	expect(parseOptions({ prerender: true }).prerender).toEqual({})
	const full = { concurrency: 2, exclude: ["_root_/a"], env: tokenEnv, sitemap: {} }
	expect(parseOptions({ prerender: full }).prerender).toEqual(full)
	expect(parseOptions({ prerender: { env: { TOKEN: "t" } } }).prerender).toEqual({ env: { TOKEN: "t" } })
	const bad: Array<[unknown, RegExp]> = [
		[{ concurrency: 0 }, /prerender\.concurrency/],
		[{ concurrency: 1.5 }, /prerender\.concurrency/],
		[{ exclude: "_root_/a" }, /prerender\.exclude/],
		[{ exclude: [1] }, /prerender\.exclude/],
		[{ env: "TOKEN" }, /prerender\.env/],
		[{ env: null }, /prerender\.env/],
		[{ origin: "x" }, /prerender\.origin/],
		[{ sitemap: true }, /prerender\.sitemap/],
		[{ sitemap: [] }, /prerender\.sitemap/],
		[{ sitemap: null }, /prerender\.sitemap/],
		[{ sitemap: { priority: 2 } }, /sitemap priority 2 is not a number from 0 to 1/],
	]
	for (const [prerender, error] of bad) {
		expect(() => parseOptions({ prerender } as unknown as FlareOptions)).toThrow(error)
	}
})

// `fonts.dir` names the directory that holds `<family>/<file>.woff2`. Absent, the plugin emits no font file.
it("fonts", () => {
	expect(parseOptions().fonts).toBeUndefined()
	expect(parseOptions({ fonts: { dir: "fonts" } }).fonts).toEqual({ dir: "fonts" })
	expect(flare({ fonts: { dir: "fonts" } }).map((plugin) => plugin.name)).toContain("flare:fonts")
	expect(flare().map((plugin) => plugin.name)).not.toContain("flare:fonts")
	const bad: unknown[] = ["fonts", null, {}, { dir: "" }, { dir: 1 }, { dir: "fonts", extra: true }]
	for (const fonts of bad) expect(() => parseOptions({ fonts } as unknown as FlareOptions)).toThrow(/^fonts/)
})
