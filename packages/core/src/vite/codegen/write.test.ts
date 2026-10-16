import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { GENERATED, watchGenerated, writeGenerated } from "./write.ts"

const roots: string[] = []

afterEach(() => {
	vi.useRealTimers()
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const LAYOUT = 'export const route = createRootLayout("_root_").render(() => "root");\n'
const page = (id: string): string => `export const route = createPage(${JSON.stringify(id)}).render(() => "p");\n`
const FN =
	'import { createServerFn } from "@lovrozagar/flare/server-fn";\nexport const echo = createServerFn().handler(() => 1);\n'

function app(files: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), "flare-codegen-"))
	roots.push(root)
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true })
		writeFileSync(join(root, path), text)
	}
	return root
}

const BASE = {
	"src/routes/_root_/root.root-layout.tsx": LAYOUT,
	"src/routes/_root_/home.page.tsx": page("_root_/"),
	"src/fns/echo.ts": FN,
}

const generated = (root: string, name: string): string => readFileSync(join(root, "src/_gen", name), "utf8")

// The three files are written under src/_gen. Unchanged output is not written again: the file keeps its time.
it("unchanged", () => {
	const root = app(BASE)
	expect(writeGenerated(root)).toEqual(GENERATED.map((name) => `src/_gen/${name}`))
	expect(generated(root, "routes.gen.ts")).toContain('import("../routes/_root_/home.page.tsx")')
	expect(generated(root, "types.gen.d.ts")).toContain("FlareRegister")
	expect(generated(root, "server-fns.gen.ts")).toContain('import("../fns/echo.ts")')
	const before = statSync(join(root, "src/_gen/routes.gen.ts")).mtimeMs
	expect(writeGenerated(root)).toEqual([])
	expect(statSync(join(root, "src/_gen/routes.gen.ts")).mtimeMs).toBe(before)
})

// An empty route set removes the route and type files. The server function list stays, from its own sources.
it("empty", () => {
	const root = app(BASE)
	writeGenerated(root)
	rmSync(join(root, "src/routes"), { recursive: true })
	expect(writeGenerated(root)).toEqual(["src/_gen/routes.gen.ts", "src/_gen/types.gen.d.ts"])
	expect(existsSync(join(root, "src/_gen/routes.gen.ts"))).toBe(false)
	expect(existsSync(join(root, "src/_gen/types.gen.d.ts"))).toBe(false)
	expect(existsSync(join(root, "src/_gen/server-fns.gen.ts"))).toBe(true)
	expect(writeGenerated(root)).toEqual([])
	// Files are taken in UTF-16 code unit order, so the output does not depend on the file system's listing.
	const sorted = app({
		...BASE,
		"src/routes/_root_/b/b.page.tsx": page("_root_/b"),
		"src/routes/_root_/B/B.page.tsx": page("_root_/B"),
	})
	writeGenerated(sorted)
	const routes = generated(sorted, "routes.gen.ts")
	expect(routes.indexOf('"_root_/B"')).toBeLessThan(routes.indexOf('"_root_/b"'))
})

type Listener = (event: string, path: string) => void

// `vite dev` rewrites the files after a short debounce when a source under src changes. A failure is reported, and
// the watch goes on. A change inside src/_gen itself is not a source.
it("watch", () => {
	vi.useFakeTimers()
	const root = app(BASE)
	writeGenerated(root)
	const listeners: Listener[] = []
	const errors: string[] = []
	const infos: string[] = []
	watchGenerated(
		{
			watcher: { on: (_event: "all", listener: Listener) => void listeners.push(listener) },
			config: {
				logger: {
					error: (message: string) => void errors.push(message),
					info: (message: string) => void infos.push(message),
				},
			},
		},
		root,
	)
	const emit = (path: string): void => {
		for (const listener of listeners) listener("change", join(root, path))
	}
	// A new file with a wrong id: the dev watch writes the id its path gives, and says so (BUGS.md 130).
	mkdirSync(join(root, "src/routes/_root_/about"))
	writeFileSync(join(root, "src/routes/_root_/about/about.page.tsx"), page("_root_/new"))
	emit("src/routes/_root_/about/about.page.tsx")
	emit("src/routes/_root_/about/about.page.tsx")
	expect(generated(root, "routes.gen.ts")).not.toContain("_root_/about")
	vi.advanceTimersByTime(50)
	expect(generated(root, "routes.gen.ts")).toContain('"_root_/about"')
	expect(readFileSync(join(root, "src/routes/_root_/about/about.page.tsx"), "utf8")).toBe(page("_root_/about"))
	expect(infos).toEqual(['[flare:codegen] src/routes/_root_/about/about.page.tsx: id "_root_/new" -> "_root_/about"'])
	emit("src/_gen/routes.gen.ts")
	emit("elsewhere/file.ts")
	writeFileSync(join(root, "src/routes/_root_/other.page.tsx"), page("_root_/"))
	emit("src/routes/_root_/other.page.tsx")
	vi.advanceTimersByTime(50)
	expect(errors).toHaveLength(1)
	expect(errors[0]).toMatch(/^\[flare:codegen\] .*two pages/)
	rmSync(join(root, "src/routes/_root_/other.page.tsx"))
	emit("src/routes/_root_/other.page.tsx")
	vi.advanceTimersByTime(50)
	expect(errors).toHaveLength(1)
})

