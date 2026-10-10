import { expect, it } from "vitest";
import { readParams } from "./params.ts";

it("raw param", () => {
	expect(readParams("/users/[id]", "/users/a%2Fb")).toEqual({ id: "a%2Fb" });
});
