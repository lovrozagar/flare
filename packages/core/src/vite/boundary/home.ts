import { extractServerFns } from "../route-meta/index.ts"

// Codegen registers the server functions under src/ alone (src/_gen/server-fns.gen.ts), so one anywhere else would
// answer 404 on every call: under the root it gets an id no server knows, outside it none. Dev and the build fail,
// naming the file (plan 21 8.7, BUGS.md 201). `file` is root-relative, or absolute outside the root. A test run skips
// the check: a test file may define a server function no client calls.
export function assertRegistered(file: string, code: string): void {
	if (file.startsWith("src/") || !code.includes("createServerFn")) return
	const [fn] = extractServerFns(file, code)
	if (fn === undefined) return
	throw new Error(
		`${file}: ${fn.name} is a server function outside src/. Codegen registers only src/, so every call would be a 404. Move it under src/`,
	)
}
