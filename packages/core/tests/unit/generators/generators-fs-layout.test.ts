import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
	formatFsCodegenError,
	formatFsLayoutWarning,
	inspectFsCodegenLayout,
	runGenerate,
} from "../../../src/generators/index.ts"

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..")

function writeFile(root: string, relPath: string, content: string): void {
	const full = join(root, relPath)
	mkdirSync(join(full, ".."), { recursive: true })
	writeFileSync(full, content, "utf-8")
}

describe("inspectFsCodegenLayout", () => {
	let tmpDir: string

	beforeEach(() => {
		tmpDir = join(tmpdir(), `flare-fs-layout-${Date.now()}-${Math.random().toString(16).slice(2)}`)
		mkdirSync(tmpDir, { recursive: true })
	})

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true })
	})

	it("returns no issues for a conforming _root_ tree", () => {
		writeFile(tmpDir, "src/routes/_root_/root.root-layout.tsx", `export const route = createRootLayout("_root_")`)
		writeFile(tmpDir, "src/routes/_root_/home.page.tsx", `export const route = createPage("_root_/")`)
		writeFile(tmpDir, "src/routes/_root_/about/about.page.tsx", `export const route = createPage("_root_/about")`)
		expect(inspectFsCodegenLayout({ rootDir: tmpDir })).toEqual([])
	})

	it("flags string-style about.tsx under routes/", () => {
		writeFile(tmpDir, "src/routes/about.tsx", `export const route = createPage("_root_/about")`)
		const issues = inspectFsCodegenLayout({ rootDir: tmpDir })
		expect(issues).toHaveLength(1)
		expect(issues[0]?.kind).toBe("string-style-route")
		expect(issues[0]?.filePath).toBe("src/routes/about.tsx")
		expect(issues[0]?.message).toContain("createPage")
	})

	it("flags _root_.tsx and _layout_.tsx string-style names", () => {
		writeFile(tmpDir, "src/routes/_root_.tsx", `export const route = createRootLayout("_root_")`)
		writeFile(tmpDir, "src/routes/dashboard/_layout_.tsx", `export const route = createLayout("_root_/(dashboard)")`)
		const kinds = inspectFsCodegenLayout({ rootDir: tmpDir }).map((i) => i.kind)
		expect(kinds).toEqual(["string-style-route", "string-style-route"])
	})

	it("flags a suffix page that is not inside a _name_ root scope", () => {
		writeFile(tmpDir, "src/routes/about/about.page.tsx", `export const route = createPage("about")`)
		const issues = inspectFsCodegenLayout({ rootDir: tmpDir })
		expect(issues[0]?.kind).toBe("missing-root-scope")
		expect(issues[0]?.filePath).toBe("src/routes/about/about.page.tsx")
	})

	it("flags suffix files outside routes/", () => {
		writeFile(tmpDir, "src/pages/home.page.tsx", `export const route = createPage("_root_/")`)
		const issues = inspectFsCodegenLayout({ rootDir: tmpDir })
		expect(issues[0]?.kind).toBe("suffix-outside-routes")
		expect(issues[0]?.filePath).toBe("src/pages/home.page.tsx")
	})

	it("does not flag helpers without a builder export", () => {
		writeFile(tmpDir, "src/routes/_root_/about/Button.tsx", "export function Button() { return null }")
		writeFile(tmpDir, "src/routes/_root_/about/about.page.tsx", `export const route = createPage("_root_/about")`)
		expect(inspectFsCodegenLayout({ rootDir: tmpDir })).toEqual([])
	})

	it("ignores _utils even when a suffix file lives there", () => {
		writeFile(tmpDir, "src/routes/_utils/helper.page.tsx", `export const route = createPage("x")`)
		expect(inspectFsCodegenLayout({ rootDir: tmpDir })).toEqual([])
	})

	it("allows pre-root [locale] before _root_", () => {
		writeFile(
			tmpDir,
			"src/routes/[locale]/_root_/home.page.tsx",
			`export const route = createPage("[locale]/_root_/")`,
		)
		expect(inspectFsCodegenLayout({ rootDir: tmpDir })).toEqual([])
	})

	it("allows [[locale]] optional pre-root before _root_", () => {
		writeFile(
			tmpDir,
			"src/routes/[[locale]]/_root_/root.root-layout.tsx",
			`export const route = createRootLayout("[[locale]]/_root_")`,
		)
		expect(inspectFsCodegenLayout({ rootDir: tmpDir })).toEqual([])
	})

	it("allows a second root scope _admin_", () => {
		writeFile(tmpDir, "src/routes/_admin_/dash.page.tsx", `export const route = createPage("_admin_/")`)
		expect(inspectFsCodegenLayout({ rootDir: tmpDir })).toEqual([])
	})

	it("formatFsCodegenError lists expected layout and the opt-out", () => {
		const text = formatFsCodegenError([
			{
				filePath: "src/routes/about.tsx",
				kind: "string-style-route",
				message: "src/routes/about.tsx declares createPage(...) but has no suffix",
			},
		])
		expect(text).toContain("fsVirtualPaths is enabled")
		expect(text).toContain("src/routes/about.tsx")
		expect(text).toContain("home.page.tsx")
		expect(text).toContain("fsVirtualPaths: false")
	})
})

