import { parseSync } from "oxc-parser"
import { expect, it } from "vitest"
import { moduleReads } from "./reads.ts"

// Whether code after the import reads the imported `db`.
function reads(code: string): boolean {
	const program = parseSync("t.tsx", `import { db } from "./db.ts";\n${code}`, { lang: "tsx" }).program
	return moduleReads(program, () => true).has("db")
}

it("module read", () => {
	expect(reads("db();")).toBe(true)
	expect(reads("const f = () => db;")).toBe(true)
	expect(reads("<db />;")).toBe(true)
	expect(reads("const x = 1;")).toBe(false)
	expect(moduleReads(parseSync("t.ts", "db();").program, () => true)).toEqual(new Set())
})

it("scopes", () => {
	expect(reads("switch (x) { case 1: { const db = 1; db; } }")).toBe(false)
	expect(reads("switch (x) { case 1: let db = 1; db; }")).toBe(false)
	expect(reads("switch (x) { case 1: let db = 1; } db;")).toBe(true)
	expect(reads("class A { static { const db = 1; db; } }")).toBe(false)
	expect(reads("const C = class db { m() { return db; } };")).toBe(false)
	expect(reads("for (const db in o) db;")).toBe(false)
	expect(reads("for (let db = 0; db < 1; db++) {}")).toBe(false)
	expect(reads("function f() { for (var db = 0; ; ) {} return db; }")).toBe(false)
	expect(reads("function f() { { var db = 1; } return db; }")).toBe(false)
	expect(reads("function f() { enum db { A } return db.A; }")).toBe(false)
	expect(reads("function f(a = db) { return a; }")).toBe(true)
	expect(reads("function f() { class db {} return db; }")).toBe(false)
	expect(reads("export default function () { const db = 1; return db; }")).toBe(false)
	expect(reads("export default class { m() { return db; } }")).toBe(true)
	expect(reads("const g = function () { return db; };")).toBe(true)
})

it("counted", () => {
	const program = parseSync("t.ts", 'import { db } from "./db.ts";\ndb();\n').program
	expect(moduleReads(program, () => false)).toEqual(new Set())
})
