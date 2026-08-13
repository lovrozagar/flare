import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
	deriveVirtualPath,
	detectRouteType,
	runGenerate,
	scanSourceFilesFsCodegen,
	validateRouteDefinitions,
	writeRouteDeclaration,
} from "../../../src/generators/index.ts"

/* ── deriveVirtualPath ─────────────────────────────────────────────── */

describe("deriveVirtualPath", () => {
	it("simple page under _root_", () => {
		expect(deriveVirtualPath("routes/_root_/about/x.page.tsx", "routes")).toBe("_root_/about")
	})

	it("nested page with dynamic param", () => {
		expect(deriveVirtualPath("routes/_root_/blog/[slug]/post.page.tsx", "routes")).toBe(
			"_root_/blog/[slug]",
		)
	})

	it("layout in group", () => {
		expect(deriveVirtualPath("routes/_root_/(blog)/blog.layout.tsx", "routes")).toBe(
			"_root_/(blog)",
		)
	})

	it("root layout", () => {
		expect(deriveVirtualPath("routes/_root_/root.root-layout.tsx", "routes")).toBe("_root_")
	})

	it("deep nesting with groups", () => {
		expect(
			deriveVirtualPath("routes/_root_/(dc)/(inner)/(deep)/deep-cache/x.page.tsx", "routes"),
		).toBe("_root_/(dc)/(inner)/(deep)/deep-cache")
	})

	it("multi-root layout scope", () => {
		expect(deriveVirtualPath("routes/_admin_/dashboard/dash.page.tsx", "routes")).toBe(
			"_admin_/dashboard",
		)
	})

	it("dot segments", () => {
		expect(deriveVirtualPath("routes/_root_/sitemap.xml/x.page.tsx", "routes")).toBe(
			"_root_/sitemap.xml",
		)
	})

	it("catch-all param", () => {
		expect(deriveVirtualPath("routes/_root_/docs/[...slug]/x.page.tsx", "routes")).toBe(
			"_root_/docs/[...slug]",
		)
	})

	it("optional catch-all param", () => {
		expect(deriveVirtualPath("routes/_root_/locale/[[...locale]]/x.page.tsx", "routes")).toBe(
			"_root_/locale/[[...locale]]",
		)
	})

	it("returns null for ignored dirs (starts with _ no trailing _)", () => {
		expect(deriveVirtualPath("routes/_utils/helper.page.tsx", "routes")).toBeNull()
	})

	it("escaped underscore dir [_]utils creates literal segment", () => {
		expect(deriveVirtualPath("routes/_root_/[_]utils/x.page.tsx", "routes")).toBe("_root_/_utils")
	})

	it("escaped underscore does not trigger ignore", () => {
		expect(deriveVirtualPath("routes/_root_/[_]internal/api/x.page.tsx", "routes")).toBe(
			"_root_/_internal/api",
		)
	})

	it("layout with nested path dir", () => {
		expect(
			deriveVirtualPath("routes/_root_/(products)/products/[id]/detail.page.tsx", "routes"),
		).toBe("_root_/(products)/products/[id]")
	})

	it("page file directly under root (home page)", () => {
		expect(deriveVirtualPath("routes/_root_/home.page.tsx", "routes")).toBe("_root_")
	})

	it("index folder under root produces trailing slash", () => {
		expect(deriveVirtualPath("routes/_root_/index/index.page.tsx", "routes")).toBe("_root_/")
	})

	it("layout file derives to its directory", () => {
		expect(deriveVirtualPath("routes/_root_/(auth)/auth.layout.tsx", "routes")).toBe(
			"_root_/(auth)",
		)
	})

	it("admin root layout", () => {
		expect(deriveVirtualPath("routes/_admin_/admin.root-layout.tsx", "routes")).toBe("_admin_")
	})

	it("deep nested layout stacking", () => {
		expect(
			deriveVirtualPath(
				"routes/_root_/(deep-cache)/(dc-inner)/(dc-deep)/(dc-leaf)/leaf.layout.tsx",
				"routes",
			),
		).toBe("_root_/(deep-cache)/(dc-inner)/(dc-deep)/(dc-leaf)")
	})

	it("page under deep nested layouts", () => {
		expect(
			deriveVirtualPath(
				"routes/_root_/(deep-cache)/(dc-inner)/(dc-deep)/(dc-leaf)/deep-cache/index.page.tsx",
				"routes",
			),
		).toBe("_root_/(deep-cache)/(dc-inner)/(dc-deep)/(dc-leaf)/deep-cache")
	})
})