describe("runGenerate — fsVirtualPaths on (conforming trees)", () => {
	let tmpDir: string

	beforeEach(() => {
		tmpDir = join(tmpdir(), `flare-fs-on-${Date.now()}-${Math.random().toString(16).slice(2)}`)
		mkdirSync(tmpDir, { recursive: true })
	})

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true })
	})

	it("simple: root layout + home + about", () => {
		writeFile(tmpDir, "src/routes/_root_/root.root-layout.tsx", "")
		writeFile(tmpDir, "src/routes/_root_/home.page.tsx", "")
		writeFile(tmpDir, "src/routes/_root_/about/about.page.tsx", "")

		const result = runGenerate({ fsCodegen: true, rootDir: tmpDir })
		expect(result.routes).toBe(2)
		expect(result.layouts).toBe(1)

		const gen = readFileSync(join(tmpDir, "src/_gen/routes.gen.ts"), "utf-8")
		expect(gen).toContain('v: "/"')
		expect(gen).toContain('x: "_root_/"')
		expect(gen).toContain('v: "/about"')
		expect(gen).toContain('x: "_root_/about"')
		expect(readFileSync(join(tmpDir, "src/routes/_root_/home.page.tsx"), "utf-8")).toContain(
			`createPage("_root_/")`,
		)
	})

	it("groups, params, catch-all, optional catch-all, escaped underscore", () => {
		writeFile(tmpDir, "src/routes/_root_/root.root-layout.tsx", "")
		writeFile(tmpDir, "src/routes/_root_/(blog)/blog.layout.tsx", "")
		writeFile(tmpDir, "src/routes/_root_/(blog)/blog/list.page.tsx", "")
		writeFile(tmpDir, "src/routes/_root_/(blog)/blog/[slug]/post.page.tsx", "")
		writeFile(tmpDir, "src/routes/_root_/files/[...path]/files.page.tsx", "")
		writeFile(tmpDir, "src/routes/_root_/locale/[[...rest]]/rest.page.tsx", "")
		writeFile(tmpDir, "src/routes/_root_/[_]internal/hidden.page.tsx", "")
		writeFile(tmpDir, "src/routes/_root_/users/[id]/id.path-segment.tsx", "")

		const result = runGenerate({ fsCodegen: true, rootDir: tmpDir })
		expect(result.routes).toBe(5)
		const gen = readFileSync(join(tmpDir, "src/_gen/routes.gen.ts"), "utf-8")
		expect(gen).toContain('v: "/blog"')
		expect(gen).toContain('x: "_root_/(blog)/blog"')
		expect(gen).toContain('v: "/blog/[slug]"')
		expect(gen).toContain('v: "/files/[...path]"')
		expect(gen).toContain('v: "/locale/[[...rest]]"')
		expect(gen).toContain('v: "/_internal"')
		expect(gen).toContain('"_root_/users/[id]"')
	})

	it("four nested group layouts + index + sibling page", () => {
		writeFile(tmpDir, "src/routes/_root_/(dc)/dc.layout.tsx", "")
		writeFile(tmpDir, "src/routes/_root_/(dc)/(inner)/inner.layout.tsx", "")
		writeFile(tmpDir, "src/routes/_root_/(dc)/(inner)/(deep)/deep.layout.tsx", "")
		writeFile(tmpDir, "src/routes/_root_/(dc)/(inner)/(deep)/(leaf)/leaf.layout.tsx", "")
		writeFile(tmpDir, "src/routes/_root_/(dc)/(inner)/(deep)/(leaf)/deep-cache/index.page.tsx", "")
		writeFile(
			tmpDir,
			"src/routes/_root_/(dc)/(inner)/(deep)/(leaf)/deep-cache/uncached/uncached.page.tsx",
			"",
		)

		const result = runGenerate({ fsCodegen: true, rootDir: tmpDir })
		expect(result.routes).toBe(2)
		expect(result.layouts).toBe(4)
		const gen = readFileSync(join(tmpDir, "src/_gen/routes.gen.ts"), "utf-8")
		expect(gen).toContain('v: "/deep-cache"')
		expect(gen).toContain('v: "/deep-cache/uncached"')
		expect(gen).toContain('"_root_/(dc)/(inner)/(deep)/(leaf)"')
	})

	it("multi-root _root_ + _admin_ do not collide on different URLs", () => {
		writeFile(tmpDir, "src/routes/_root_/root.root-layout.tsx", "")
		writeFile(tmpDir, "src/routes/_root_/about/about.page.tsx", "")
		writeFile(tmpDir, "src/routes/_admin_/admin.root-layout.tsx", "")
		writeFile(tmpDir, "src/routes/_admin_/dashboard/dash.page.tsx", "")

		const result = runGenerate({ fsCodegen: true, rootDir: tmpDir })
		expect(result.routes).toBe(2)
		expect(result.layouts).toBe(2)
		const gen = readFileSync(join(tmpDir, "src/_gen/routes.gen.ts"), "utf-8")
		expect(gen).toContain('v: "/about"')
		expect(gen).toContain('v: "/dashboard"')
		expect(gen).toContain('x: "_admin_/dashboard"')
	})

	it("rewrites a stale virtual path after the file is moved", () => {
		writeFile(
			tmpDir,
			"src/routes/_root_/contact/contact.page.tsx",
			`import { createPage } from "flare/page"\nexport const route = createPage("_root_/old")\n`,
		)
		runGenerate({ fsCodegen: true, rootDir: tmpDir })
		expect(readFileSync(join(tmpDir, "src/routes/_root_/contact/contact.page.tsx"), "utf-8")).toContain(
			`createPage("_root_/contact")`,
		)
		expect(readFileSync(join(tmpDir, "src/routes/_root_/contact/contact.page.tsx"), "utf-8")).not.toContain(
			`"_root_/old"`,
		)
	})

	it("dotted URL segment sitemap.xml", () => {
		writeFile(tmpDir, "src/routes/_root_/sitemap.xml/sitemap.page.tsx", "")
		runGenerate({ fsCodegen: true, rootDir: tmpDir })
		expect(readFileSync(join(tmpDir, "src/_gen/routes.gen.ts"), "utf-8")).toContain('v: "/sitemap.xml"')
	})
})

