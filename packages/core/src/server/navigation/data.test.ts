import { expect, it } from "vitest";
import { dataFrames, skippedRoutes, type DataEntry } from "./data.ts";

const layout: DataEntry = { route: "_root_", id: "id=7&", layout: true, data: "root data", head: { title: "Root" } };
const page: DataEntry = {
	route: "_root_/users/[id]",
	id: "id=7&",
	layout: false,
	data: "user",
	head: { title: "User" },
};

it("all matches", () => {
	expect(skippedRoutes([layout, page], null)).toEqual(new Set());
	expect(dataFrames([layout, page], null).filter((frame) => frame.t === "l")).toEqual([
		{ t: "l", m: "_root_", d: "root data" },
		{ t: "l", m: "_root_/users/[id]", d: "user" },
	]);
});

it("page stale", () => {
	expect(skippedRoutes([layout, page], "id=7&")).toEqual(new Set(["_root_/users/[id]"]));
	expect(dataFrames([layout, page], "id=7&").filter((frame) => frame.t === "l")).toEqual([
		{ t: "l", m: "_root_", d: "root data" },
	]);
});

it("skipped head", () => {
	expect(dataFrames([layout, page], "id=7&").filter((frame) => frame.t === "h")).toEqual([
		{ t: "h", m: "_root_", d: { title: "Root" } },
	]);
	expect(dataFrames([layout, { ...page, head: undefined }], null)).toEqual([
		{ t: "l", m: "_root_", d: "root data" },
		{ t: "l", m: "_root_/users/[id]", d: "user" },
		{ t: "h", m: "_root_", d: { title: "Root" } },
	]);
});
