import { beforeEach, expect, it, vi } from "vitest";
import { createHistory } from "../history/index.ts";
import { createPopstate } from "./popstate.ts";
import { createScroll } from "./scroll.ts";

beforeEach(() => {
	history.replaceState(null, "", "/");
});

function setup() {
	const flare = createHistory(history);
	flare.adopt("/");
	for (const path of ["/a", "/b", "/c", "/d"]) flare.push(path);
	const restore = vi.fn<(url: string, index: number) => Promise<void>>(async () => undefined);
	const pop = createPopstate({
		history: flare,
		restore,
		save: () => undefined,
		current: () => `${location.pathname}${location.search}${location.hash}`,
	});
	return { flare, restore, pop };
}

it("one step", async () => {
	const { restore, pop } = setup();
	history.replaceState({ index: 3 }, "", "/c");
	await pop({ index: 3 });
	expect(restore.mock.calls).toEqual([["/c", 3]]);
});

it("skipped entries", async () => {
	const { restore, pop, flare } = setup();
	history.replaceState({ index: 1 }, "", "/a");
	await pop({ index: 1 });
	expect(restore.mock.calls).toEqual([
		["/c", 3],
		["/b", 2],
		["/a", 1],
	]);
	expect(flare.index()).toBe(1);
	await pop({ other: true });
	expect(restore).toHaveBeenCalledTimes(3);
});

it("unknown entries", async () => {
	const flare = createHistory(history);
	history.replaceState({ index: 5 }, "", "/later");
	flare.adopt("/later");
	const restore = vi.fn<(url: string, index: number) => Promise<void>>(async () => undefined);
	const pop = createPopstate({ history: flare, restore, save: () => undefined, current: () => "/start" });
	await pop({ index: 2 });
	expect(restore.mock.calls).toEqual([["/start", 2]]);
});

it("save on pop", async () => {
	sessionStorage.clear();
	const flare = createHistory(history);
	flare.adopt("/");
	for (const path of ["/a", "/b", "/c"]) flare.push(path);
	let y = 400;
	const scrollTo = vi.fn<(spot: { top: number }) => void>();
	const scroll = createScroll(
		{ enabled: true, behavior: "instant", maxEntries: 50 },
		{
			history: { scrollRestoration: "auto" },
			storage: sessionStorage,
			position: () => ({ x: 0, y }),
			scrollTo,
			element: () => null,
		},
	);
	const here = { pathname: "/", search: "", hash: "" };
	const pop = createPopstate({
		history: flare,
		restore: async () => scroll.restore(flare.index(), here),
		save: (index) => scroll.save(index, here),
		current: () => `${location.pathname}${location.search}${location.hash}`,
	});
	history.replaceState({ index: 2 }, "", "/b");
	await pop({ index: 2 });
	y = 0;
	history.replaceState({ index: 3 }, "", "/c");
	await pop({ index: 3 });
	expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 400 }));
});
