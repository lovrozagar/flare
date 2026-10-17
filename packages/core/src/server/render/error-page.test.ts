import { expect, it } from "vitest"
import { errorPage } from "./error-page.ts"

// The built-in page of a render that failed before the shell: a bug's generic heading and digest, a named status's
// own message, escaped, and a dev bug's message and stack (plan 21 13.13, BUGS.md 215).
it("error page", () => {
	const bug = errorPage({
		status: 500,
		wire: { name: "Error", message: "Something went wrong", digest: "abc123def456" },
	})
	expect(bug).toMatch(/^<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">/)
	expect(bug).toContain("<title>500 Something went wrong</title></head><body><h1>Something went wrong</h1>")
	expect(bug).toContain("<p>Reference <code>abc123def456</code></p>")
	const missing = errorPage({ status: 404, wire: { name: "NotFoundError", message: "No <such> page" } })
	expect(missing).toContain("<title>404 No &lt;such> page</title>")
	expect(missing).not.toContain("Reference")
	const dev = errorPage({ status: 500, wire: { name: "Error", message: "boom", stack: "Error: boom\n    at x" } })
	expect(dev).toContain("<pre>boom\nError: boom\n    at x</pre>")
})