/* ── detectRouteType ───────────────────────────────────────────────── */

describe("detectRouteType", () => {
	it("detects page from .page.tsx", () => {
		expect(detectRouteType("x.page.tsx")).toBe("page")
	})

	it("detects layout from .layout.tsx", () => {
		expect(detectRouteType("x.layout.tsx")).toBe("layout")
	})

	it("detects root-layout from .root-layout.tsx", () => {
		expect(detectRouteType("x.root-layout.tsx")).toBe("root-layout")
	})

	it("detects page from .page.ts", () => {
		expect(detectRouteType("x.page.ts")).toBe("page")
	})

	it("detects page from .page.js", () => {
		expect(detectRouteType("x.page.js")).toBe("page")
	})

	it("detects page from .page.jsx", () => {
		expect(detectRouteType("x.page.jsx")).toBe("page")
	})

	it("returns null for helper.ts", () => {
		expect(detectRouteType("helper.ts")).toBeNull()
	})

	it("returns null for Button.tsx", () => {
		expect(detectRouteType("Button.tsx")).toBeNull()
	})

	it("returns null for random file", () => {
		expect(detectRouteType("styles.css")).toBeNull()
	})
})

/* ── scanSourceFilesFsCodegen ──────────────────────────────────────── */

describe("scanSourceFilesFsCodegen", () => {
	let tmpDir: string

	beforeEach(() => {
		tmpDir = join(tmpdir(), `flare-fs-codegen-${Date.now()}`)
		mkdirSync(tmpDir, { recursive: true })
	})

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true })
	})

	function writeFile(relPath: string, content: string) {
		const full = join(tmpDir, relPath)
		mkdirSync(join(full, ".."), { recursive: true })
		writeFileSync(full, content, "utf-8")
	}

	it("discovers page files by suffix", () => {
		writeFile(
			"src/routes/_root_/about/about.page.tsx",
			`export const route = createPage("_root_/about")\n  .render(() => <div>About</div>)`,
		)

		const defs = scanSourceFilesFsCodegen({ rootDir: tmpDir })
		expect(defs).toHaveLength(1)
		expect(defs[0]?.virtualPath).toBe("_root_/about")
		expect(defs[0]?.type).toBe("page")
	})

	it("discovers layout files by suffix", () => {
		writeFile(
			"src/routes/_root_/(blog)/blog.layout.tsx",
			`export const route = createLayout("_root_/(blog)")\n  .render((props) => <div>{props.children}</div>)`,
		)

		const defs = scanSourceFilesFsCodegen({ rootDir: tmpDir })
		expect(defs).toHaveLength(1)
		expect(defs[0]?.virtualPath).toBe("_root_/(blog)")
		expect(defs[0]?.type).toBe("layout")
	})

	it("discovers root-layout files by suffix", () => {
		writeFile(
			"src/routes/_root_/root.root-layout.tsx",
			`export const route = createRootLayout("_root_")\n  .render((props) => <html>{props.children}</html>)`,
		)

		const defs = scanSourceFilesFsCodegen({ rootDir: tmpDir })
		expect(defs).toHaveLength(1)
		expect(defs[0]?.virtualPath).toBe("_root_")
		expect(defs[0]?.type).toBe("root-layout")
	})

	it("skips _ prefixed directories", () => {
		writeFile("src/routes/_utils/helper.page.tsx", `export const route = createPage("x")`)

		const defs = scanSourceFilesFsCodegen({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})

	it("ignores non-route files", () => {
		writeFile("src/routes/_root_/about/Button.tsx", "export function Button() {}")
		writeFile("src/routes/_root_/about/utils.ts", "export function format() {}")

		const defs = scanSourceFilesFsCodegen({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})

	it("extracts chain methods (authenticate, cache, etc.)", () => {
		writeFile(
			"src/routes/_root_/dashboard/dash.page.tsx",
			`export const route = createPage("_root_/dashboard")\n  .authenticate()\n  .cache({ client: { staleTime: 30000 } })\n  .render(() => <div>Dashboard</div>)`,
		)

		const defs = scanSourceFilesFsCodegen({ rootDir: tmpDir })
		expect(defs).toHaveLength(1)
		expect(defs[0]?.authenticateMode).toBe(true)
		expect(defs[0]?.cache.client?.staleTime).toBe(30000)
	})

	it("discovers multiple route files", () => {
		writeFile(
			"src/routes/_root_/about/about.page.tsx",
			`export const route = createPage("_root_/about")`,
		)
		writeFile(
			"src/routes/_root_/(blog)/blog.layout.tsx",
			`export const route = createLayout("_root_/(blog)")`,
		)
		writeFile(
			"src/routes/_root_/(blog)/blog/[slug]/post.page.tsx",
			`export const route = createPage("_root_/(blog)/blog/[slug]")`,
		)

		const defs = scanSourceFilesFsCodegen({ rootDir: tmpDir })
		expect(defs).toHaveLength(3)

		const types = defs.map((d) => d.type).sort()
		expect(types).toEqual(["layout", "page", "page"])
	})

	it("uses exportName 'route' for all fs-codegen routes", () => {
		writeFile(
			"src/routes/_root_/about/about.page.tsx",
			`export const route = createPage("_root_/about")`,
		)

		const defs = scanSourceFilesFsCodegen({ rootDir: tmpDir })
		expect(defs[0]?.exportName).toBe("route")
	})

	it("page directly under _root_ gets trailing slash (not _root_/_root_)", () => {
		writeFile("src/routes/_root_/home.page.tsx", `export const route = createPage("_root_/")`)

		const defs = scanSourceFilesFsCodegen({ rootDir: tmpDir })
		expect(defs).toHaveLength(1)
		expect(defs[0]?.virtualPath).toBe("_root_/")
		expect(defs[0]?.type).toBe("page")
	})

	it("root-layout stays _root_ while page gets _root_/", () => {
		writeFile(
			"src/routes/_root_/root.root-layout.tsx",
			`export const route = createRootLayout("_root_")`,
		)
		writeFile("src/routes/_root_/home.page.tsx", `export const route = createPage("_root_/")`)

		const defs = scanSourceFilesFsCodegen({ rootDir: tmpDir })
		expect(defs).toHaveLength(2)

		const rootLayout = defs.find((d) => d.type === "root-layout")
		const page = defs.find((d) => d.type === "page")
		expect(rootLayout?.virtualPath).toBe("_root_")
		expect(page?.virtualPath).toBe("_root_/")
	})

	it("page under _admin_ also gets trailing slash", () => {
		writeFile("src/routes/_admin_/dash.page.tsx", `export const route = createPage("_admin_/")`)

		const defs = scanSourceFilesFsCodegen({ rootDir: tmpDir })
		expect(defs).toHaveLength(1)
		expect(defs[0]?.virtualPath).toBe("_admin_/")
	})

	it("page in subfolder does NOT get trailing slash", () => {
		writeFile(
			"src/routes/_root_/about/about.page.tsx",
			`export const route = createPage("_root_/about")`,
		)

		const defs = scanSourceFilesFsCodegen({ rootDir: tmpDir })
		expect(defs).toHaveLength(1)
		expect(defs[0]?.virtualPath).toBe("_root_/about")
	})

	it("adjacent page + root-layout + layout in _root_/ all discovered with correct types", () => {
		writeFile(
			"src/routes/_root_/root.root-layout.tsx",
			`export const route = createRootLayout("_root_")`,
		)
		writeFile("src/routes/_root_/main.layout.tsx", `export const route = createLayout("_root_")`)
		writeFile("src/routes/_root_/home.page.tsx", `export const route = createPage("_root_/")`)

		const defs = scanSourceFilesFsCodegen({ rootDir: tmpDir })
		expect(defs).toHaveLength(3)

		const rootLayout = defs.find((d) => d.type === "root-layout")
		const layout = defs.find((d) => d.type === "layout")
		const page = defs.find((d) => d.type === "page")

		expect(rootLayout?.virtualPath).toBe("_root_")
		expect(layout?.virtualPath).toBe("_root_")
		expect(page?.virtualPath).toBe("_root_/")
	})

	it("two adjacent pages in _root_/ both get _root_/ (caught by validation)", () => {
		writeFile("src/routes/_root_/index.page.tsx", `export const route = createPage("_root_/")`)
		writeFile("src/routes/_root_/home.page.tsx", `export const route = createPage("_root_/")`)

		const defs = scanSourceFilesFsCodegen({ rootDir: tmpDir })
		expect(defs).toHaveLength(2)
		expect(defs.every((d) => d.virtualPath === "_root_/")).toBe(true)
	})
})

/* ── writeRouteDeclaration ─────────────────────────────────────────── */

describe("writeRouteDeclaration", () => {
	let tmpDir: string

	beforeEach(() => {
		tmpDir = join(tmpdir(), `flare-write-decl-${Date.now()}`)
		mkdirSync(tmpDir, { recursive: true })
	})

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true })
	})

	it("writes createPage declaration into empty file", () => {
		const filePath = join(tmpDir, "about.page.tsx")
		writeFileSync(filePath, "", "utf-8")

		writeRouteDeclaration(filePath, "_root_/about", "page")
		const content = readFileSync(filePath, "utf-8")

		expect(content).toContain(`import { createPage } from "flare/page"`)
		expect(content).toContain("/* @flare-generated */")
		expect(content).toContain(`export const route = createPage("_root_/about")`)
	})

	it("writes createLayout declaration", () => {
		const filePath = join(tmpDir, "blog.layout.tsx")
		writeFileSync(filePath, "", "utf-8")

		writeRouteDeclaration(filePath, "_root_/(blog)", "layout")
		const content = readFileSync(filePath, "utf-8")

		expect(content).toContain(`import { createLayout } from "flare/layout"`)
		expect(content).toContain(`export const route = createLayout("_root_/(blog)")`)
	})

	it("writes createRootLayout declaration", () => {
		const filePath = join(tmpDir, "root.root-layout.tsx")
		writeFileSync(filePath, "", "utf-8")

		writeRouteDeclaration(filePath, "_root_", "root-layout")
		const content = readFileSync(filePath, "utf-8")

		expect(content).toContain(`import { createRootLayout } from "flare/root-layout"`)
		expect(content).toContain(`export const route = createRootLayout("_root_")`)
	})

	it("updates existing path when file is moved", () => {
		const filePath = join(tmpDir, "about.page.tsx")
		writeFileSync(
			filePath,
			[
				`import { createPage } from "flare/page"`,
				"",
				"/* @flare-generated */",
				`export const route = createPage("_root_/old-path")`,
				"  .render(() => <div>About</div>)",
			].join("\n"),
			"utf-8",
		)

		writeRouteDeclaration(filePath, "_root_/new-path", "page")
		const content = readFileSync(filePath, "utf-8")

		expect(content).toContain(`createPage("_root_/new-path")`)
		expect(content).not.toContain(`"_root_/old-path"`)
		expect(content).toContain(".render(() => <div>About</div>)")
	})

	it("preserves chain methods after declaration", () => {
		const filePath = join(tmpDir, "dash.page.tsx")
		writeFileSync(
			filePath,
			[
				`import { createPage } from "flare/page"`,
				"",
				"/* @flare-generated */",
				`export const route = createPage("_root_/dashboard")`,
				"  .authenticate()",
				"  .cache({ client: { staleTime: 30000 } })",
				"  .loader(async (ctx) => {",
				`    return { data: await fetch("/api") }`,
				"  })",
				"  .render((props) => <div>{props.loaderData.data}</div>)",
			].join("\n"),
			"utf-8",
		)

		writeRouteDeclaration(filePath, "_root_/dashboard-v2", "page")
		const content = readFileSync(filePath, "utf-8")

		expect(content).toContain(`createPage("_root_/dashboard-v2")`)
		expect(content).toContain(".authenticate()")
		expect(content).toContain(".cache({ client: { staleTime: 30000 } })")
		expect(content).toContain(".loader(async (ctx) => {")
		expect(content).toContain(".render((props) => <div>{props.loaderData.data}</div>)")
	})

	it("replaces wrong builder type when file is renamed (layout → page)", () => {
		const filePath = join(tmpDir, "about.page.tsx")
		writeFileSync(
			filePath,
			[
				`import { createLayout } from "flare/layout"`,
				"",
				"/* @flare-generated */",
				`export const route = createLayout("_root_/(old)")`,
				"  .render((props) => <div>{props.children}</div>)",
			].join("\n"),
			"utf-8",
		)

		writeRouteDeclaration(filePath, "_root_/about", "page")
		const content = readFileSync(filePath, "utf-8")

		expect(content).toContain(`import { createPage } from "flare/page"`)
		expect(content).toContain(`export const route = createPage("_root_/about")`)
		expect(content).not.toContain("createLayout")
		expect(content).toContain(".render((props) => <div>{props.children}</div>)")
	})

	it("prepends declaration to file with existing content but no builder call", () => {
		const filePath = join(tmpDir, "about.page.tsx")
		const existingContent = [
			"  .authenticate()",
			"  .loader(async (ctx) => fetchData(ctx))",
			"  .render((props) => <AboutPage data={props.loaderData} />)",
		].join("\n")
		writeFileSync(filePath, existingContent, "utf-8")

		writeRouteDeclaration(filePath, "_root_/about", "page")
		const content = readFileSync(filePath, "utf-8")

		expect(content).toContain(`import { createPage } from "flare/page"`)
		expect(content).toContain(`export const route = createPage("_root_/about")`)
		expect(content).toContain(".authenticate()")
		expect(content).toContain(".loader(async (ctx) => fetchData(ctx))")
		expect(content).toContain(".render((props) => <AboutPage data={props.loaderData} />)")
	})

	it("does not rewrite when path is unchanged", () => {
		const filePath = join(tmpDir, "about.page.tsx")
		const original = [
			`import { createPage } from "flare/page"`,
			"",
			"/* @flare-generated */",
			`export const route = createPage("_root_/about")`,
			"  .render(() => <div>About</div>)",
		].join("\n")
		writeFileSync(filePath, original, "utf-8")

		writeRouteDeclaration(filePath, "_root_/about", "page")
		const content = readFileSync(filePath, "utf-8")

		expect(content).toBe(original)
	})
})