const LAYOUT_AT = (id: string): string =>
	`export const route = createLayout(${JSON.stringify(id)}).render((p) => p.children);\n`

// Dev writes each route file's id string to its path's id: a wrongly named page, and a layout moved from `(old)` to
// `(blog)`, each with one log line naming the file and old to new. A second pass writes and logs nothing. Without the
// option, the same tree fails the build check and no source changes.
it("fix ids", () => {
	const files = {
		...BASE,
		"src/routes/_root_/about/about.page.tsx": page("_root_/abut"),
		"src/routes/_root_/(blog)/blog.layout.tsx": LAYOUT_AT("_root_/(old)"),
	}
	const checked = app(files)
	expect(() => writeGenerated(checked)).toThrow('the id string "_root_/abut" is not "_root_/about"')
	expect(readFileSync(join(checked, "src/routes/_root_/about/about.page.tsx"), "utf8")).toBe(page("_root_/abut"))
	const root = app(files)
	const lines: string[] = []
	writeGenerated(root, { fixIds: true, log: (line) => lines.push(line) })
	expect(readFileSync(join(root, "src/routes/_root_/about/about.page.tsx"), "utf8")).toBe(page("_root_/about"))
	expect(readFileSync(join(root, "src/routes/_root_/(blog)/blog.layout.tsx"), "utf8")).toBe(LAYOUT_AT("_root_/(blog)"))
	expect(generated(root, "routes.gen.ts")).toContain('"_root_/about"')
	expect(lines).toEqual([
		'[flare:codegen] src/routes/_root_/(blog)/blog.layout.tsx: id "_root_/(old)" -> "_root_/(blog)"',
		'[flare:codegen] src/routes/_root_/about/about.page.tsx: id "_root_/abut" -> "_root_/about"',
	])
	writeGenerated(root, { fixIds: true, log: (line) => lines.push(line) })
	expect(lines).toHaveLength(2)
})

// A file saved between the read and the write (an editor's save) keeps what was saved; the next pass fixes it.
it("fix ids save race", () => {
	const root = app({
		...BASE,
		"src/routes/_root_/a/a.page.tsx": page("x"),
		"src/routes/_root_/b/b.page.tsx": page("y"),
	})
	const b = join(root, "src/routes/_root_/b/b.page.tsx")
	const saved = `// saved\n${page("z")}`
	const lines: string[] = []
	expect(() =>
		writeGenerated(root, {
			fixIds: true,
			log: (line) => {
				lines.push(line)
				if (line.includes("/a/")) writeFileSync(b, saved)
			},
		}),
	).toThrow('the id string "z" is not "_root_/b"')
	expect(readFileSync(b, "utf8")).toBe(saved)
	expect(lines).toHaveLength(1)
	writeGenerated(root, { fixIds: true, log: (line) => lines.push(line) })
	expect(readFileSync(b, "utf8")).toBe(`// saved\n${page("_root_/b")}`)
	expect(lines[1]).toBe('[flare:codegen] src/routes/_root_/b/b.page.tsx: id "z" -> "_root_/b"')
})

// Fixing leaves alone what is not a route: a page file under an ignored folder keeps its string, and a file that does
// not parse is left for the routes to report by name.
it("fix ids skips", () => {
	const hidden = page("_root_/anything")
	const root = app({ ...BASE, "src/routes/_root_/_parts/card.page.tsx": hidden })
	writeGenerated(root, { fixIds: true })
	expect(readFileSync(join(root, "src/routes/_root_/_parts/card.page.tsx"), "utf8")).toBe(hidden)
	const broken = app({ ...BASE, "src/routes/_root_/bad/bad.page.tsx": "export const route = createPage(" })
	expect(() => writeGenerated(broken, { fixIds: true })).toThrow("_root_/bad/bad.page.tsx")
	expect(readFileSync(join(broken, "src/routes/_root_/bad/bad.page.tsx"), "utf8")).toBe(
		"export const route = createPage(",
	)
})
