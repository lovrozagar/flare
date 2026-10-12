import { expect, it } from "vitest";
import { resolveCaller, type AuthRoute, type Caller } from "./caller.ts";

const leafRoutes: readonly AuthRoute[] = [
	{ id: "layout", auth: { mode: true, callerData: ["a"] } },
	{ id: "page", auth: { mode: "optional", callerData: ["b"] } },
];

function same(caller: Caller): Caller {
	return caller;
}

it("leaf", () => {
	const seen: Caller[] = [];
	const result = resolveCaller(leafRoutes, (caller) => seen.push(caller));
	expect(seen).toHaveLength(1);
	expect(result).toBe(1);
	expect(seen[0]?.callerData).toEqual(["b"]);
});

it("chain", () => {
	expect(resolveCaller(leafRoutes, same).callerChain).toEqual([
		{ route: "layout", args: ["a"] },
		{ route: "page", args: ["b"] },
	]);
});

it("layout only", () => {
	const result = resolveCaller([{ id: "layout", auth: { mode: true, callerData: ["admin"] } }, { id: "page" }], same);
	expect(result.callerData).toEqual([]);
	expect(result.callerChain).toEqual([{ route: "layout", args: ["admin"] }]);
});

it("leaf empty", () => {
	const result = resolveCaller([{ id: "page", auth: { mode: true, callerData: [] } }], same);
	expect(result.callerData).toEqual([]);
	expect(result.callerChain).toEqual([{ route: "page", args: [] }]);
	expect(resolveCaller([], same)).toEqual({ callerData: [], callerChain: [] });
});

it("authorize only", () => {
	const seen: Caller[] = [];
	resolveCaller([{ id: "page", authorize: () => true }], (caller) => seen.push(caller));
	expect(seen).toEqual([{ callerData: [], callerChain: [] }]);
});