/* ── validateRouteDefinitions ─────────────────────────────────────── */

describe("validateRouteDefinitions", () => {
	function makeDef(virtualPath: string, type: "layout" | "page" | "root-layout", filePath: string) {
		return {
			authenticateMode: false as const,
			cache: {},
			exportName: "route",
			filePath,
			hasInput: false,
			responseRoute: false,
			type,
			virtualPath,
		}
	}

	it("allows root-layout and root index page (different virtual paths)", () => {
		const errors = validateRouteDefinitions([
			makeDef("_root_", "root-layout", "src/routes/_root_/root.root-layout.tsx"),
			makeDef("_root_/", "page", "src/routes/_root_/home.page.tsx"),
		])
		expect(errors).toHaveLength(0)
	})

	it("allows layout and page at same virtual path", () => {
		const errors = validateRouteDefinitions([
			makeDef("_root_/(blog)", "layout", "src/routes/_root_/(blog)/blog.layout.tsx"),
			makeDef("_root_/(blog)", "page", "src/routes/_root_/(blog)/index.page.tsx"),
		])
		expect(errors).toHaveLength(0)
	})

	it("rejects duplicate pages at same virtual path", () => {
		const errors = validateRouteDefinitions([
			makeDef("_root_/about", "page", "src/routes/_root_/about/a.page.tsx"),
			makeDef("_root_/about", "page", "src/routes/_root_/about/b.page.tsx"),
		])
		expect(errors).toHaveLength(1)
		expect(errors[0]).toContain("Duplicate page")
		expect(errors[0]).toContain("_root_/about")
	})

	it("rejects duplicate layouts at same virtual path", () => {
		const errors = validateRouteDefinitions([
			makeDef("_root_/(blog)", "layout", "src/routes/_root_/(blog)/a.layout.tsx"),
			makeDef("_root_/(blog)", "layout", "src/routes/_root_/(blog)/b.layout.tsx"),
		])
		expect(errors).toHaveLength(1)
		expect(errors[0]).toContain("Duplicate layout")
	})

	it("rejects duplicate root-layouts at same virtual path", () => {
		const errors = validateRouteDefinitions([
			makeDef("_root_", "root-layout", "src/routes/_root_/a.root-layout.tsx"),
			makeDef("_root_", "root-layout", "src/routes/_root_/b.root-layout.tsx"),
		])
		expect(errors).toHaveLength(1)
		expect(errors[0]).toContain("Duplicate root-layout")
	})

	it("allows different route types to coexist", () => {
		const errors = validateRouteDefinitions([
			makeDef("_root_", "root-layout", "src/routes/_root_/root.root-layout.tsx"),
			makeDef("_root_/", "page", "src/routes/_root_/home.page.tsx"),
			makeDef("_root_/(auth)", "layout", "src/routes/_root_/(auth)/auth.layout.tsx"),
			makeDef("_root_/(auth)/login", "page", "src/routes/_root_/(auth)/login/login.page.tsx"),
		])
		expect(errors).toHaveLength(0)
	})

	it("reports multiple errors for multiple violations", () => {
		const errors = validateRouteDefinitions([
			makeDef("_root_/about", "page", "src/routes/_root_/about/a.page.tsx"),
			makeDef("_root_/about", "page", "src/routes/_root_/about/b.page.tsx"),
			makeDef("_root_", "root-layout", "src/routes/_root_/a.root-layout.tsx"),
			makeDef("_root_", "root-layout", "src/routes/_root_/b.root-layout.tsx"),
		])
		expect(errors).toHaveLength(2)
	})

	it("allows multiple root scopes (_root_ and _admin_)", () => {
		const errors = validateRouteDefinitions([
			makeDef("_root_", "root-layout", "src/routes/_root_/root.root-layout.tsx"),
			makeDef("_root_", "page", "src/routes/_root_/home.page.tsx"),
			makeDef("_admin_", "root-layout", "src/routes/_admin_/admin.root-layout.tsx"),
			makeDef("_admin_/dashboard", "page", "src/routes/_admin_/dashboard/dash.page.tsx"),
		])
		expect(errors).toHaveLength(0)
	})

	it("detects variable path conflict across groups", () => {
		const errors = validateRouteDefinitions([
			makeDef("_root_/(shop)/about", "page", "src/routes/_root_/(shop)/about/a.page.tsx"),
			makeDef("_root_/(blog)/about", "page", "src/routes/_root_/(blog)/about/b.page.tsx"),
		])
		expect(errors).toHaveLength(1)
		expect(errors[0]).toContain("Variable path conflict")
		expect(errors[0]).toContain("/about")
	})

	it("detects variable path conflict across root scopes", () => {
		const errors = validateRouteDefinitions([
			makeDef("_root_/settings", "page", "src/routes/_root_/settings/a.page.tsx"),
			makeDef("_admin_/settings", "page", "src/routes/_admin_/settings/b.page.tsx"),
		])
		expect(errors).toHaveLength(1)
		expect(errors[0]).toContain("Variable path conflict")
		expect(errors[0]).toContain("/settings")
	})

	it("detects catch-all shadowing specific pages", () => {
		const errors = validateRouteDefinitions([
			makeDef("_root_/docs/[...slug]", "page", "src/routes/_root_/docs/[...slug]/x.page.tsx"),
			makeDef(
				"_root_/docs/getting-started",
				"page",
				"src/routes/_root_/docs/getting-started/x.page.tsx",
			),
		])
		expect(errors).toHaveLength(1)
		expect(errors[0]).toContain("Catch-all conflict")
		expect(errors[0]).toContain("[...slug]")
	})

	it("detects optional catch-all shadowing specific pages", () => {
		const errors = validateRouteDefinitions([
			makeDef(
				"_root_/locale/[[...locale]]",
				"page",
				"src/routes/_root_/locale/[[...locale]]/x.page.tsx",
			),
			makeDef("_root_/locale/en", "page", "src/routes/_root_/locale/en/x.page.tsx"),
		])
		expect(errors).toHaveLength(1)
		expect(errors[0]).toContain("Catch-all conflict")
	})

	it("no conflict for catch-all without sibling pages", () => {
		const errors = validateRouteDefinitions([
			makeDef("_root_/docs/[...slug]", "page", "src/routes/_root_/docs/[...slug]/x.page.tsx"),
			makeDef("_root_/about", "page", "src/routes/_root_/about/x.page.tsx"),
		])
		expect(errors).toHaveLength(0)
	})
})

