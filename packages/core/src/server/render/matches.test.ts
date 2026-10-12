import { expect, it } from "vitest";
import type { LoaderRun } from "../loaders/run.ts";
import { definedParams, outletMatches, stateMatches, type Rendered } from "./matches.ts";

const root = { id: "_root_", kind: "layout" as const, module: {} };
const users = { id: "_root_/users/[id]/[[tab]]", kind: "page" as const, module: {} };

function run(data: unknown[]): LoaderRun {
	const response = new Response(null);
	return { response, frames: [], data, heads: [{ title: "Root" }], contexts: [{}], bugs: [], deferred: [] };
}

const request = new Request("http://localhost/users/7?q=a");

it("outlet", () => {
	const rendered: Rendered = { chain: [root, users], run: run(["root", "user"]), params: { id: "7", tab: undefined } };
	expect(outletMatches(request, rendered)).toEqual([
		{ ...root, params: { id: "7" }, search: { q: "a" }, data: "root" },
		{ ...users, params: { id: "7" }, search: { q: "a" }, data: "user" },
	]);
	expect(outletMatches(request, { ...rendered, run: run([]) })).toEqual([]);
	expect(definedParams({ a: "1", b: undefined, c: ["x"] })).toEqual({ a: "1", c: ["x"] });
});

it("state", () => {
	const failed = { status: 500, error: new Error("x"), wire: { name: "Error", message: "x", digest: "0123456789ab" } };
	const rendered: Rendered = { chain: [root, users], run: run(["root"]), params: { id: "7" }, failed };
	const state = stateMatches(outletMatches(request, rendered), rendered);
	expect(state).toEqual([
		{
			id: "_root_",
			params: { id: "7" },
			search: { q: "a" },
			data: "root",
			preloader: {},
			head: { title: "Root" },
			error: null,
		},
		{
			id: users.id,
			params: { id: "7" },
			search: { q: "a" },
			data: null,
			preloader: null,
			head: null,
			error: failed.wire,
		},
	]);
});
