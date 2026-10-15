import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { fontRegistry } from "./registry.ts"

// The build-time copy reads the same registry the family modules are generated from.
it("registry", () => {
	const data: Record<string, unknown> = JSON.parse(readFileSync(new URL("../registry.json", import.meta.url), "utf8"))
	expect(Object.keys(fontRegistry)).toEqual(Object.keys(data))
	expect(fontRegistry.abeezee?.files.map((file) => file.url)).toContain("/fonts/abeezee/latin-400.woff2")
})
