import { expect, it } from "vitest";
import { dataFrames, skippedRoutes, type DataMatch } from "./data.ts";

const matches: DataMatch[] = [
	{ route: "_root_", id: "id=7&", layout: true },
	{ route: "_root_/users/[id]", id: "id=7&", layout: false },
];

const run = {
	frames: [
		{ t: "l", m: "_root_", d: "root data" },
		{ t: "l", m: "_root_/users/[id]", d: "user" },
	] as const,
	heads: [{ title: "Root" }, { title: "User" }],
	contexts: [{}, {}],
};

it("all matches", () => {
	const skipped = skippedRoutes(matches, null);
	expect(skipped).toEqual(new Set());
	expect(dataFrames(run, skipped).loaded).toEqual(run.frames);
});

it("page stale", () => {
	const skipped = skippedRoutes(matches, "id=7&");
	expect(skipped).toEqual(new Set(["_root_/users/[id]"]));
	expect(dataFrames(run, skipped).loaded).toEqual([{ t: "l", m: "_root_", d: "root data" }]);
});

it("skipped head", () => {
	expect(dataFrames(run, skippedRoutes(matches, "id=7&")).heads).toEqual([
		{ t: "h", m: "_root_", d: { title: "Root" } },
	]);
	const failed = {
		frames: [run.frames[0], { t: "e", m: "_root_/users/[id]", e: new Error("x") }] as const,
		heads: [undefined],
		contexts: [{}],
	};
	expect(dataFrames(failed, new Set())).toEqual({ loaded: failed.frames, heads: [] });
});

it("preloader", () => {
	const carried = { ...run, contexts: [{}, { role: "admin" }] };
	expect(dataFrames(carried, new Set()).loaded).toEqual([run.frames[0], { ...run.frames[1], p: { role: "admin" } }]);
});