/* ── runGenerate skip-write optimization ───────────────────────────── */

describe("runGenerate skip-write", () => {
	let tmpDir: string

	beforeEach(() => {
		tmpDir = join(tmpdir(), `flare-skip-write-${Date.now()}`)
		mkdirSync(join(tmpDir, "src", "routes", "_root_", "about"), { recursive: true })
	})

	afterEach(() => {
		rmSync(tmpDir, { force: true, recursive: true })
	})

	it("does not rewrite routes.gen.ts when content unchanged", () => {
		writeFileSync(
			join(tmpDir, "src", "routes", "_root_", "about", "about.page.tsx"),
			`export const route = createPage("_root_/about")`,
		)

		runGenerate({ fsCodegen: true, rootDir: tmpDir })
		const genPath = join(tmpDir, "src", "_gen", "routes.gen.ts")
		const firstMtime = statSync(genPath).mtimeMs

		const start = Date.now()
		while (Date.now() - start < 50) {
			/* busy wait */
		}

		runGenerate({ fsCodegen: true, rootDir: tmpDir })
		const secondMtime = statSync(genPath).mtimeMs

		expect(secondMtime).toBe(firstMtime)
	})

	it("fsCodegen writes _root_/ for page directly under _root_", () => {
		writeFileSync(
			join(tmpDir, "src", "routes", "_root_", "about", "about.page.tsx"),
			`export const route = createPage("_root_/about")`,
		)
		mkdirSync(join(tmpDir, "src", "routes", "_root_"), { recursive: true })
		writeFileSync(join(tmpDir, "src", "routes", "_root_", "home.page.tsx"), "")

		runGenerate({ fsCodegen: true, rootDir: tmpDir })

		const content = readFileSync(join(tmpDir, "src", "routes", "_root_", "home.page.tsx"), "utf-8")
		expect(content).toContain(`createPage("_root_/")`)
		expect(content).not.toContain(`createPage("_root_/_root_")`)
	})

	it("fsCodegen rejects duplicate pages at same virtual path", () => {
		mkdirSync(join(tmpDir, "src", "routes", "_root_"), { recursive: true })
		writeFileSync(
			join(tmpDir, "src", "routes", "_root_", "a.page.tsx"),
			`export const route = createPage("_root_/")`,
		)
		writeFileSync(
			join(tmpDir, "src", "routes", "_root_", "b.page.tsx"),
			`export const route = createPage("_root_/")`,
		)

		expect(() => runGenerate({ fsCodegen: true, rootDir: tmpDir })).toThrow(/Duplicate page/)
	})

	it("fsCodegen allows root-layout + page at same folder", () => {
		mkdirSync(join(tmpDir, "src", "routes", "_root_"), { recursive: true })
		writeFileSync(
			join(tmpDir, "src", "routes", "_root_", "root.root-layout.tsx"),
			`export const route = createRootLayout("_root_")`,
		)
		writeFileSync(
			join(tmpDir, "src", "routes", "_root_", "home.page.tsx"),
			`export const route = createPage("_root_/")`,
		)

		const result = runGenerate({ fsCodegen: true, rootDir: tmpDir })
		expect(result.routes).toBeGreaterThanOrEqual(1)
	})

	it("rewrites routes.gen.ts when routes change", () => {
		writeFileSync(
			join(tmpDir, "src", "routes", "_root_", "about", "about.page.tsx"),
			`export const route = createPage("_root_/about")`,
		)

		runGenerate({ fsCodegen: true, rootDir: tmpDir })
		const genPath = join(tmpDir, "src", "_gen", "routes.gen.ts")
		const firstContent = readFileSync(genPath, "utf-8")

		mkdirSync(join(tmpDir, "src", "routes", "_root_", "contact"), { recursive: true })
		writeFileSync(
			join(tmpDir, "src", "routes", "_root_", "contact", "contact.page.tsx"),
			`export const route = createPage("_root_/contact")`,
		)

		runGenerate({ fsCodegen: true, rootDir: tmpDir })
		const secondContent = readFileSync(genPath, "utf-8")

		expect(secondContent).not.toBe(firstContent)
		expect(secondContent).toContain("contact")
	})
})
