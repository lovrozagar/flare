import { createRoot, flush } from "solid-js";
import { expect, it, vi } from "vitest";
import { createPage } from "../../shared/route-builder/page.ts";
import { createRootLayout } from "../../shared/route-builder/root-layout.ts";
import type { LoadedEntry } from "../../shared/router/create-router.ts";
import {
	createRouterStore,
	errorFromWire,
	snapshotFromState,
	type ScriptMatch,
	type StoreSnapshot,
	type WireError,
} from "./store.ts";

const root = createRootLayout("_root_")
	.render((props) => props.children)
	.notFoundRender(() => "missing");
const page = createPage("_root_/users/[id]").render(() => "user");

const chain: LoadedEntry[] = [
	{ id: "_root_", kind: "layout", module: root },
	{ id: "_root_/users/[id]", kind: "page", module: page },
];

const location = { pathname: "/users/7", search: "", hash: "" };

function entry(id: string, data: unknown, error: WireError | null = null): ScriptMatch {
	return {
		id,
		params: { id: "7" },
		search: {},
		data,
		preloader: {},
		head: data === "bare" ? null : { title: id },
		error,
	};
}

it("from script", () => {
	const snapshot = snapshotFromState({
		matches: [entry("_root_", "root"), entry("_root_/users/[id]", "user")],
		chain,
		unknown: false,
		location,
	});
	expect(snapshot.matches.map((match) => [match.id, match.kind, match.data, match.module])).toEqual([
		["_root_", "layout", "root", root],
		["_root_/users/[id]", "page", "user", page],
	]);
	expect(snapshot.heads).toEqual([{ title: "_root_" }, { title: "_root_/users/[id]" }]);
	expect(snapshot.failure).toBeUndefined();
	expect(snapshot.location).toEqual(location);
	const bare = snapshotFromState({ matches: [entry("_root_", "bare")], chain, unknown: false, location });
	expect(bare.heads).toEqual([undefined]);
});

it("failure", () => {
	const snapshot = snapshotFromState({
		matches: [
			entry("_root_", "root"),
			entry("_root_/users/[id]", null, { name: "NotFoundError", message: "Not found" }),
		],
		chain,
		unknown: false,
		location,
	});
	expect(snapshot.failure?.index).toBe(1);
	expect(snapshot.failure?.status).toBe(404);
	expect(snapshot.failure?.error).toBeInstanceOf(Error);
	expect(snapshot.failure?.error.message).toBe("Not found");
	expect(errorFromWire({ name: "UnauthenticatedError", message: "u" }).status).toBe(401);
	expect(errorFromWire({ name: "UnauthorizedError", message: "f" }).status).toBe(403);
	const dev = errorFromWire({ name: "TypeError", message: "boom", stack: "TypeError: boom\n    at x" });
	expect([dev.status, dev.error.name, dev.error.stack]).toEqual([500, "TypeError", "TypeError: boom\n    at x"]);
	const prod = errorFromWire({ message: "Something went wrong", digest: "0123456789ab" });
	expect([prod.error.name, prod.error.stack]).toEqual(["Error", ""]);
});

it("unknown", () => {
	const snapshot = snapshotFromState({
		matches: [entry("_root_", "root")],
		chain: [chain[0]],
		unknown: true,
		location,
	});
	expect(snapshot.unknown?.render?.({ params: {}, search: {} })).toBe("missing");
	expect(snapshotFromState({ matches: [], chain: [], unknown: false, location }).unknown).toBeUndefined();
});

it("commit", () => {
	const onBoundaryError = vi.fn<(error: unknown) => void>();
	const first: StoreSnapshot = snapshotFromState({
		matches: [entry("_root_", "root")],
		chain: [chain[0]],
		unknown: false,
		location,
	});
	const next: StoreSnapshot = { ...first, location: { pathname: "/next", search: "", hash: "" } };
	const store = createRoot(() => createRouterStore(first, onBoundaryError));
	expect(store.snapshot().location.pathname).toBe("/users/7");
	expect(store.outlet().matches).toBe(first.matches);
	store.commit(next);
	flush();
	expect(store.snapshot().location.pathname).toBe("/next");
	store.outlet().onBoundaryError("x");
	expect(onBoundaryError).toHaveBeenCalledWith("x");
});
