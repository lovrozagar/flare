import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { flare } from "../plugin/flare.ts"
import { COMMANDS, runBin } from "./codegen.ts"

const roots: string[] = []

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const FILES = {
	"src/client.tsx": "",
	"src/server.ts": "",
	"src/routes/_root_/root.root-layout.tsx": 'export const route = createRootLayout("_root_").render(() => "root");\n',
	"src/routes/_root_/home.page.tsx": 'export const route = createPage("_root_/").render(() => "home");\n',
	"src/routes/_root_/about/about.page.tsx": 'export const route = createPage("_root_/about").render(() => "about");\n',
}

function fixture(): string {
	const root = mkdtempSync(join(tmpdir(), "flare-bin-"))
	roots.push(root)
	for (const [path, text] of Object.entries(FILES)) {
		mkdirSync(dirname(join(root, path)), { recursive: true })
		writeFileSync(join(root, path), text)
	}
	return root
}

function output(): { lines: string[]; out: { log(line: string): void; error(line: string): void } } {
	const lines: string[] = []
	return { lines, out: { log: (line) => void lines.push(line), error: (line) => void lines.push(`error: ${line}`) } }
}

// `flare codegen` writes the files the plugin writes when a build or `vite dev` starts.
it("writes both", () => {
	const bin = fixture()
	const plugin = fixture()
	cpSync(join(bin, "src"), join(plugin, "src"), { recursive: true })
	const printed = output()
	expect(runBin(["codegen"], bin, printed.out)).toBe(0)
	expect(printed.lines).toEqual([
		"flare codegen: wrote src/_gen/routes.gen.ts, src/_gen/types.gen.d.ts, src/_gen/server-fns.gen.ts",
	])
	const core = flare().find((item) => item.name === "flare")
	const buildStart = core?.buildStart
	if (typeof buildStart !== "function") throw new Error("buildStart")
	Reflect.apply(buildStart, { environment: { config: { root: plugin } } }, [{}])
	for (const name of ["routes.gen.ts", "types.gen.d.ts"]) {
		expect(readFileSync(join(bin, "src/_gen", name), "utf8")).toBe(readFileSync(join(plugin, "src/_gen", name), "utf8"))
	}
	const again = output()
	expect(runBin(["codegen"], bin, again.out)).toBe(0)
	expect(again.lines).toEqual(["flare codegen: up to date"])
	writeFileSync(join(bin, "src/routes/_root_/broken.page.tsx"), 'export const route = createPage("_root_/");\n')
	const failed = output()
	expect(runBin(["codegen"], bin, failed.out)).toBe(1)
	expect(failed.lines[0]).toMatch(/^error: .*two pages/)
})

// The bin's one command is `codegen`, and it does not watch: `vite dev` is the watch (dx/plugin.md).
it("watch is the plugin", () => {
	expect(COMMANDS).toEqual(["codegen"])
	for (const argv of [["watch"], ["codegen", "--watch"], []]) {
		const printed = output()
		expect(runBin(argv, fixture(), printed.out)).toBe(1)
		expect(printed.lines[0]).toMatch(/^error: flare: the one command is `flare codegen`/)
	}
})
