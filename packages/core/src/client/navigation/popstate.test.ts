import { beforeEach, expect, it, vi } from "vitest";
import { createHistory } from "../history/index.ts";
import { createPopstate } from "./popstate.ts";

beforeEach(() => {
	history.replaceState(null, "", "/");
});

function setup() {
	const flare = createHistory(history);
	flare.adopt("/");
	for (const path of ["/a", "/b", "/c", "/d"]) flare.push(path);
	const restore = vi.fn<(url: string) => Promise<void>>(async () => undefined);
	const pop = createPopstate({
		history: flare,
		restore,
		current: () => `${location.pathname}${location.search}${location.hash}`,
	});
	return { flare, restore, pop };
}

it("one step", async () => {
	const { restore, pop } = setup();
	history.replaceState({ index: 3 }, "", "/c");
	await pop({ index: 3 });
	expect(restore.mock.calls).toEqual([["/c"]]);
});

it("skipped entries", async () => {
	const { restore, pop, flare } = setup();
	history.replaceState({ index: 1 }, "", "/a");
	await pop({ index: 1 });
	expect(restore.mock.calls).toEqual([["/c"], ["/b"], ["/a"]]);
	expect(flare.index()).toBe(1);
	await pop({ other: true });
	expect(restore).toHaveBeenCalledTimes(3);
});

it("unknown entries", async () => {
	const flare = createHistory(history);
	history.replaceState({ index: 5 }, "", "/later");
	flare.adopt("/later");
	const restore = vi.fn<(url: string) => Promise<void>>(async () => undefined);
	const pop = createPopstate({ history: flare, restore, current: () => "/start" });
	await pop({ index: 2 });
	expect(restore.mock.calls).toEqual([["/start"]]);
});
