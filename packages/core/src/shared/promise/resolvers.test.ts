import { expect, it } from "vitest"
import { resolvers } from "./resolvers.ts"

// Settles like Promise.withResolvers, with that static deleted, as it is below Safari 17.4 (decision B123).
it("settles", async () => {
	const native = Reflect.get(Promise, "withResolvers")
	Reflect.deleteProperty(Promise, "withResolvers")
	try {
		const kept = resolvers<number>()
		kept.resolve(1)
		await expect(kept.promise).resolves.toBe(1)
		const broken = resolvers<number>()
		broken.reject(new Error("no"))
		await expect(broken.promise).rejects.toThrow("no")
	} finally {
		Reflect.set(Promise, "withResolvers", native)
	}
})
