import { expect, it } from "vitest";
import type { Overlay } from "../../shared/components/index.ts";
import type { Match } from "../../shared/router/create-router.ts";
import type { StoreSnapshot } from "../router/store.ts";
import { closesOverlay, overlayFor } from "./overlay.ts";

const intercept = { from: ["_root_/"], render: "preview" };
const home = { pathname: "/", search: "", hash: "" };

function target(match: Partial<Match> = {}) {
	return {
		url: "/photos/1",
		location: { pathname: "/photos/1", search: "", hash: "" },
		match: { params: {}, chain: [], ...match },
	};
}

function snapshot(page: string, overlay?: Overlay): StoreSnapshot {
	const matches = [{ id: page, kind: "page" as const, module: {}, params: {}, search: {}, data: null }];
	return overlay === undefined
		? { matches, heads: [], location: home }
		: { matches, heads: [], location: home, overlay };
}

const open: Overlay = {
	route: "_root_/photos/[id]",
	label: "preview",
	data: "P1",
	params: { id: "1" },
	search: {},
	location: { pathname: "/photos/1", search: "", hash: "" },
	background: { ...home, params: {} },
};

it("opens from", () => {
	expect(overlayFor(target({ intercept }), snapshot("_root_/"), { trigger: "navigation" })).toBe(intercept);
	expect(overlayFor(target({ intercept }), snapshot("_root_/about"), { trigger: "navigation" })).toBeUndefined();
	expect(overlayFor(target(), snapshot("_root_/"), { trigger: "navigation" })).toBeUndefined();
});

it("revalidation", () => {
	expect(overlayFor(target({ intercept }), snapshot("_root_/", open), { trigger: "revalidation" })).toBe(intercept);
	expect(overlayFor(target({ intercept }), snapshot("_root_/"), { trigger: "revalidation" })).toBeUndefined();
});

it("pop", () => {
	const from = snapshot("_root_/");
	expect(overlayFor(target({ intercept }), from, { trigger: "navigation", pop: true, overlay: true })).toBe(intercept);
	expect(overlayFor(target({ intercept }), from, { trigger: "navigation", pop: true, overlay: false })).toBeUndefined();
});

it("closes", () => {
	expect(closesOverlay(snapshot("_root_/", open), "/")).toEqual(snapshot("_root_/"));
	expect(closesOverlay(snapshot("_root_/", open), "/elsewhere")).toBeUndefined();
	expect(closesOverlay(snapshot("_root_/"), "/")).toBeUndefined();
});
