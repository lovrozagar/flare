import { describe, expect, it } from "vitest"
import { stripConsoleAndDebugger } from "../../../src/plugins/purge.ts"

describe("stripConsoleAndDebugger", () => {
	describe("console stripping", () => {
		it("strips console.log() call", () => {
			const code = 'console.log("hello")'
			expect(stripConsoleAndDebugger(code, ["log"], false)).toBe("")
		})

		it("strips console.log() with trailing semicolon", () => {
			const code = 'console.log("hello");'
			expect(stripConsoleAndDebugger(code, ["log"], false)).toBe("")
		})

		it("strips console.debug() when configured", () => {
			const code = 'console.debug("debug msg");'
			expect(stripConsoleAndDebugger(code, ["debug"], false)).toBe("")
		})

		it("preserves console.warn() when only log configured", () => {
			const code = 'console.warn("keep"); console.log("drop");'
			expect(stripConsoleAndDebugger(code, ["log"], false)).toBe('console.warn("keep"); ')
		})

		it("strips multiple methods", () => {
			const code = 'console.log("a"); console.debug("b"); console.warn("c");'
			expect(stripConsoleAndDebugger(code, ["log", "debug", "warn"], false)).toBe("")
		})

		it("handles nested parentheses in arguments", () => {
			const code = "console.log(fn(a, b(c)));"
			expect(stripConsoleAndDebugger(code, ["log"], false)).toBe("")
		})

		it("handles string arguments with parens", () => {
			const code = 'console.log("has (parens) inside");'
			expect(stripConsoleAndDebugger(code, ["log"], false)).toBe("")
		})

		it("handles template literal arguments", () => {
			const code = "console.log(`hello ${name}`);"
			expect(stripConsoleAndDebugger(code, ["log"], false)).toBe("")
		})

		it("handles multi-line console calls", () => {
			const code = 'console.log(\n  "line1",\n  "line2"\n);'
			expect(stripConsoleAndDebugger(code, ["log"], false)).toBe("")
		})

		it("does not strip when part of larger identifier", () => {
			const code = 'myconsole.log("keep");'
			expect(stripConsoleAndDebugger(code, ["log"], false)).toBe('myconsole.log("keep");')
		})

		it("strips multiple occurrences", () => {
			const code = 'console.log("a"); x(); console.log("b");'
			expect(stripConsoleAndDebugger(code, ["log"], false)).toBe("x(); ")
		})

		it("preserves surrounding code", () => {
			const code = "const x = 1;\nconsole.log(x);\nconst y = 2;"
			expect(stripConsoleAndDebugger(code, ["log"], false)).toBe("const x = 1;\nconst y = 2;")
		})

		it("handles comment inside arguments", () => {
			const code = "console.log(/* comment */ x);"
			expect(stripConsoleAndDebugger(code, ["log"], false)).toBe("")
		})

		it("handles single-quote strings with escapes", () => {
			const code = "console.log('it\\'s a test');"
			expect(stripConsoleAndDebugger(code, ["log"], false)).toBe("")
		})

		it("returns original when no console calls found", () => {
			const code = "const x = 1;"
			expect(stripConsoleAndDebugger(code, ["log"], false)).toBe("const x = 1;")
		})

		it("handles all four methods together", () => {
			const code = [
				'console.log("l");',
				'console.debug("d");',
				'console.info("i");',
				'console.warn("w");',
			].join(" ")
			expect(stripConsoleAndDebugger(code, ["log", "debug", "info", "warn"], false)).toBe("")
		})
	})

	describe("debugger stripping", () => {
		it("strips debugger statement", () => {
			const code = "debugger;"
			expect(stripConsoleAndDebugger(code, [], true)).toBe("")
		})

		it("strips debugger without semicolon", () => {
			const code = "debugger"
			expect(stripConsoleAndDebugger(code, [], true)).toBe("")
		})

		it("strips debugger within code", () => {
			const code = "const x = 1;\ndebugger;\nconst y = 2;"
			expect(stripConsoleAndDebugger(code, [], true)).toBe("const x = 1;\nconst y = 2;")
		})

		it("does not strip when debugger flag is false", () => {
			const code = "debugger;"
			expect(stripConsoleAndDebugger(code, [], false)).toBe("debugger;")
		})

		it("does not match debugger inside strings", () => {
			const code = 'const x = "debugger";'
			expect(stripConsoleAndDebugger(code, [], true)).toBe('const x = "";')
		})
	})

	describe("combined console + debugger", () => {
		it("strips both console and debugger", () => {
			const code = 'console.log("x");\ndebugger;\nconsole.debug("y");'
			expect(stripConsoleAndDebugger(code, ["log", "debug"], true)).toBe("")
		})

		it("no-op when nothing to strip", () => {
			const code = "const x = 1;"
			expect(stripConsoleAndDebugger(code, ["log"], true)).toBe("const x = 1;")
		})
	})
})
