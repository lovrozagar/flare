import { appendFileSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"
import { bootCopy } from "./copy-boot.ts"

const shared = fileURLToPath(new URL("./apps/docs/src/styles.css", import.meta.url))
const vite = fileURLToPath(new URL("../../../../node_modules/.bin/vite", import.meta.url))

// A private copy boots like the app it copies, an edit of the copy leaves the shared app as it was, and closing removes
// the copy and leaves the repo's dependencies, which the copy links (B70, BUGS.md 111).
it("private copy", async () => {
	const before = readFileSync(shared, "utf8")
	const session = await bootCopy({ app: "docs", runtime: "node" })
	try {
		expect(session.appDir.startsWith(tmpdir())).toBe(true)
		const response = await fetch(`${session.origin}/hr`)
		expect(response.status).toBe(200)
		expect(await response.text()).toContain("Bok")
		appendFileSync(join(session.appDir, "src/styles.css"), "\n.copy-only { color: red; }\n")
		expect(readFileSync(shared, "utf8")).toBe(before)
	} finally {
		await session.close()
	}
	expect(existsSync(session.appDir)).toBe(false)
	expect(existsSync(vite)).toBe(true)
}, 30_000)
