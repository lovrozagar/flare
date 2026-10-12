import { expect, it } from "vitest";
import { extractServerFns, type FnRecord } from "./extract.ts";

const IMPORT = 'import { createServerFn } from "@lovrozagar/flare/server-fn";\n';

// The source text a method's argument covers.
function argument(source: string, record: FnRecord, method: string): string {
	const found = record.methods.find((entry) => entry.name === method);
	if (found === undefined) throw new Error(`no ${method}`);
	const [first] = found.args;
	return source.slice(first.start, first.end);
}

function one(source: string): FnRecord {
	const records = extractServerFns("src/fns/echo.ts", source);
	expect(records).toHaveLength(1);
	return records[0];
}

it("direct", () => {
	const source = `${IMPORT}export const echo = createServerFn({ method: "get" }).input(v).handler(async () => 1);\n`;
	const record = one(source);
	expect(record.name).toBe("echo");
	expect(record.methods.map((entry) => entry.name)).toEqual(["input", "handler"]);
	expect(argument(source, record, "handler")).toBe("async () => 1");
	expect(source.slice(record.config.start, record.config.end)).toBe('{ method: "get" }');
	expect(record.config.literal).toEqual({ method: "get" });
	expect(source.slice(record.start, record.end)).toBe(
		'createServerFn({ method: "get" }).input(v).handler(async () => 1)',
	);
	const bare = `${IMPORT}export const a = createServerFn().handler(f), b = createServerFn().stream(g);\nconst other = 1;\n`;
	const records = extractServerFns("x.ts", bare);
	expect(records.map((entry) => entry.name)).toEqual(["a", "b"]);
	// No argument: the insertion point is inside the empty call.
	expect(bare.slice(records[0].config.start - 1, records[0].config.end + 1)).toBe("()");
	expect(records[0].config.literal).toEqual({});
	expect(extractServerFns("x.ts", "export const a = 1;\n")).toEqual([]);
	expect(extractServerFns("x.ts", `${IMPORT}export let unset;\nexport const made = make()(h);\n`)).toEqual([]);
});

it("alias", () => {
	const source =
		'import { createServerFn as csf } from "@lovrozagar/flare/server-fn";\nexport const echo = csf().handler(h);\n';
	expect(argument(source, one(source), "handler")).toBe("h");
	const quoted =
		'import { "createServerFn" as csf } from "@lovrozagar/flare/server-fn";\nexport const echo = csf().handler(h);\n';
	expect(one(quoted).name).toBe("echo");
	// An unrelated function of the same shape is not a server function.
	expect(extractServerFns("x.ts", "export const echo = csf().handler(h);\n")).toEqual([]);
});

it("namespace", () => {
	const source =
		'import * as flare from "@lovrozagar/flare/server-fn";\nexport const echo = flare.createServerFn().handler(h);\n';
	expect(argument(source, one(source), "handler")).toBe("h");
	expect(extractServerFns("x.ts", `${source}export const other = flare.other().handler(h);\n`)).toHaveLength(1);
});

it("quote in a regex", () => {
	const source = `const quote = /"'\`/;\n${IMPORT}export const echo = createServerFn().handler(() => quote);\n`;
	expect(one(source).name).toBe("echo");
	expect(() => extractServerFns("bad.ts", "export const = ;")).toThrow(/^bad\.ts: /);
});

it("shadowed", () => {
	const cases = [
		"function make(createServerFn) { return createServerFn(); }",
		"const { createServerFn: local, ...createServerFn } = other;",
		"const [, [createServerFn = 1]] = other;",
		"try {} catch (createServerFn) {}",
		"class createServerFn {}",
		"const f = (...createServerFn) => 1;",
		"const g = function createServerFn() {};",
		"class Holder { constructor(private createServerFn: number) {} }",
	];
	for (const local of cases) {
		expect(() => extractServerFns("x.ts", `${IMPORT}${local}\n`)).toThrow(
			"x.ts: a local binding shadows createServerFn",
		);
	}
	expect(() => extractServerFns("x.ts", `${IMPORT}const keep = ({ a }, [b]) => a + b;\n`)).not.toThrow();
});

it("wrapper", () => {
	expect(() => extractServerFns("a.ts", `${IMPORT}export const base = createServerFn().authenticate();\n`)).toThrow(
		"a.ts: base must end its createServerFn chain with .handler() or .stream()",
	);
	expect(() =>
		extractServerFns("a.ts", `${IMPORT}const echo = createServerFn().handler(h);\nexport { echo };\n`),
	).toThrow("a.ts: createServerFn must be a direct export: export const name = createServerFn()…");
});

it("optional call", () => {
	expect(() => extractServerFns("a.ts", `${IMPORT}export const echo = createServerFn().handler?.(h);\n`)).toThrow(
		"a.ts: echo calls a chain method optionally. Call .handler() directly",
	);
	expect(extractServerFns("a.ts", `${IMPORT}export const other = maybe?.handler(h);\n`)).toEqual([]);
});

it("element call", () => {
	expect(() => extractServerFns("a.ts", `${IMPORT}export const echo = createServerFn()["handler"](h);\n`)).toThrow(
		"a.ts: echo calls a chain method by element access. Call each method by name",
	);
});

it("non literal config", () => {
	expect(() =>
		extractServerFns(
			"a.ts",
			`${IMPORT}export const echo = createServerFn({ method: "get" }).cache(sharedConfig).handler(h);\n`,
		),
	).toThrow("a.ts: echo .cache() takes a literal object");
	expect(() => extractServerFns("a.ts", `${IMPORT}export const echo = createServerFn(config).handler(h);\n`)).toThrow(
		"a.ts: echo createServerFn() takes a literal object",
	);
});
