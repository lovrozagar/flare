import { expect, it } from "vitest"
import { preloadsOf } from "./preloads.ts"

// A client manifest as Vite writes it: the entry imports the runtime, which imports a shared helper; a route imports
// the runtime and a second helper; the root layout imports nothing; shared chunks have no source; a font is no JS.
const manifest = {
	"src/client.tsx": { file: "assets/client-1.js", src: "src/client.tsx", imports: ["_runtime.js"] },
	"_runtime.js": { file: "assets/runtime-2.js", imports: ["_shared.js"] },
	"_shared.js": { file: "assets/shared-3.js" },
	"src/routes/_root_/about/about.page.tsx": {
		file: "assets/about-4.js",
		src: "src/routes/_root_/about/about.page.tsx",
		imports: ["_runtime.js", "_widget.js"],
	},
	"_widget.js": { file: "assets/widget-5.js", imports: ["_shared.js"] },
	"src/routes/_root_/root.root-layout.tsx": { file: "assets/root-6.js", src: "src/routes/_root_/root.root-layout.tsx" },
	"src/fonts/inter.woff2": { file: "assets/inter-7.woff2", src: "src/fonts/inter.woff2" },
}

// The entry's chunk and its static imports, then per route source path the route's chunk and the imports the entry
// does not already load, each through the app's asset URLs (plan 21 15.3).
it("entry and routes", () => {
	const preloads = preloadsOf(manifest, "src/client.tsx", { base: "/", assetsBase: "/assets" })
	expect(preloads.entry).toEqual(["/assets/client-1.js", "/assets/runtime-2.js", "/assets/shared-3.js"])
	expect(preloads.routes).toEqual({
		"/src/routes/_root_/about/about.page.tsx": ["/assets/about-4.js", "/assets/widget-5.js"],
		"/src/routes/_root_/root.root-layout.tsx": ["/assets/root-6.js"],
	})
	const cdn = preloadsOf(manifest, "src/client.tsx", { base: "https://cdn.test/", assetsBase: "/assets" })
	expect(cdn.entry[0]).toBe("https://cdn.test/assets/client-1.js")
})

// An import the manifest does not list is skipped, and a cycle of imports ends.
it("missing and cyclic imports", () => {
	const cyclic = {
		"src/client.tsx": { file: "assets/client.js", imports: ["_a.js", "_gone.js"] },
		"_a.js": { file: "assets/a.js", imports: ["_b.js"] },
		"_b.js": { file: "assets/b.js", imports: ["_a.js"] },
	}
	expect(preloadsOf(cyclic, "src/client.tsx", { base: "/", assetsBase: "/assets" })).toEqual({
		entry: ["/assets/client.js", "/assets/a.js", "/assets/b.js"],
		routes: {},
	})
	expect(() => preloadsOf(cyclic, "src/missing.tsx", { base: "/", assetsBase: "/assets" })).toThrow(/manifest/)
})