describe("runGenerate — fsVirtualPaths on (bad structure)", () => {
	let tmpDir: string

	beforeEach(() => {
		tmpDir = join(tmpdir(), `flare-fs-bad-${Date.now()}-${Math.random().toString(16).slice(2)}`)
		mkdirSync(tmpDir, { recursive: true })
	})

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true })
	})

	it("throws and does not write _gen when only string-style files exist", () => {
		writeFile(tmpDir, "src/routes/about.tsx", `export const route = createPage("_root_/about")`)
		writeFile(tmpDir, "src/routes/_root_.tsx", `export const route = createRootLayout("_root_")`)

		expect(() => runGenerate({ fsCodegen: true, rootDir: tmpDir })).toThrow(/fsVirtualPaths is enabled/)
		expect(() => runGenerate({ fsCodegen: true, rootDir: tmpDir })).toThrow(/about\.tsx/)
		expect(() => runGenerate({ fsCodegen: true, rootDir: tmpDir })).toThrow(/fsVirtualPaths: false/)
		expect(() => readFileSync(join(tmpDir, "src/_gen/routes.gen.ts"))).toThrow()
	})

	it("throws when a suffix page sits outside any _name_ scope and nothing else is valid", () => {
		writeFile(tmpDir, "src/routes/about/about.page.tsx", "")
		expect(() => runGenerate({ fsCodegen: true, rootDir: tmpDir })).toThrow(/root-scope/)
		expect(() => runGenerate({ fsCodegen: true, rootDir: tmpDir })).toThrow(/about\/about\.page\.tsx/)
	})

	it("mixed leftover about.tsx is a warning — valid suffix routes still generate", () => {
		writeFile(tmpDir, "src/routes/_root_/root.root-layout.tsx", "")
		writeFile(tmpDir, "src/routes/_root_/home.page.tsx", "")
		writeFile(
			tmpDir,
			"src/routes/about.tsx",
			`import { createPage } from "flare/page"\n\nexport const route = createPage("_root_/about")\n`,
		)

		const warns: string[] = []
		const orig = console.warn
		console.warn = (...args: unknown[]) => {
			warns.push(args.map(String).join(" "))
		}
		try {
			const result = runGenerate({ fsCodegen: true, rootDir: tmpDir })
			expect(result.routes).toBe(1)
			expect(result.warnings).toHaveLength(1)
			expect(result.warnings[0]).toContain("src/routes/about.tsx:3")
			expect(result.warnings[0]).toContain("createPage")
			expect(result.warnings[0]).toContain("skipped")
			expect(warns.some((w) => w.includes("[flare:generate]") && w.includes("about.tsx:3"))).toBe(
				true,
			)
		} finally {
			console.warn = orig
		}

		const gen = readFileSync(join(tmpDir, "src/_gen/routes.gen.ts"), "utf-8")
		expect(gen).toContain('x: "_root_/"')
		expect(gen).not.toContain('x: "_root_/about"')
		expect(readFileSync(join(tmpDir, "src/routes/about.tsx"), "utf-8")).toContain(
			`createPage("_root_/about")`,
		)
	})

	it("misplaced suffix page is skipped with a warning when other routes are valid", () => {
		writeFile(tmpDir, "src/routes/_root_/root.root-layout.tsx", "")
		writeFile(tmpDir, "src/routes/_root_/home.page.tsx", "")
		writeFile(tmpDir, "src/routes/about/about.page.tsx", "")

		const result = runGenerate({ fsCodegen: true, rootDir: tmpDir })
		expect(result.routes).toBe(1)
		expect(result.warnings.some((w) => w.includes("src/routes/about/about.page.tsx"))).toBe(true)
		expect(result.warnings.some((w) => w.includes("root-scope"))).toBe(true)
		const gen = readFileSync(join(tmpDir, "src/_gen/routes.gen.ts"), "utf-8")
		expect(gen).toContain('x: "_root_/"')
		expect(gen).not.toContain('x: "about"')
	})

	it("suffix file outside routes/ is a warning, not a crash", () => {
		writeFile(tmpDir, "src/routes/_root_/root.root-layout.tsx", "")
		writeFile(tmpDir, "src/routes/_root_/home.page.tsx", "")
		writeFile(tmpDir, "src/pages/extra.page.tsx", `export const route = createPage("_root_/extra")`)

		const result = runGenerate({ fsCodegen: true, rootDir: tmpDir })
		expect(result.routes).toBe(1)
		expect(result.warnings.some((w) => w.includes("src/pages/extra.page.tsx"))).toBe(true)
		expect(result.warnings.some((w) => w.includes("not under src/routes/"))).toBe(true)
		const gen = readFileSync(join(tmpDir, "src/_gen/routes.gen.ts"), "utf-8")
		expect(gen).not.toContain("/extra")
	})

	it("helpers and _utils do not warn or crash", () => {
		writeFile(tmpDir, "src/routes/_root_/root.root-layout.tsx", "")
		writeFile(tmpDir, "src/routes/_root_/home.page.tsx", "")
		writeFile(tmpDir, "src/routes/_root_/about/Button.tsx", "export function Button() { return null }")
		writeFile(tmpDir, "src/routes/_utils/helper.page.tsx", `export const route = createPage("x")`)

		const result = runGenerate({ fsCodegen: true, rootDir: tmpDir })
		expect(result.routes).toBe(1)
		expect(result.warnings).toEqual([])
	})

	it("formatFsLayoutWarning puts file:line first", () => {
		expect(
			formatFsLayoutWarning({
				filePath: "src/routes/about.tsx",
				kind: "string-style-route",
				line: 3,
				message: "declares createPage(...) but has no suffix — skipped",
			}),
		).toBe("src/routes/about.tsx:3 — declares createPage(...) but has no suffix — skipped")
	})

	it("does not rewrite string-style source when it throws", () => {
		const src = `export const route = createPage("_root_/about")\n`
		writeFile(tmpDir, "src/routes/about.tsx", src)
		expect(() => runGenerate({ fsCodegen: true, rootDir: tmpDir })).toThrow()
		expect(readFileSync(join(tmpDir, "src/routes/about.tsx"), "utf-8")).toBe(src)
	})
})

