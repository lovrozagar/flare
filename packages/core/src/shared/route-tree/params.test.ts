import { expect, it } from "vitest";
import { readParams } from "./params.ts";

it("raw param", () => {
	expect(readParams("/users/[id]", "/users/a%2Fb")).toEqual({ id: "a%2Fb" });
});

it("encoded upper", () => {
	expect(readParams("/users/[id]", "/users/%2f")).toEqual({ id: "%2F" });
});

it("missing segment", () => {
	expect(() => readParams("/(auth)/[id]", "/x")).toThrow("(auth)");
});

it("missing value", () => {
	expect(() => readParams("/users/[id]", "/users")).toThrow("[id]");
});

it("invalid percent", () => {
	expect(readParams("/users/[id]", "/users/%ZZ")).toEqual({ id: "%ZZ" });
	expect(readParams("/users/[id]", "/users/%")).toEqual({ id: "%" });
	expect(readParams("/users/[id]", "/users/%2")).toEqual({ id: "%2" });
});
