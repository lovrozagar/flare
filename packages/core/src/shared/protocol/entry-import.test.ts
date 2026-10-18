import { expect, it } from "vitest"
import { scriptLiteral } from "../csp/index.ts"
import { BOOT_FAILED, CHUNK_MESSAGES, CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS } from "./chunk-reload.ts"
import { entryImport } from "./entry-import.ts"

// The handler's text, built from the guard's own constants, so the inline copy of the policy cannot drift from the
// client's; its behavior runs as rendered in server/render/client-script.test.ts (BUGS.md 352).
it("entry import text", () => {
	const text = entryImport("/src/client.tsx")
	expect(text.startsWith("const page = { leaving: false }")).toBe(true)
	expect(text).toContain('import("/src/client.tsx")')
	for (const part of [CHUNK_RELOAD_KEY, CHUNK_MESSAGES, BOOT_FAILED]) expect(text).toContain(scriptLiteral(part))
	expect(text).toContain(`${CHUNK_RELOAD_WINDOW_MS} > now - last.at`)
	expect(entryImport("/a<b`$.js")).not.toMatch(/[<`$]/)
})
