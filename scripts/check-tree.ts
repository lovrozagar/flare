import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export type TreeResult = {
	ok: boolean
	errors: string[]
	generated: string[]
}

type Row = {
	path: string
	phase: string
	kind: string
}

// P0 through P17, the bits in order (bits/17 is the last).
const PHASES = Array.from({ length: 18 }, (_, index) => `P${index}`)
const NEEDS_TEST = new Set(["src", "lint", "script"])
const SCAN_ROOTS = ["packages/core", "scripts"]
const SKIP_DIR = new Set(["node_modules", "dist", "coverage", "test-results", "playwright-report", ".wrangler"])
// Framework scripts are TypeScript. Anything else under scripts/ is agent tooling and is not in files.tsv.
const SCRIPTS_DIR = "scripts/"
const GENERATED_GLOB = "packages/core/src/features/fonts/shared/generated/*.ts"
const REGISTRY = "packages/core/src/features/fonts/registry.json"
const RE_EXPORT_FILE = /^(?:export\s+(?:type\s+)?\{[^{}]*\}\s+from\s+["'][^"']+["']\s*;?\s*)*$/

// `complete` names a phase whose every non-glob row must exist, even while it is the highest phase present. A
// bit's Done runs it for that bit's phase.
export type TreeOptions = { complete?: string }

export function checkTree(root: string, tsvPath: string, options: TreeOptions = {}): TreeResult {
	if (options.complete !== undefined && !PHASES.includes(options.complete)) {
		throw new Error(`--complete ${options.complete} is not a phase`)
	}
	const parsed = parseTsv(readFileSync(tsvPath, "utf8"))
	const generated = readGenerated(root)
	const rows = generated.length === 0 ? parsed : expandGenerated(parsed, generated)
	const errors = [
		...extraFiles(root, rows, generated.length > 0),
		...missingFiles(root, rows, options.complete),
		...badIndexes(root, rows),
		...missingSiblings(rows),
		...generatedMismatch(root, generated),
	]
	return { ok: errors.length === 0, errors, generated }
}

function parseTsv(text: string): Row[] {
	const lines = text.split("\n").filter((line) => line.trim() !== "")
	const rows: Row[] = []
	for (const line of lines.slice(1)) {
		const [path, phase, kind] = line.split("\t")
		if (path === undefined || phase === undefined || kind === undefined || path === "") continue
		rows.push({ path, phase, kind })
	}
	return rows
}

function readGenerated(root: string): string[] {
	if (!exists(join(root, REGISTRY))) return []
	const registry = JSON.parse(readFileSync(join(root, REGISTRY), "utf8")) as Record<string, unknown>
	// Sorted as filenames, the way the directory listing is: `noto-sans-jp.ts` before `noto-sans.ts`.
	return Object.keys(registry)
		.map((key) => `${key}.ts`)
		.sort()
}

function expandGenerated(rows: Row[], names: string[]): Row[] {
	const phase = rows.find((row) => row.path === GENERATED_GLOB)?.phase ?? "P14"
	const concrete = names.map((name) => ({
		path: `packages/core/src/features/fonts/shared/generated/${name}`,
		phase,
		kind: "generated",
	}))
	return [...rows.filter((row) => row.path !== GENERATED_GLOB), ...concrete]
}

function extraFiles(root: string, rows: Row[], registryPresent: boolean): string[] {
	const exact = new Set(rows.filter((row) => !row.path.includes("*")).map((row) => row.path))
	const globs = rows.filter((row) => row.path.includes("*") && !(registryPresent && row.path === GENERATED_GLOB))
	const errors: string[] = []
	for (const file of listFiles(root)) {
		if (exact.has(file)) continue
		if (globs.some((row) => matchGlob(row.path, file))) continue
		errors.push(file)
	}
	return errors
}

