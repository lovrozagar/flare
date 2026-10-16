import { Schema } from "effect"
import { expect, it } from "vitest"
import { checkValidator } from "./effect.ts"

// A plain Effect Schema throws, naming its owner and the fix; the same schema wrapped as a Standard Schema, a plain
// function, and `{ parse }` pass (BUGS.md 157).
it("plain effect", () => {
	const plain = Schema.Struct({ q: Schema.String })
	expect(() => checkValidator(plain, "_root_/p")).toThrow(
		"_root_/p: a plain Effect Schema is not a validator; wrap it with Schema.standardSchemaV1(schema)",
	)
	expect(() => checkValidator(Schema.standardSchemaV1(plain), "_root_/p")).not.toThrow()
	expect(() => checkValidator((value: unknown) => value, "_root_/p")).not.toThrow()
	expect(() => checkValidator({ parse: (value: unknown) => value }, "_root_/p")).not.toThrow()
})
