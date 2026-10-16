import { expect, it } from "vitest"
import { shapeIssues } from "./issues.ts"

it("fieldErrors is top-level", () => {
	const shaped = shapeIssues([
		{ message: "required", path: ["user", "name"] },
		{ message: "taken", path: ["user", "id"] },
		{ message: "form", path: [] },
	])
	expect(shaped.fieldErrors.user).toEqual(["required", "taken"])
	expect(shaped.issues[0]?.path).toEqual(["user", "name"])
	expect(shaped.issues).toHaveLength(3)
	expect(Object.keys(shaped.fieldErrors)).toEqual(["user"])
})

// A path key named like an Object.prototype member is a field like any other: `constructor` once threw on the
// inherited function's missing `push`, so the answer was a 500, and `__proto__` would have set the prototype (plan 21
// 8.10).
it("prototype keys", () => {
	const keys = ["constructor", "__proto__", "toString", "hasOwnProperty"]
	const shaped = shapeIssues(keys.map((key) => ({ message: `bad ${key}`, path: [key] })))
	for (const key of keys)
		expect(Object.getOwnPropertyDescriptor(shaped.fieldErrors, key)?.value).toEqual([`bad ${key}`])
	expect(Object.getPrototypeOf(shaped.fieldErrors)).toBe(Object.prototype)
	expect(JSON.parse(JSON.stringify(shaped.fieldErrors))).toHaveProperty(["__proto__"])
})
