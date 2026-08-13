/**
 * Flare Generated Plugin Tests
 *
 * Tests virtual module resolution and route parsing logic.
 * Covers route extraction, layout extraction, and code generation.
 */

import { describe, expect, it } from "vitest"

/* ============================================================================
 * Constants (matching plugin)
 * ============================================================================ */

const VIRTUAL_GENERATED = "virtual:flare-generated"
const RESOLVED_GENERATED = `\0${VIRTUAL_GENERATED}`
const VIRTUAL_LOADER = "virtual:flare-route-loader"
const RESOLVED_LOADER = `\0${VIRTUAL_LOADER}`

/* ============================================================================
 * Re-implemented Pure Functions for Testing
 * ============================================================================ */

/**
 * Resolve virtual module IDs
 */
function resolveId(id: string): string | null {
	if (id === VIRTUAL_GENERATED) return RESOLVED_GENERATED
	if (id === VIRTUAL_LOADER) return RESOLVED_LOADER
	return null
}

/**
 * Convert generated file path to absolute import path
 */
function absPath(root: string, genPath: string): string {
	const full = `${root}/${genPath}`
	return full.replace(/\.ts$/, "")
}

/**
 * Extract route entries from routes content
 * Pattern: exportName: "..." ... filePath: "..."
 */
function extractRouteEntries(
	routesContent: string,
): Array<{ exportName: string; filePath: string }> {
	const entries: Array<{ exportName: string; filePath: string }> = []
	const routeMatches = routesContent.matchAll(
		/exportName:\s*"([^"]+)"[\s\S]*?filePath:\s*"([^"]+)"/g,
	)

	for (const match of routeMatches) {
		const exportName = match[1]
		const filePath = match[2]
		if (exportName !== undefined && filePath !== undefined) {
			entries.push({ exportName, filePath })
		}
	}

	return entries
}

/**
 * Extract layout entries from routes content
 * Pattern: "key": () => import("path").then(m => ({ default: m.ExportName }))
 */
function extractLayoutEntries(
	routesContent: string,
): Array<{ exportName: string; importPath: string; layoutKey: string }> {
	const entries: Array<{ exportName: string; importPath: string; layoutKey: string }> = []
	const layoutMatches = routesContent.matchAll(
		/"([^"]+)":\s*\(\)\s*=>\s*import\("([^"]+)"\)\.then\(m\s*=>\s*\(\{\s*default:\s*m\.(\w+)\s*\}\)\)/g,
	)

	for (const match of layoutMatches) {
		const layoutKey = match[1]
		const importPath = match[2]
		const exportName = match[3]
		if (layoutKey !== undefined && importPath !== undefined && exportName !== undefined) {
			entries.push({ exportName, importPath, layoutKey })
		}
	}

	return entries
}

/**
 * Generate module loader entry
 */
function generateModuleEntry(srcDir: string, exportName: string, filePath: string): string {
	const modulePath = `./${filePath.replace(/\.tsx?$/, "")}`
	const importPath = `${srcDir}/${filePath.replace(/\.tsx?$/, "")}`
	return `\t"${modulePath}": () => import("${importPath}").then(m => ({ default: m.${exportName} }))`
}

/**
 * Generate layout loader entry
 */
function generateLayoutEntry(
	genDir: string,
	layoutKey: string,
	importPath: string,
	exportName: string,
): string {
	const absImportPath = `${genDir}/${importPath}`
	return `\t"${layoutKey}": () => import("${absImportPath}").then(m => ({ default: m.${exportName} }))`
}

/**
 * Generate the virtual:flare-generated module content
 */
function generateVirtualGeneratedContent(routesPath: string): string {
	return `export { routeTree, layouts, boundaries } from "${routesPath}"
`
}

/**
 * Generate fallback loader content (when routes file is not found)
 */
function generateFallbackLoaderContent(): string {
	return `
export { createComponent } from "solid-js"
export function loadModule() { return Promise.resolve(null) }
export function loadLayout() { return Promise.resolve(null) }
`
}

/* ============================================================================
 * resolveId Tests
 * ============================================================================ */

