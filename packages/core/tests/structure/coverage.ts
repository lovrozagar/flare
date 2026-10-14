import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The integration-coverage map's reader (B96, plan 14 phase 9). Every row of every table in blueprint/dx and every `##`
// section is a feature with a stable key, and blueprint/coverage.tsv maps each key to the cases that prove it.

// Whole dx files B96 exempts: plan 15's, as dx-options.test.ts exempts them.
const EXEMPT_FILES = new Set(["README.md", "observability.md"]);

// A row's key is `<file>#<section>#<header>:<first cell>`: the nearest heading above the table, the table's first header
// cell, and the row's first cell, backticks and padding stripped. A `##` section's prose is `<file>#<section>#`. A
// table or section under a `Planned` heading is not a feature v1 ships, so it has no key.
export function dxKeys(file: string, text: string): string[] {
	const keys: string[] = [];
	let heading = "";
	let header: string | undefined;
	for (const line of text.split("\n")) {
		const title = /^(#+) (.*)$/.exec(line);
		if (title !== null) {
			heading = clean(String(title[2]));
			if (title[1] === "##" && !planned(heading)) keys.push(`${file}#${heading}#`);
		}
		if (!line.startsWith("|")) {
			header = undefined;
			continue;
		}
		const first = clean(line.split(/(?<!\\)\|/)[1] ?? "");
		if (header === undefined) header = first;
		else if (!/^:?-+:?$/.test(first) && !planned(heading)) keys.push(`${file}#${heading}#${header}:${first}`);
	}
	return keys;
}

function planned(heading: string): boolean {
	return heading.startsWith("Planned");
}

function clean(cell: string): string {
	return cell.replaceAll("`", "").replaceAll("\\|", "|").trim();
}

// A coverage row: the key, its integration cases, and its e2e cases or the reason there are none.
export type CoverageRow = { key: string; integration: string[]; e2e: string[] | { none: string } };

// `key<TAB>file::case; file::case<TAB>spec::case; …`, or exactly `n/a: <reason>` in the e2e column. A blank line and
// a line starting with `#` are skipped. Every cell is read strictly (B96): a part that is not `file::case`, an e2e `n/a`
// without a reason or beside a case, an integration `n/a`, and an empty e2e column are errors naming the line.
export function parseCoverage(text: string): { rows: CoverageRow[]; errors: string[] } {
	const rows: CoverageRow[] = [];
	const errors: string[] = [];
	for (const [index, line] of text.split("\n").entries()) {
		if (line.trim() === "" || line.startsWith("#")) continue;
		const at = `line ${index + 1}`;
		const columns = line.split("\t");
		const [key = "", integration = "", e2e = ""] = columns;
		if (columns.length !== 3 || key === "") {
			errors.push(`${at}: expected key, integration, and e2e`);
			continue;
		}
		const none = /^n\/a: (\S.*)$/.exec(e2e)?.[1];
		if (e2e.trim() === "") errors.push(`${at}: the e2e column is empty`);
		const integrationCases = cases(integration, `${at}: integration`, errors);
		const e2eCases = none === undefined ? cases(e2e, `${at}: e2e`, errors) : { none };
		rows.push({ key, integration: integrationCases, e2e: e2eCases });
	}
	return { rows, errors };
}

// A `; ` list whose every part is `file::case`. Any other part is an error, not a silent drop.
function cases(cell: string, where: string, errors: string[]): string[] {
	const parts = cell
		.split(";")
		.map((part) => part.trim())
		.filter((part) => part !== "");
	for (const part of parts) if (!/^[^\s:]+::\S/.test(part)) errors.push(`${where} part is not file::case: ${part}`);
	return parts.filter((part) => /^[^\s:]+::\S/.test(part));
}

// Whether a test file has a case with exactly this title, as `it("…")` or `test("…")`, `.skip` and `.runIf(…)` included.
export function hasCase(source: string, title: string): boolean {
	const quoted = [`"${title}"`, `'${title}'`, `\`${title}\``];
	for (const call of source.matchAll(/\b(?:it|test)(?:\.\w+(?:\([^)]*\))?)*\(\s*(["'`])/g)) {
		const start = (call.index ?? 0) + call[0].length - 1;
		if (quoted.some((text) => source.startsWith(text, start))) return true;
	}
	return false;
}

// Every key mapped once, no stale key, every row with an integration case, every named case present in its file, and
// no key twice in the dx files.
export function checkCoverage(input: {
	keys: readonly string[];
	coverage: string;
	read: (path: string) => string | undefined;
}): string[] {
	const parsed = parseCoverage(input.coverage);
	const errors = [...parsed.errors];
	const counts = new Map<string, number>();
	for (const key of input.keys) counts.set(key, (counts.get(key) ?? 0) + 1);
	for (const [key, count] of counts) if (count > 1) errors.push(`duplicate dx key ${key}`);
	const mapped = new Set<string>();
	for (const row of parsed.rows) {
		if (mapped.has(row.key)) errors.push(`mapped twice: ${row.key}`);
		mapped.add(row.key);
		if (!counts.has(row.key)) errors.push(`stale: ${row.key}`);
		errors.push(...rowErrors(row, input.read));
	}
	for (const key of counts.keys()) if (!mapped.has(key)) errors.push(`unmapped: ${key}`);
	return errors;
}

// A row's own failures: no integration case, or a named case missing from its file.
function rowErrors(row: CoverageRow, read: (path: string) => string | undefined): string[] {
	const errors = row.integration.length === 0 ? [`no integration case: ${row.key}`] : [];
	for (const named of [...row.integration, ...(Array.isArray(row.e2e) ? row.e2e : [])]) {
		const [path = "", title = ""] = named.split("::");
		const source = read(path);
		if (source === undefined) errors.push(`missing file ${path}: ${row.key}`);
		else if (!hasCase(source, title)) errors.push(`missing case ${named}: ${row.key}`);
	}
	return errors;
}

// The dx keys of a repo root, in file order.
export function repoKeys(root: string): string[] {
	const dir = join(root, "blueprint/dx");
	return readdirSync(dir)
		.filter((name) => name.endsWith(".md") && !EXEMPT_FILES.has(name))
		.toSorted()
		.flatMap((name) => dxKeys(name, readFileSync(join(dir, name), "utf8")));
}
