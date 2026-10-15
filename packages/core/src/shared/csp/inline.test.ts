import { expect, it } from "vitest"
import { scriptLiteral } from "./inline.ts"

// The escape table's rows are server/render/escape.test.ts. These cases hold the literal form.
it("literal", () => {
	const key = "a</script><!--`${x}`"
	const literal = scriptLiteral(key)
	expect(literal).not.toMatch(/[<`$]/)
	expect(Function(`return ${literal}`)()).toBe(key)
	expect(Function(`return ${scriptLiteral(["light", "dark"])}`)()).toEqual(["light", "dark"])
})
