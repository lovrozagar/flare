// dx/types.md "Matrix", the query client absent row (case 80), through the package entry against the hand-written
// register. The register has no hasQueryClient, so a loader's ctx has no queryClient. app.test.ts compiles this file;
// vitest never runs it (B96, plan 25 5.2).
import { createPage } from "@lovrozagar/flare"
import { expectTypeOf, it } from "vitest"

it("query client absent", () => {
	void createPage("_root_/child").loader((ctx) => {
		expectTypeOf(ctx).not.toHaveProperty("queryClient")
		// @ts-expect-error the ctx has no queryClient without a query entry import
		void ctx.queryClient
		return { n: 1 }
	})
})
