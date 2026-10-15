import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "fflate"
import { parseSync } from "oxc-parser"
import { build } from "vite"

// One piece of a bundle: its gzip cost when left out (gzip of all minus gzip of all without it) and its raw length.
// Marginal costs overlap, so they do not add up to the total exactly.
export type Share = { name: string; gzip: number; raw: number }

// `minified` is what the budget measures, and `text` is the bundle it measured. The shares come from the plain build,
// whose regions mark where each module starts, measured with those markers removed.
export type Breakdown = { minified: number; text: string; plain: number; modules: Share[]; declarations: Share[] }

const encoder = new TextEncoder()
const REGION = /^\/\/#(?:region|endregion).*\n/gm

// The bundle of one import from `src`, as an app that imports only that export gets it. Every tool is the lockfile's:
// Vite's Rolldown with the full Oxc minifier, and fflate's gzip, which is the same bytes on every runtime (B35).
export async function breakdown(module: string, name: string): Promise<Breakdown> {
	const source = fileURLToPath(new URL(`../../src/${module}`, import.meta.url))
	const plain = await bundle(source, name, false)
	const stripped = plain.replace(REGION, "")
	const total = gzip(stripped)
	const marginal = (text: string, start: number, end: number): number =>
		total - gzip(text.slice(0, start) + text.slice(end))
	const modules = [...plain.matchAll(/^\/\/#region (.+)\n([\s\S]*?)^\/\/#endregion$/gm)].map((region) => {
		const body = region[2] ?? ""
		const at = stripped.indexOf(body)
		return { name: moduleName(region[1] ?? ""), gzip: marginal(stripped, at, at + body.length), raw: body.length }
	})
	const program = parseSync("bundle.js", stripped, { sourceType: "module" }).program
	const declarations = program.body.map((statement) => ({
		name: declared(statement),
		gzip: marginal(stripped, statement.start, statement.end),
		raw: statement.end - statement.start,
	}))
	const text = await bundle(source, name, true)
	return { minified: gzip(text), text, plain: total, modules, declarations }
}

function gzip(text: string): number {
	return gzipSync(encoder.encode(text), { level: 9, mtime: 0 }).length
}

function row(share: Share): string {
	return `${String(share.gzip).padStart(5)} ${String(share.raw).padStart(6)}  ${share.name}`
}

// Library mode, so the entry's export is kept as an app's import would keep it. Lib `es` output skips whitespace
// minification, so Rolldown's own `minify` turns the full Oxc minifier on, as an app's production build runs it.
async function bundle(source: string, name: string, minify: boolean): Promise<string> {
	const dir = mkdtempSync(join(tmpdir(), "flare-size-"))
	try {
		const entry = join(dir, "entry.ts")
		writeFileSync(entry, `import { ${name} } from ${JSON.stringify(source)};\nexport const kept = ${name};\n`)
		const result = await build({
			configFile: false,
			logLevel: "silent",
			root: dir,
			build: {
				write: false,
				minify: minify ? "oxc" : false,
				lib: { entry, formats: ["es"], fileName: "entry" },
				rolldownOptions: { output: { minify } },
			},
		})
		return chunkOf(result)
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
}

// The one chunk a single-entry library build writes.
function chunkOf(result: Awaited<ReturnType<typeof build>>): string {
	const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => ("output" in item ? item.output : []))
	const chunks = outputs.flatMap((item) => (item.type === "chunk" ? [item.code] : []))
	if (chunks.length !== 1) throw new Error(`expected one chunk, got ${chunks.length}`)
	return chunks[0] ?? ""
}

// A module's path from `src/`, whatever directory the build ran from.
function moduleName(path: string): string {
	const at = path.lastIndexOf("src/")
	return at === -1 ? "entry" : path.slice(at)
}

function declared(statement: ReturnType<typeof parseSync>["program"]["body"][number]): string {
	if (statement.type === "FunctionDeclaration") return statement.id?.name ?? "function"
	if (statement.type === "VariableDeclaration") {
		return statement.declarations.map((item) => (item.id.type === "Identifier" ? item.id.name : "pattern")).join(", ")
	}
	return statement.type
}

// `node tests/size/breakdown.ts` prints the createPage breakdown. A budget raise carries this output (bit 01).
if (import.meta.main) {
	const result = await breakdown("shared/route-builder/page.ts", "createPage")
	console.log(
		`createPage: minified gzip ${result.minified}, plain gzip ${result.plain}\n\nmodules (marginal gzip, raw)`,
	)
	for (const share of result.modules) console.log(row(share))
	console.log("\ndeclarations (marginal gzip, raw)")
	for (const share of result.declarations) console.log(row(share))
}
