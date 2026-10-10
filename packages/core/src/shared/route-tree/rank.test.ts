import { expect, it } from "vitest";
import { pickRoute } from "./rank.ts";

it("static wins", () => {
	expect(pickRoute(["/about", "/:id"], "/about")).toBe("/about");
});

it("dynamic wins over catch-all", () => {
	expect(pickRoute(["/:id", "/*rest"], "/x")).toBe("/:id");
});
