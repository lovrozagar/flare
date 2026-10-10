import { expect, it } from "vitest";
import { assignPolicy } from "./policies.ts";

it("default policy", () => {
	expect(assignPolicy({ kind: "document" })).toBe("private, no-store");
});
