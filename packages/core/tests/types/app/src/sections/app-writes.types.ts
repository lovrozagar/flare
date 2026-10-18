// dx/types.md "What the app writes", the augmented side: once the app declares `auth` and `env`,
// `createServer({ authenticate })` reads `ctx.env` as `env` and answers `auth` or `null`, sync or async, and `fetch`'s
// own `env` stays `unknown`. The omitted side is the hand-written fixture's. app.test.ts compiles this file; vitest
// never runs it (B96, plan 25 5.2).
import { createServer } from "@lovrozagar/flare/server"
import { expectTypeOf, it } from "vitest"

type Authenticate = NonNullable<Parameters<typeof createServer>[0]["authenticate"]>

const sync: Authenticate = (ctx) => {
	expectTypeOf(ctx.env).toEqualTypeOf<{ site: string }>()
	return { userId: "u" }
}
const anonymous: Authenticate = async () => null
// @ts-expect-error a session of another shape does not type-check
const wrong: Authenticate = () => ({ user: 1 })

it("what the app writes", () => {
	expectTypeOf(sync).returns.toExtend<{ userId: string } | null | Promise<{ userId: string } | null>>()
	expectTypeOf(anonymous).toExtend<Authenticate>()
	void wrong
	expectTypeOf<ReturnType<typeof createServer>["fetch"]>().parameter(1).toBeUnknown()
})
