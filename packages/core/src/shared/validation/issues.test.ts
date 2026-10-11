import { expect, it } from "vitest";
import { shapeIssues } from "./issues.ts";

it("fieldErrors is top-level", () => {
	const issue = { message: "required", path: ["user", "name"] };
	const shaped = shapeIssues([issue]);
	expect(shaped.fieldErrors.user).toBe("required");
	expect(shaped.issues[0]?.path).toEqual(["user", "name"]);
});