// Every phase below the highest one present must be complete. The highest is a bit in progress, so it is held only
// when `complete` names it, which a bit's Done and CI do.
function missingFiles(root: string, rows: Row[], complete: string | undefined): string[] {
	const concrete = rows.filter((row) => !row.path.includes("*"))
	let highest = -1
	for (let index = 0; index < PHASES.length; index += 1) {
		const phase = PHASES[index]
		if (concrete.some((row) => row.phase === phase && exists(join(root, row.path)))) highest = index
	}
	const checked = new Set(PHASES.slice(0, highest))
	if (complete !== undefined) checked.add(complete)
	const errors: string[] = []
	for (const row of concrete) {
		if (checked.has(row.phase) && !exists(join(root, row.path))) errors.push(row.path)
	}
	return errors
}

function badIndexes(root: string, rows: Row[]): string[] {
	const errors: string[] = []
	for (const row of rows) {
		if (row.kind !== "index") continue
		const full = join(root, row.path)
		if (!exists(full)) continue
		if (!isReExportOnly(readFileSync(full, "utf8"))) errors.push(row.path)
	}
	return errors
}

function missingSiblings(rows: Row[]): string[] {
	const paths = new Set(rows.map((row) => row.path))
	const errors: string[] = []
	for (const row of rows) {
		if (!NEEDS_TEST.has(row.kind)) continue
		const sibling = siblingPath(row.path)
		if (!paths.has(sibling)) errors.push(sibling)
	}
	return errors
}

function generatedMismatch(root: string, expected: string[]): string[] {
	if (expected.length === 0) return []
	const dir = join(root, "packages/core/src/features/fonts/shared/generated")
	const actual = exists(dir)
		? readdirSync(dir)
				.filter((name) => name.endsWith(".ts"))
				.sort()
		: []
	if (actual.length === expected.length && actual.every((name, index) => name === expected[index])) return []
	return [`${GENERATED_GLOB} does not match registry keys`]
}

function siblingPath(path: string): string {
	if (path.endsWith(".js")) return `${path.slice(0, -3)}.test.ts`
	if (path.endsWith(".tsx")) return `${path.slice(0, -4)}.test.tsx`
	return `${path.slice(0, -3)}.test.ts`
}

function isReExportOnly(source: string): boolean {
	const stripped = source
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\/\/.*$/gm, "")
		.trim()
	return RE_EXPORT_FILE.test(stripped)
}

function listFiles(root: string): string[] {
	const files: string[] = []
	for (const scanRoot of SCAN_ROOTS) {
		const full = join(root, scanRoot)
		if (!exists(full)) continue
		walk(full, root, files)
	}
	return files
}

function walk(dir: string, root: string, files: string[]): void {
	for (const name of readdirSync(dir)) {
		if (SKIP_DIR.has(name)) continue
		const full = join(dir, name)
		if (statSync(full).isDirectory()) {
			walk(full, root, files)
			continue
		}
		const file = relative(root, full).split(sep).join("/")
		if (isTooling(file)) continue
		files.push(file)
	}
}

function isTooling(file: string): boolean {
	return file.startsWith(SCRIPTS_DIR) && !file.endsWith(".ts")
}

// `**` crosses directories, so one row holds an e2e app tree (B94). `*` stays inside one directory.
function matchGlob(glob: string, file: string): boolean {
	const body = glob
		.split("**")
		.map((part) => part.split("*").map(escapeRegex).join("[^/]*"))
		.join(".*")
	return new RegExp(`^${body}$`).test(file)
}

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function exists(path: string): boolean {
	try {
		statSync(path)
		return true
	} catch {
		return false
	}
}

const invoked = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invoked) {
	const root = fileURLToPath(new URL("..", import.meta.url))
	const result = checkTree(root, join(root, "blueprint/files.tsv"), { complete: completeArg(process.argv) })
	if (!result.ok) {
		for (const error of result.errors) process.stderr.write(`${error}\n`)
		process.exitCode = 1
	}
}

function completeArg(argv: readonly string[]): string | undefined {
	const at = argv.indexOf("--complete")
	if (at !== -1) return argv[at + 1]
	return argv.find((arg) => arg.startsWith("--complete="))?.slice("--complete=".length)
}