describe("resolveId", () => {
	describe("virtual:flare-generated", () => {
		it("resolves virtual:flare-generated to internal ID", () => {
			const result = resolveId("virtual:flare-generated")

			expect(result).toBe("\0virtual:flare-generated")
		})

		it("adds null byte prefix", () => {
			const result = resolveId("virtual:flare-generated")

			expect(result?.startsWith("\0")).toBe(true)
		})
	})

	describe("virtual:flare-route-loader", () => {
		it("resolves virtual:flare-route-loader to internal ID", () => {
			const result = resolveId("virtual:flare-route-loader")

			expect(result).toBe("\0virtual:flare-route-loader")
		})

		it("adds null byte prefix", () => {
			const result = resolveId("virtual:flare-route-loader")

			expect(result?.startsWith("\0")).toBe(true)
		})
	})

	describe("non-virtual modules", () => {
		it("returns null for regular imports", () => {
			expect(resolveId("./component")).toBeNull()
			expect(resolveId("solid-js")).toBeNull()
			expect(resolveId("@flare/v0")).toBeNull()
		})

		it("returns null for similar but different virtual modules", () => {
			expect(resolveId("virtual:flare")).toBeNull()
			expect(resolveId("virtual:generated")).toBeNull()
			expect(resolveId("flare-generated")).toBeNull()
		})
	})
})

/* ============================================================================
 * absPath Tests
 * ============================================================================ */

describe("absPath", () => {
	it("joins root and generated path", () => {
		const result = absPath("/project", "src/_gen/routes.ts")

		expect(result).toContain("/project")
		expect(result).toContain("src/_gen/routes")
	})

	it("removes .ts extension", () => {
		const result = absPath("/project", "src/_gen/routes.ts")

		expect(result).not.toContain(".ts")
	})

	it("preserves path without .ts extension", () => {
		const result = absPath("/project", "src/_gen/routes")

		expect(result).toBe("/project/src/_gen/routes")
	})

	it("handles nested paths", () => {
		const result = absPath("/home/user/project", "src/_gen/deep/routes.ts")

		expect(result).toBe("/home/user/project/src/_gen/deep/routes")
	})
})

/* ============================================================================
 * extractRouteEntries Tests
 * ============================================================================ */

describe("extractRouteEntries", () => {
	it("extracts single route entry", () => {
		const content = `{
			exportName: "HomePage",
			filePath: "routes/home.tsx"
		}`

		const entries = extractRouteEntries(content)

		expect(entries).toHaveLength(1)
		expect(entries[0]).toEqual({
			exportName: "HomePage",
			filePath: "routes/home.tsx",
		})
	})

	it("extracts multiple route entries", () => {
		const content = `
			{ exportName: "HomePage", filePath: "routes/home.tsx" },
			{ exportName: "AboutPage", filePath: "routes/about.tsx" },
			{ exportName: "ProductsPage", filePath: "routes/products/index.tsx" }
		`

		const entries = extractRouteEntries(content)

		expect(entries).toHaveLength(3)
		expect(entries[0]?.exportName).toBe("HomePage")
		expect(entries[1]?.exportName).toBe("AboutPage")
		expect(entries[2]?.filePath).toBe("routes/products/index.tsx")
	})

	it("handles multiline format", () => {
		const content = `{
			exportName: "HomePage",
			virtualPath: "_root_/home",
			filePath: "routes/home.tsx"
		}`

		const entries = extractRouteEntries(content)

		expect(entries).toHaveLength(1)
		expect(entries[0]?.exportName).toBe("HomePage")
		expect(entries[0]?.filePath).toBe("routes/home.tsx")
	})

	it("returns empty array for no matches", () => {
		const content = "const x = 1"

		const entries = extractRouteEntries(content)

		expect(entries).toHaveLength(0)
	})

	it("handles .ts and .tsx extensions", () => {
		const content = `
			{ exportName: "ApiRoute", filePath: "routes/api.ts" },
			{ exportName: "UiRoute", filePath: "routes/ui.tsx" }
		`

		const entries = extractRouteEntries(content)

		expect(entries[0]?.filePath).toBe("routes/api.ts")
		expect(entries[1]?.filePath).toBe("routes/ui.tsx")
	})
})

