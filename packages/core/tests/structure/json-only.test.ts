import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { expect, it } from "vitest"

// Server functions take JSON only, and a `<form>` posts through a client handler: there is no no-JS form pipeline
// (B4, D50). So no source file decodes a form body: no `formData()` read, no multipart parse, and no urlencoded body
// read. A decoder may come back only with a decision and its safe decoding (null-prototype records, `__proto__`,
// `constructor`, and `prototype` kept as data; plan 21 16.8). Sending a urlencoded body to another service, as the
// Google token request does, is not decoding one.

const SRC = join(import.meta.dirname, "../../src")

function sources(dir: string): string[] {
	return readdirSync(dir, { recursive: true, encoding: "utf8" })
		.filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path))
		.map((path) => join(dir, path))
}

// The source files that decode a form body: a `formData()` call, a multipart content type, or a urlencoded body read
// back as search params.
export function formDecoders(files: readonly { path: string; text: string }[]): string[] {
	const patterns = [/\.formData\s*\(/, /multipart\/form-data/i, /new URLSearchParams\(\s*await\s+\w+\.text\(\)/]
	return files
		.filter(({ text }) => patterns.some((pattern) => pattern.test(text.replaceAll(/\/\/.*$/gm, ""))))
		.map(({ path }) => path)
}

it("json only", () => {
	const files = sources(SRC).map((path) => ({ path: relative(SRC, path), text: readFileSync(path, "utf8") }))
	expect(formDecoders(files)).toEqual([])
	// The check catches each shape and ignores a comment that names one.
	expect(
		formDecoders([
			{ path: "a.ts", text: "const form = await request.formData()" },
			{ path: "b.ts", text: 'if (type.startsWith("multipart/form-data")) parse()' },
			{ path: "c.ts", text: "const fields = new URLSearchParams(await request.text())" },
			{ path: "d.ts", text: "// a formData() read would decode a form" },
			{ path: "e.ts", text: 'headers: { "content-type": "application/x-www-form-urlencoded" }' },
		]),
	).toEqual(["a.ts", "b.ts", "c.ts"])
})
