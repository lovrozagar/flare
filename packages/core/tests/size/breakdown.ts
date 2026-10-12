import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { parseSync } from "oxc-parser";

// One piece of a bundle: its gzip cost when left out (gzip of all minus gzip of all without it) and its raw length.
// Marginal costs overlap, so they do not add up to the total exactly.
export type Share = { name: string; gzip: number; raw: number };

// `minified` is what the budget measures (`bun build --minify`, gzipped). The shares come from the plain build, whose
// per-module path comments mark where each module starts, measured with those comments removed.
export type Breakdown = { minified: number; plain: number; modules: Share[]; declarations: Share[] };

// The bundle of one import from `src`, as an app that imports only that export gets it.
export function breakdown(module: string, name: string): Breakdown {
	const source = fileURLToPath(new URL(`../../src/${module}`, import.meta.url));
	const plain = build(source, name, []);
	const stripped = plain.replace(/^\/\/ .*\n/gm, "");
	const total = gzip(stripped);
	const marginal = (text: string, start: number, end: number): number =>
		total - gzip(text.slice(0, start) + text.slice(end));
	const marks = [...plain.matchAll(/^\/\/ (.+)$/gm)];
	const modules = marks.map((mark, index) => {
		const start = mark.index + mark[0].length + 1;
		const end = index + 1 < marks.length ? marks[index + 1].index : plain.length;
		const body = plain.slice(start, end).replace(/^\/\/ .*\n/gm, "");
		const at = stripped.indexOf(body);
		return { name: moduleName(mark[1]), gzip: marginal(stripped, at, at + body.length), raw: body.length };
	});
	const program = parseSync("bundle.js", stripped, { sourceType: "module" }).program;
	const declarations = program.body.map((statement) => ({
		name: declared(statement),
		gzip: marginal(stripped, statement.start, statement.end),
		raw: statement.end - statement.start,
	}));
	return { minified: gzip(build(source, name, ["--minify"])), plain: total, modules, declarations };
}

function gzip(text: string): number {
	return gzipSync(text).length;
}

function row(share: Share): string {
	return `${String(share.gzip).padStart(5)} ${String(share.raw).padStart(6)}  ${share.name}`;
}

function build(source: string, name: string, flags: readonly string[]): string {
	const dir = mkdtempSync(join(tmpdir(), "flare-size-"));
	try {
		const entry = join(dir, "entry.ts");
		writeFileSync(entry, `import { ${name} } from ${JSON.stringify(source)};\nexport const kept = ${name};\n`);
		const built = spawnSync("bun", ["build", entry, "--outdir", dir, "--format=esm", ...flags], { encoding: "utf8" });
		if (built.status !== 0) throw new Error(`bun build failed: ${built.stderr}`);
		return readFileSync(join(dir, "entry.js"), "utf8");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

// A module's path from `src/`, whatever directory the build ran from.
function moduleName(path: string): string {
	const at = path.lastIndexOf("src/");
	return at === -1 ? "entry" : path.slice(at);
}

function declared(statement: ReturnType<typeof parseSync>["program"]["body"][number]): string {
	if (statement.type === "FunctionDeclaration") return statement.id?.name ?? "function";
	if (statement.type === "VariableDeclaration") {
		return statement.declarations.map((item) => (item.id.type === "Identifier" ? item.id.name : "pattern")).join(", ");
	}
	return statement.type;
}

// `bun tests/size/breakdown.ts` prints the createPage breakdown. A budget raise carries this output (bit 01).
if (import.meta.main) {
	const result = breakdown("shared/route-builder/page.ts", "createPage");
	console.log(
		`createPage: minified gzip ${result.minified}, plain gzip ${result.plain}\n\nmodules (marginal gzip, raw)`,
	);
	for (const share of result.modules) console.log(row(share));
	console.log("\ndeclarations (marginal gzip, raw)");
	for (const share of result.declarations) console.log(row(share));
}