/* ============================================================================
 * extractLayoutEntries Tests
 * ============================================================================ */

describe("extractLayoutEntries", () => {
	it("extracts single layout entry", () => {
		const content = `"_root_": () => import("./layouts/root").then(m => ({ default: m.RootLayout }))`

		const entries = extractLayoutEntries(content)

		expect(entries).toHaveLength(1)
		expect(entries[0]).toEqual({
			exportName: "RootLayout",
			importPath: "./layouts/root",
			layoutKey: "_root_",
		})
	})

	it("extracts multiple layout entries", () => {
		const content = `
			"_root_": () => import("./layouts/root").then(m => ({ default: m.RootLayout })),
			"_root_/admin": () => import("./layouts/admin").then(m => ({ default: m.AdminLayout })),
			"_root_/shop": () => import("./layouts/shop").then(m => ({ default: m.ShopLayout }))
		`

		const entries = extractLayoutEntries(content)

		expect(entries).toHaveLength(3)
		expect(entries[0]?.layoutKey).toBe("_root_")
		expect(entries[1]?.layoutKey).toBe("_root_/admin")
		expect(entries[2]?.exportName).toBe("ShopLayout")
	})

	it("handles nested import paths", () => {
		const content = `"_root_/deep/nested": () => import("./deep/nested/layout").then(m => ({ default: m.NestedLayout }))`

		const entries = extractLayoutEntries(content)

		expect(entries).toHaveLength(1)
		expect(entries[0]?.importPath).toBe("./deep/nested/layout")
	})

	it("returns empty array for no matches", () => {
		const content = "const layouts = {}"

		const entries = extractLayoutEntries(content)

		expect(entries).toHaveLength(0)
	})

	it("handles whitespace variations", () => {
		const content = `"key":()=>import("./path").then(m=>({default:m.Layout}))`

		const entries = extractLayoutEntries(content)

		/* Regex handles minified format - \s* matches zero or more whitespace */
		expect(entries).toHaveLength(1)
		expect(entries[0]?.layoutKey).toBe("key")
	})
})

/* ============================================================================
 * generateModuleEntry Tests
 * ============================================================================ */

describe("generateModuleEntry", () => {
	it("generates correct module path", () => {
		const entry = generateModuleEntry("/src", "HomePage", "routes/home.tsx")

		expect(entry).toContain('"./routes/home"')
	})

	it("removes .tsx extension from module path", () => {
		const entry = generateModuleEntry("/src", "Page", "routes/page.tsx")

		expect(entry).not.toContain(".tsx")
		expect(entry).toContain("./routes/page")
	})

	it("removes .ts extension from module path", () => {
		const entry = generateModuleEntry("/src", "Api", "routes/api.ts")

		expect(entry).not.toContain('.ts"')
		expect(entry).toContain("./routes/api")
	})

	it("generates correct import path", () => {
		const entry = generateModuleEntry("/project/src", "Page", "routes/page.tsx")

		expect(entry).toContain("/project/src/routes/page")
	})

	it("uses correct export name in then callback", () => {
		const entry = generateModuleEntry("/src", "ProductsPage", "routes/products.tsx")

		expect(entry).toContain("m.ProductsPage")
	})

	it("generates valid JavaScript", () => {
		const entry = generateModuleEntry("/src", "Page", "routes/page.tsx")

		expect(entry).toContain("() => import(")
		expect(entry).toContain(").then(m => ({ default: m.")
		expect(entry).toContain(" }))")
	})
})

/* ============================================================================
 * generateLayoutEntry Tests
 * ============================================================================ */

describe("generateLayoutEntry", () => {
	it("uses layout key as object key", () => {
		const entry = generateLayoutEntry("/gen", "_root_", "./layouts/root", "RootLayout")

		expect(entry).toContain('"_root_"')
	})

	it("generates correct absolute import path", () => {
		const entry = generateLayoutEntry("/project/src/_gen", "_root_", "./layouts/root", "Layout")

		expect(entry).toContain("/project/src/_gen/./layouts/root")
	})

	it("uses correct export name", () => {
		const entry = generateLayoutEntry("/gen", "key", "./path", "AdminLayout")

		expect(entry).toContain("m.AdminLayout")
	})

	it("generates valid JavaScript", () => {
		const entry = generateLayoutEntry("/gen", "key", "./path", "Layout")

		expect(entry).toContain("() => import(")
		expect(entry).toContain(").then(m => ({ default: m.")
	})
})

