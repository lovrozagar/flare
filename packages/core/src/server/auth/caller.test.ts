import { expect, it } from "vitest";
import { resolveCaller, type AuthRoute, type Caller } from "./caller.ts";

const leafRoutes: readonly AuthRoute[] = [
	{ route: "layout", authenticate: ["a"] },
	{ route: "page", authenticate: ["b"] },
];

it("leaf", () => {
	const seen: Caller[] = [];
	const result = resolveCaller(leafRoutes, (caller) => seen.push(caller));
	expect(seen).toHaveLength(1);
	expect(result.callerData).toEqual(["b"]);
	expect(seen[0]?.callerData).toEqual(["b"]);
});

it("chain", () => {
	const seen: Caller[] = [];
	resolveCaller(leafRoutes, (caller) => seen.push(caller));
	expect(seen[0]?.callerChain).toEqual([
		{ route: "layout", args: ["a"] },
		{ route: "page", args: ["b"] },
	]);
});

it("layout only", () => {
	const result = resolveCaller([{ route: "layout", authenticate: ["admin"] }, { route: "page" }], () => undefined);
	expect(result.callerData).toEqual([]);
	expect(result.callerChain).toEqual([{ route: "layout", args: ["admin"] }]);
});

it("leaf empty", () => {
	const result = resolveCaller([{ route: "page", authenticate: [] }], () => undefined);
	expect(result.callerData).toEqual([]);
	expect(result.callerChain).toEqual([{ route: "page", args: [] }]);
});

it("authorize only", () => {
	const seen: Caller[] = [];
	const result = resolveCaller([{ route: "page", authorize: true }], (caller) => seen.push(caller));
	expect(seen).toHaveLength(1);
	expect(result.callerData).toEqual([]);
	expect(result.callerChain).toEqual([]);
});