describe("runGenerate — fsVirtualPaths off (string-style)", () => {
	let tmpDir: string

	beforeEach(() => {
		tmpDir = join(tmpdir(), `flare-fs-off-${Date.now()}-${Math.random().toString(16).slice(2)}`)
		mkdirSync(tmpDir, { recursive: true })
	})

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true })
	})

	it("keeps handwritten virtual paths and does not require suffixes", () => {
		writeFile(
			tmpDir,
			"src/routes/_root_.tsx",
			`export const route = createRootLayout("_root_")\n`,
		)
		writeFile(
			tmpDir,
			"src/routes/about.tsx",
			`export const route = createPage("_root_/about")\n`,
		)
		writeFile(
			tmpDir,
			"src/routes/dashboard/_layout_.tsx",
			`export const route = createLayout("_root_/(dashboard)")\n`,
		)
		writeFile(
			tmpDir,
			"src/routes/dashboard/index.tsx",
			`export const route = createPage("_root_/(dashboard)/")\n`,
		)
		writeFile(
			tmpDir,
			"src/routes/users/[id].tsx",
			`export const route = createPage("_root_/users/[id]")\n`,
		)
		writeFile(
			tmpDir,
			"src/routes/files/[...path].tsx",
			`export const route = createPage("_root_/files/[...path]")\n`,
		)

		const result = runGenerate({ fsCodegen: false, rootDir: tmpDir })
		expect(result.routes).toBe(4)
		expect(result.layouts).toBe(2)

		expect(readFileSync(join(tmpDir, "src/routes/about.tsx"), "utf-8")).toBe(
			`export const route = createPage("_root_/about")\n`,
		)
		const gen = readFileSync(join(tmpDir, "src/_gen/routes.gen.ts"), "utf-8")
		expect(gen).toContain('x: "_root_/about"')
		expect(gen).toContain('x: "_root_/(dashboard)/"')
		expect(gen).toContain('v: "/users/[id]"')
		expect(gen).toContain('v: "/files/[...path]"')
		expect(gen).toContain("../routes/about")
	})

	it("does not rewrite a mismatched path when fs is off", () => {
		writeFile(
			tmpDir,
			"src/routes/contact.tsx",
			`export const route = createPage("_root_/old-name")\n`,
		)
		runGenerate({ fsCodegen: false, rootDir: tmpDir })
		expect(readFileSync(join(tmpDir, "src/routes/contact.tsx"), "utf-8")).toContain(
			`createPage("_root_/old-name")`,
		)
		expect(readFileSync(join(tmpDir, "src/_gen/routes.gen.ts"), "utf-8")).toContain(
			'x: "_root_/old-name"',
		)
	})

	it("still picks up suffix files if they already contain createPage strings", () => {
		writeFile(
			tmpDir,
			"src/routes/_root_/about/about.page.tsx",
			`export const route = createPage("_root_/about")\n`,
		)
		const result = runGenerate({ fsCodegen: false, rootDir: tmpDir })
		expect(result.routes).toBe(1)
		expect(readFileSync(join(tmpDir, "src/_gen/routes.gen.ts"), "utf-8")).toContain('x: "_root_/about"')
	})
})