/* ============================================================================
 * generateVirtualGeneratedContent Tests
 * ============================================================================ */

describe("generateVirtualGeneratedContent", () => {
	it("exports routeTree from routes path", () => {
		const content = generateVirtualGeneratedContent("/project/src/_gen/routes")

		expect(content).toContain("export { routeTree")
	})

	it("exports layouts from routes path", () => {
		const content = generateVirtualGeneratedContent("/project/src/_gen/routes")

		expect(content).toContain("layouts")
	})

	it("exports boundaries from routes path", () => {
		const content = generateVirtualGeneratedContent("/project/src/_gen/routes")

		expect(content).toContain("boundaries")
	})

	it("uses provided routes path", () => {
		const content = generateVirtualGeneratedContent("/custom/path/routes")

		expect(content).toContain('from "/custom/path/routes"')
	})
})

/* ============================================================================
 * generateFallbackLoaderContent Tests
 * ============================================================================ */

describe("generateFallbackLoaderContent", () => {
	it("exports createComponent from solid-js", () => {
		const content = generateFallbackLoaderContent()

		expect(content).toContain('export { createComponent } from "solid-js"')
	})

	it("exports loadModule function", () => {
		const content = generateFallbackLoaderContent()

		expect(content).toContain("export function loadModule()")
	})

	it("exports loadLayout function", () => {
		const content = generateFallbackLoaderContent()

		expect(content).toContain("export function loadLayout()")
	})

	it("loadModule returns Promise.resolve(null)", () => {
		const content = generateFallbackLoaderContent()

		expect(content).toContain("loadModule() { return Promise.resolve(null) }")
	})

	it("loadLayout returns Promise.resolve(null)", () => {
		const content = generateFallbackLoaderContent()

		expect(content).toContain("loadLayout() { return Promise.resolve(null) }")
	})
})

/* ============================================================================
 * Integration Tests
 * ============================================================================ */

describe("integration scenarios", () => {
	describe("full routes file parsing", () => {
		it("extracts routes and layouts from realistic content", () => {
			const routesContent = `
				export const routeTree = {
					children: [
						{
							exportName: "HomePage",
							virtualPath: "_root_",
							filePath: "routes/home.tsx"
						},
						{
							exportName: "ProductsPage",
							virtualPath: "_root_/products",
							filePath: "routes/products/index.tsx"
						}
					]
				}

				export const layouts = {
					"_root_": () => import("./layouts/root").then(m => ({ default: m.RootLayout })),
					"_root_/products": () => import("./layouts/products").then(m => ({ default: m.ProductsLayout }))
				}
			`

			const routes = extractRouteEntries(routesContent)
			const layouts = extractLayoutEntries(routesContent)

			expect(routes).toHaveLength(2)
			expect(routes[0]?.exportName).toBe("HomePage")
			expect(routes[1]?.exportName).toBe("ProductsPage")

			expect(layouts).toHaveLength(2)
			expect(layouts[0]?.layoutKey).toBe("_root_")
			expect(layouts[1]?.layoutKey).toBe("_root_/products")
		})
	})

	describe("module entry generation pipeline", () => {
		it("generates entries from extracted routes", () => {
			const routes = [
				{ exportName: "HomePage", filePath: "routes/home.tsx" },
				{ exportName: "AboutPage", filePath: "routes/about.tsx" },
			]

			const entries = routes.map((r) => generateModuleEntry("/src", r.exportName, r.filePath))

			expect(entries).toHaveLength(2)
			expect(entries[0]).toContain("./routes/home")
			expect(entries[0]).toContain("m.HomePage")
			expect(entries[1]).toContain("./routes/about")
			expect(entries[1]).toContain("m.AboutPage")
		})
	})
})
