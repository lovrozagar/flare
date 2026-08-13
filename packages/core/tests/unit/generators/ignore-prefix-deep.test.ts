import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { scanSourceFiles } from "../../../src/generators/index.ts"

/* ── Test infrastructure ──────────────────────────────────────────────── */

let tmpDir: string

beforeEach(() => {
	tmpDir = join(tmpdir(), `flare-ignore-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
	mkdirSync(join(tmpDir, "src", "routes"), { recursive: true })
})

afterEach(() => {
	rmSync(tmpDir, { force: true, recursive: true })
})

function writeRoute(relPath: string, content: string) {
	const full = join(tmpDir, "src", relPath)
	mkdirSync(join(full, ".."), { recursive: true })
	writeFileSync(full, content)
}

const PAGE = (name: string, vp: string) => `export const ${name} = createPage("${vp}")`

/* ── Default prefix "_" ───────────────────────────────────────────────── */

describe("ignorePrefix: default _ prefix", () => {
	it("excludes files in directories starting with _", () => {
		writeRoute("_helpers/utils.ts", PAGE("X", "_root_/x"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})

	it("excludes files in _utils/ directory", () => {
		writeRoute("_utils/format.ts", PAGE("Format", "_root_/format"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})

	it("excludes files in _private/ directory", () => {
		writeRoute("_private/secret.ts", PAGE("Secret", "_root_/secret"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})

	it("includes files in regular directories", () => {
		writeRoute("routes/home.ts", PAGE("Home", "_root_/"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(1)
		expect(defs[0]?.exportName).toBe("Home")
	})

	it("includes files at src root", () => {
		writeRoute("routes/about.ts", PAGE("About", "_root_/about"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(1)
	})
})

/* ── Route conventions preserved ──────────────────────────────────────── */

describe("ignorePrefix: route conventions not ignored", () => {
	it("_root_ directory is NOT ignored (route convention)", () => {
		writeRoute("routes/_root_/home.ts", PAGE("Home", "_root_/"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(1)
		expect(defs[0]?.exportName).toBe("Home")
	})

	it("_app_ directory is NOT ignored (route convention)", () => {
		writeRoute("routes/_app_/providers.ts", PAGE("Providers", "_root_/providers"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(1)
	})

	it("__layout__ directory is NOT ignored (double underscore convention)", () => {
		writeRoute("routes/__layout__/shell.ts", PAGE("Shell", "_root_/shell"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(1)
	})

	it("_auth_ nested under routes is NOT ignored", () => {
		writeRoute("routes/_auth_/login.ts", PAGE("Login", "_root_/login"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(1)
	})

	it("_dashboard_ nested deep is NOT ignored", () => {
		writeRoute("routes/_root_/_dashboard_/stats.ts", PAGE("Stats", "_root_/_dashboard_/stats"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(1)
	})
})

/* ── Non-convention _ dirs ARE ignored ────────────────────────────────── */

describe("ignorePrefix: non-convention _ dirs are ignored", () => {
	it("_helpers/ is ignored (not a convention: no trailing _)", () => {
		writeRoute("routes/_helpers/format.ts", PAGE("Format", "_root_/format"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})

	it("_utils/ is ignored", () => {
		writeRoute("routes/_utils/date.ts", PAGE("Date", "_root_/date"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})

	it("_ (single underscore alone) directory is ignored", () => {
		writeRoute("routes/_/hidden.ts", PAGE("Hidden", "_root_/hidden"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})

	it("__ (double underscore alone) is ignored", () => {
		writeRoute("routes/__/hidden.ts", PAGE("Hidden", "_root_/hidden"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})
})

/* ── Nested ignored directories ───────────────────────────────────────── */

describe("ignorePrefix: nested directory behavior", () => {
	it("deeply nested ignored dir: routes/_helpers/deep/file.ts", () => {
		writeRoute("routes/_helpers/deep/file.ts", PAGE("Deep", "_root_/deep"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})

	it("ignored dir inside non-ignored: routes/blog/_drafts/post.ts", () => {
		writeRoute("routes/blog/_drafts/post.ts", PAGE("Draft", "_root_/draft"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})

	it("convention dir with ignored child: _root_/_helpers/util.ts", () => {
		writeRoute("routes/_root_/_helpers/util.ts", PAGE("Util", "_root_/util"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})

	it("file directly in routes (not in ignored dir) is included", () => {
		writeRoute("routes/page.ts", PAGE("Page", "_root_/page"))
		writeRoute("routes/_helpers/util.ts", PAGE("Util", "_root_/util"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(1)
		expect(defs[0]?.exportName).toBe("Page")
	})
})

/* ── Custom ignorePrefix ──────────────────────────────────────────────── */

describe("ignorePrefix: custom prefix", () => {
	it('ignorePrefix: "__" — only __ dirs ignored', () => {
		writeRoute("__private/secret.ts", PAGE("Secret", "_root_/secret"))
		writeRoute("routes/home.ts", PAGE("Home", "_root_/"))
		const defs = scanSourceFiles({ ignorePrefix: "__", rootDir: tmpDir })
		expect(defs).toHaveLength(1)
		expect(defs[0]?.exportName).toBe("Home")
	})

	it('ignorePrefix: "__" — single _ dir NOT ignored', () => {
		writeRoute("_helpers/util.ts", PAGE("Util", "_root_/util"))
		const defs = scanSourceFiles({ ignorePrefix: "__", rootDir: tmpDir })
		expect(defs).toHaveLength(1)
	})

	it('ignorePrefix: "~" — tilde dirs ignored', () => {
		writeRoute("~private/secret.ts", PAGE("Secret", "_root_/secret"))
		writeRoute("routes/home.ts", PAGE("Home", "_root_/"))
		const defs = scanSourceFiles({ ignorePrefix: "~", rootDir: tmpDir })
		expect(defs).toHaveLength(1)
		expect(defs[0]?.exportName).toBe("Home")
	})

	it('ignorePrefix: "." — dot dirs ignored', () => {
		writeRoute(".hidden/config.ts", PAGE("Config", "_root_/config"))
		writeRoute("routes/home.ts", PAGE("Home", "_root_/"))
		const defs = scanSourceFiles({ ignorePrefix: ".", rootDir: tmpDir })
		expect(defs).toHaveLength(1)
	})

	it('ignorePrefix: "test-" — multi-char prefix', () => {
		writeRoute("test-fixtures/mock.ts", PAGE("Mock", "_root_/mock"))
		writeRoute("routes/page.ts", PAGE("Page", "_root_/page"))
		const defs = scanSourceFiles({ ignorePrefix: "test-", rootDir: tmpDir })
		expect(defs).toHaveLength(1)
		expect(defs[0]?.exportName).toBe("Page")
	})
})

/* ── Only intermediate dirs filtered, not filenames ───────────────────── */

describe("ignorePrefix: only filters directories, not filenames", () => {
	it("file starting with _ at leaf position is NOT filtered", () => {
		writeRoute("routes/_page.ts", PAGE("Page", "_root_/page"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		/* The ignorePrefix filter checks intermediate segments (i < segments.length - 1),
		 * so filenames starting with _ are included. */
		expect(defs).toHaveLength(1)
	})

	it("file starting with _ in routes dir is included", () => {
		writeRoute("routes/_helper.ts", PAGE("Helper", "_root_/helper"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(1)
	})
})

/* ── Mixed scenarios ──────────────────────────────────────────────────── */

describe("ignorePrefix: complex mixed scenarios", () => {
	it("mix of convention, ignored, and regular dirs", () => {
		writeRoute("routes/_root_/home.ts", PAGE("Home", "_root_/"))
		writeRoute("routes/_root_/about.ts", PAGE("About", "_root_/about"))
		writeRoute("routes/_helpers/format.ts", PAGE("Format", "_root_/format"))
		writeRoute("routes/_auth_/login.ts", PAGE("Login", "_root_/login"))
		writeRoute("routes/blog/post.ts", PAGE("Post", "_root_/blog/post"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		const names = defs.map((d) => d.exportName).sort()
		/* _root_ and _auth_ are conventions (included),
		 * _helpers is not (excluded),
		 * blog is regular (included) */
		expect(names).toEqual(["About", "Home", "Login", "Post"])
	})

	it("deeply nested mix", () => {
		writeRoute("routes/_root_/blog/post.ts", PAGE("Post", "_root_/blog/post"))
		writeRoute("routes/_root_/blog/_drafts/draft.ts", PAGE("Draft", "_root_/draft"))
		writeRoute("routes/_root_/_admin_/dashboard.ts", PAGE("Dash", "_root_/dashboard"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		const names = defs.map((d) => d.exportName).sort()
		/* _root_ included (convention), _admin_ included (convention),
		 * _drafts excluded (not convention) */
		expect(names).toEqual(["Dash", "Post"])
	})
})

/* ── Built-in filters (not ignorePrefix but related) ──────────────────── */

describe("scanSourceFiles: built-in filters", () => {
	it("skips _gen/ directory regardless of prefix", () => {
		mkdirSync(join(tmpDir, "src", "_gen"), { recursive: true })
		writeFileSync(join(tmpDir, "src", "_gen", "routes.gen.ts"), PAGE("Gen", "_root_/gen"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})

	it("skips node_modules", () => {
		mkdirSync(join(tmpDir, "src", "node_modules", "pkg"), { recursive: true })
		writeFileSync(join(tmpDir, "src", "node_modules", "pkg", "index.ts"), PAGE("Pkg", "_root_/pkg"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})

	it("skips .gen.ts files", () => {
		writeRoute("routes/types.gen.ts", PAGE("Types", "_root_/types"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})

	it("skips .gen.tsx files", () => {
		writeRoute("routes/types.gen.tsx", PAGE("Types", "_root_/types"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})

	it("skips non-ts files (.js, .css, .json)", () => {
		writeRoute("routes/style.css", "body { color: red }")
		writeRoute("routes/data.json", '{"key": "value"}')
		writeRoute("routes/script.js", 'export const X = "x"')
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})

	it("nonexistent rootDir → empty array (no throw)", () => {
		const defs = scanSourceFiles({ rootDir: join(tmpDir, "nonexistent") })
		expect(defs).toEqual([])
	})
})

/* ── Route convention regex edge cases ────────────────────────────────── */

describe("ignorePrefix: route convention regex edge cases", () => {
	it("_a_ is NOT a convention (regex needs 2+ middle chars)", () => {
		writeRoute("routes/_a_/page.ts", PAGE("A", "_root_/a"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		/* ^_[^_].*[^_]_$ requires at least 2 non-underscore middle chars */
		expect(defs).toHaveLength(0)
	})

	it("_ab_ is a valid convention", () => {
		writeRoute("routes/_ab_/page.ts", PAGE("Ab", "_root_/ab"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(1)
	})

	it("__ab__ is a valid convention (double underscore)", () => {
		writeRoute("routes/__ab__/page.ts", PAGE("Ab", "_root_/ab"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(1)
	})

	it("___ is NOT a convention (three underscores, no middle non-_)", () => {
		writeRoute("routes/___/page.ts", PAGE("X", "_root_/x"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		/* ___ starts with _ but middle char is _, so regex /^_[^_].*[^_]_$/ fails */
		expect(defs).toHaveLength(0)
	})

	it("____ is NOT a convention (four underscores)", () => {
		writeRoute("routes/____/page.ts", PAGE("X", "_root_/x"))
		const defs = scanSourceFiles({ rootDir: tmpDir })
		expect(defs).toHaveLength(0)
	})
})