function copyConsumer(src: string): string {
	const dest = join(tmpdir(), `flare-consumer-${Date.now()}-${Math.random().toString(16).slice(2)}`)
	cpSync(src, dest, {
		filter: (path) => !path.includes("node_modules"),
		recursive: true,
	})
	return dest
}

describe("consumers — fs on vs off", () => {
	const copies: string[] = []

	afterEach(() => {
		for (const dir of copies.splice(0)) {
			rmSync(dir, { force: true, recursive: true })
		}
	})

	it("flare-standard (string-style) generates with fs off", () => {
		const root = copyConsumer(join(REPO_ROOT, "packages/core/tests/fixtures/string-style-app"))
		copies.push(root)
		const aboutBefore = readFileSync(join(root, "src/routes/about.tsx"), "utf-8")
		const result = runGenerate({ fsCodegen: false, rootDir: root })
		expect(result.routes).toBeGreaterThan(10)
		expect(result.layouts).toBeGreaterThanOrEqual(1)
		expect(readFileSync(join(root, "src/routes/about.tsx"), "utf-8")).toBe(aboutBefore)
		const gen = readFileSync(join(root, "src/_gen/routes.gen.ts"), "utf-8")
		expect(gen).toContain('x: "_root_/about"')
		expect(gen).toContain('x: "_root_/(dashboard)/dashboard"')
		expect(gen).toContain('"_root_/(dashboard)"')
		expect(gen).toContain('v: "/users/[id]"')
		expect(gen).toContain('v: "/files/[...path]"')
		expect(gen).toContain("../routes/about")
		expect(gen).toContain("../routes/dashboard/_layout_")
	})

	it("flare-standard throws a structure error with fs on", () => {
		const root = copyConsumer(join(REPO_ROOT, "packages/core/tests/fixtures/string-style-app"))
		copies.push(root)
		expect(() => runGenerate({ fsCodegen: true, rootDir: root })).toThrow(/fsVirtualPaths is enabled/)
		expect(() => runGenerate({ fsCodegen: true, rootDir: root })).toThrow(/about\.tsx/)
		expect(() => runGenerate({ fsCodegen: true, rootDir: root })).toThrow(/_root_\.tsx/)
		expect(() => runGenerate({ fsCodegen: true, rootDir: root })).toThrow(/_layout_\.tsx/)
	})

	it("e2e/apps/product (string-style) generates with fs off and throws with fs on", () => {
		const root = copyConsumer(join(REPO_ROOT, "e2e/apps/product"))
		copies.push(root)
		const aboutBefore = readFileSync(join(root, "src/routes/about.tsx"), "utf-8")
		const result = runGenerate({ fsCodegen: false, rootDir: root })
		expect(result.routes).toBeGreaterThan(40)
		expect(readFileSync(join(root, "src/routes/about.tsx"), "utf-8")).toBe(aboutBefore)
		expect(() => runGenerate({ fsCodegen: true, rootDir: root })).toThrow(/fsVirtualPaths is enabled/)
		expect(() => runGenerate({ fsCodegen: true, rootDir: root })).toThrow(/String-style/)
	})

	it("flare({ codegen: { fsVirtualPaths: true } }) warns on leftover string-style and still generates", async () => {
		const root = copyConsumer(join(REPO_ROOT, "e2e/apps/fs-routes"))
		copies.push(root)
		writeFile(
			root,
			"src/routes/orphan.tsx",
			`import { createPage } from "flare/page"\nexport const route = createPage("_root_/orphan")\n`,
		)

		const prev = process.cwd()
		const warns: string[] = []
		const orig = console.warn
		console.warn = (...args: unknown[]) => {
			warns.push(args.map(String).join(" "))
		}
		process.chdir(root)
		try {
			const { flare } = await import("flare/plugins")
			const plugins = flare({ codegen: { fsVirtualPaths: true } })
			const gen = plugins.find((p) => p.name === "flare:generate")
			if (!gen?.buildStart) throw new Error("flare:generate missing")
			;(gen.buildStart as (this: unknown) => void).call({
				environment: { config: { root } },
			})
		} finally {
			console.warn = orig
			process.chdir(prev)
		}

		expect(warns.some((w) => w.includes("[flare:generate]") && w.includes("orphan.tsx"))).toBe(true)
		const genFile = readFileSync(join(root, "src/_gen/routes.gen.ts"), "utf-8")
		expect(genFile).toContain('v: "/about"')
		expect(genFile).not.toContain("/orphan")
		expect(readFileSync(join(root, "src/routes/orphan.tsx"), "utf-8")).toContain(
			`createPage("_root_/orphan")`,
		)
	})

	it("flare-fs-paths (suffix convention) generates with fs on", () => {
		const root = copyConsumer(join(REPO_ROOT, "e2e/apps/fs-routes"))
		copies.push(root)
		const result = runGenerate({ fsCodegen: true, rootDir: root })
		expect(result.routes).toBeGreaterThanOrEqual(10)
		expect(result.layouts).toBeGreaterThanOrEqual(4)
		const gen = readFileSync(join(root, "src/_gen/routes.gen.ts"), "utf-8")
		expect(gen).toContain('v: "/"')
		expect(gen).toContain('v: "/about"')
		expect(gen).toContain('v: "/users/[id]"')
		expect(gen).toContain('v: "/files/[...path]"')
		expect(gen).toContain('v: "/blog"')
		expect(gen).toContain('v: "/blog/[slug]"')
		expect(gen).toContain('v: "/deep-cache"')
		expect(gen).toContain('v: "/deep-cache/uncached"')
		expect(gen).toContain('v: "/sitemap.xml"')
		expect(gen).toContain('v: "/_internal"')
		expect(gen).toContain('v: "/dashboard"')
		expect(gen).toContain('x: "_admin_/dashboard"')
		expect(gen).toContain('x: "[locale]/_root_/"')
		expect(gen).toContain('"_root_/(blog)"')
		expect(gen).toContain('"_root_/(dc)/(inner)/(leaf)"')
		expect(readFileSync(join(root, "src/routes/_root_/about/about.page.tsx"), "utf-8")).toContain(
			`createPage("_root_/about")`,
		)
	})
})
