import { expect, it } from "vitest";
import { shapeIssues } from "./issues.ts";

it("fieldErrors is top-level", () => {
	const shaped = shapeIssues([
		{ message: "required", path: ["user", "name"] },
		{ message: "taken", path: ["user", "id"] },
		{ message: "form", path: [] },
	]);
	expect(shaped.fieldErrors.user).toEqual(["required", "taken"]);
	expect(shaped.issues[0]?.path).toEqual(["user", "name"]);
	expect(shaped.issues).toHaveLength(3);
	expect(Object.keys(shaped.fieldErrors)).toEqual(["user"]);
});
