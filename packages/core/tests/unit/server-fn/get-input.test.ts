import { describe, expect, it } from "vitest";
import { parseGetSearchParams, serializeGetInput } from "../../../src/server-fn/get-input.ts";

describe("serializeGetInput", () => {
	it("primitive fields stay query-string values", () => {
		expect(serializeGetInput({ q: "hello" })).toBe("q=hello");
	});

	it("nested objects JSON-encode instead of [object Object]", () => {
		const qs = serializeGetInput({ filter: { status: "open" } });
		expect(qs).not.toContain("[object Object]");
		expect(new URLSearchParams(qs).get("filter")).toBe(JSON.stringify({ status: "open" }));
	});

	it("primitive arrays use repeated keys", () => {
		const qs = serializeGetInput({ tag: ["a", "b"] });
		expect(new URLSearchParams(qs).getAll("tag")).toEqual(["a", "b"]);
	});

	it("undefined input is empty", () => {
		expect(serializeGetInput(undefined)).toBe("");
	});
});

describe("parseGetSearchParams", () => {
	it("round-trips nested objects", () => {
		const qs = serializeGetInput({ filter: { status: "open" }, q: "hello" });
		expect(parseGetSearchParams(new URLSearchParams(qs))).toEqual({
			filter: { status: "open" },
			q: "hello",
		});
	});

	it("keeps duplicate primitive keys as string arrays", () => {
		expect(parseGetSearchParams(new URLSearchParams("tag=a&tag=b"))).toEqual({ tag: ["a", "b"] });
	});

	it("leaves non-JSON braces as strings", () => {
		expect(parseGetSearchParams(new URLSearchParams("q={broken"))).toEqual({ q: "{broken" });
	});

	it("empty search → undefined", () => {
		expect(parseGetSearchParams(new URLSearchParams())).toBeUndefined();
	});
});
