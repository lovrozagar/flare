import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { GENERATED, watchGenerated, writeGenerated, type CodegenFailure } from "./write.ts"

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

// A second page beside a folder's page, as at the root beside the home page or beside a nested page: dev's id fixer
// leaves its source as written, since the folder's id would make two pages share one, and the failure teaches the
// rule (BUGS.md 480).
it("two pages left alone", () => {
	const login = page("_root_/login")
	const team = page("_root_/about/team")
	const root = app({
		...BASE,
		"src/routes/_root_/login.page.tsx": login,
		"src/routes/_root_/about/about.page.tsx": page("_root_/about"),
		"src/routes/_root_/about/team.page.tsx": team,
	})
	expect(() => writeGenerated(root, { fixIds: true })).toThrow(
		"two pages: src/routes/_root_/about/team.page.tsx: a folder holds one page; move it to src/routes/_root_/about/team/team.page.tsx for /about/team",
	)
	expect(readFileSync(join(root, "src/routes/_root_/login.page.tsx"), "utf8")).toBe(login)
	expect(readFileSync(join(root, "src/routes/_root_/about/team.page.tsx"), "utf8")).toBe(team)
	rmSync(join(root, "src/routes/_root_/about/team.page.tsx"))
	expect(() => writeGenerated(root, { fixIds: true })).toThrow(
		"two pages: src/routes/_root_/login.page.tsx: a folder holds one page; move it to src/routes/_root_/login/login.page.tsx for /login",
	)
	expect(readFileSync(join(root, "src/routes/_root_/login.page.tsx"), "utf8")).toBe(login)
})

// The three files are written under src/_gen. Unchanged output is not written again: the file keeps its time.
it("unchanged", () => {
	const root = app(BASE)
	expect(writeGenerated(root)).toEqual(GENERATED.map((name) => `src/_gen/${name}`))
	expect(generated(root, "routes.gen.ts")).toContain('import("../routes/_root_/home.page.tsx")')
	expect(generated(root, "types.gen.ts")).toContain("FlareRegister")
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
	expect(writeGenerated(root)).toEqual(["src/_gen/routes.gen.ts", "src/_gen/types.gen.ts"])
	expect(existsSync(join(root, "src/_gen/routes.gen.ts"))).toBe(false)
	expect(existsSync(join(root, "src/_gen/types.gen.ts"))).toBe(false)
	expect(existsSync(join(root, "src/_gen/server-fns.gen.ts"))).toBe(true)
	expect(writeGenerated(root)).toEqual([])
	// Files are taken in UTF-16 code unit order, so the output does not depend on the file system's listing: "B" sorts
	// before "a" there and after it in a locale sort. Two names that differ only in case would be one file on a
	// case-insensitive file system (macOS), so the pair differs in letter too.
	const sorted = app({
		...BASE,
		"src/routes/_root_/a/a.page.tsx": page("_root_/a"),
		"src/routes/_root_/B/B.page.tsx": page("_root_/B"),
	})
	writeGenerated(sorted)
	const routes = generated(sorted, "routes.gen.ts")
	expect(routes.indexOf('"_root_/a"')).toBeGreaterThan(-1)
	expect(routes.indexOf('"_root_/B"')).toBeGreaterThan(-1)
	expect(routes.indexOf('"_root_/B"')).toBeLessThan(routes.indexOf('"_root_/a"'))
})

type Listener = (event: string, path: string) => void

// A dev watch over `root`, its logger, hot channel, and failure watched: `emit` hands it a change, `passes` counts the
// passes that succeeded.
function watching(root: string) {
	const listeners: Listener[] = []
	const errors: string[] = []
	const infos: string[] = []
	const sent: unknown[] = []
	let passes = 0
	const failure: CodegenFailure = { passed: () => void passes++ }
	watchGenerated(
		{
			watcher: { on: (_event: "all", listener: Listener) => void listeners.push(listener) },
			config: {
				logger: {
					error: (message: string) => void errors.push(message),
					info: (message: string) => void infos.push(message),
				},
			},
			environments: { client: { hot: { send: (payload: unknown) => void sent.push(payload) } } },
		},
		root,
		{ failure },
	)
	const emit = (path: string): void => {
		for (const listener of listeners) listener("change", join(root, path))
	}
	return { emit, errors, infos, sent, failure, passes: () => passes }
}

// `vite dev` rewrites the files after a short debounce when a source under src changes. A failure is reported, and
// the watch goes on. A change inside src/_gen itself is not a source.
it("watch", () => {
	vi.useFakeTimers()
	const root = app(BASE)
	writeGenerated(root)
	const { emit, errors, infos, sent, failure, passes } = watching(root)
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
	// The failure also opens Vite's overlay, and stays for the dev handler, so a document load shows it rather than a
	// missing route, until a pass succeeds (BUGS.md 480).
	expect(String(failure.error)).toMatch(
		/^Error: two pages: src\/routes\/_root_\/other\.page\.tsx: a folder holds one page/,
	)
	expect(sent).toEqual([{ type: "error", err: { message: String(failure.error), stack: "" } }])
	rmSync(join(root, "src/routes/_root_/other.page.tsx"))
	emit("src/routes/_root_/other.page.tsx")
	vi.advanceTimersByTime(50)
	expect([errors.length, failure.error, passes()]).toEqual([1, undefined, 2])
})

// Every pass that succeeds is told to the dev handler, which reloads each tab on its error page: a pass after a pass
// too, since one save can reach the watch as more than one event and a page can fail between two passes, and fail,
// pass, fail, pass alike. Nothing is broadcast to the tabs from the watch (BUGS.md 480.3, 503).
it("watch passes", () => {
	vi.useFakeTimers()
	const root = app(BASE)
	writeGenerated(root)
	const { emit, sent, passes } = watching(root)
	const other = "src/routes/_root_/other.page.tsx"
	const save = (write: () => void): number => {
		write()
		emit(other)
		vi.advanceTimersByTime(50)
		return passes()
	}
	const broken = (): void => writeFileSync(join(root, other), page("_root_/"))
	const fixed = (): void => rmSync(join(root, other), { force: true })
	expect([save(broken), save(fixed), save(fixed), save(broken), save(fixed)]).toEqual([0, 1, 2, 2, 3])
	expect(sent.map((payload) => Reflect.get(Object(payload), "type"))).toEqual(["error", "error"])
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
