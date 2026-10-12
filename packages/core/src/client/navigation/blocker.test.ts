import { createComponent, flush } from "solid-js";
import { render } from "@solidjs/web";
import { expect, it, vi } from "vitest";
import {
	BlockerContext,
	createBlockers,
	useBlocker,
	type BlockerArgs,
	type BlockerPlace,
	type Blockers,
} from "./blocker.ts";

const place = (pathname: string): BlockerPlace => ({ pathname, search: "", hash: "", params: {} });

const navigation: BlockerArgs = { current: place("/a"), next: place("/b"), trigger: "navigation" };

function steps(pushed = 0) {
	return { write: vi.fn<() => void>(), go: vi.fn<(delta: number) => void>(), pushed };
}

it("cancel", () => {
	const blockers = createBlockers();
	blockers.register(() => false);
	const before = steps();
	expect(blockers.run(navigation, before)).toBe(false);
	expect(before.write).not.toHaveBeenCalled();
	expect(before.go).not.toHaveBeenCalled();
	const after = steps(2);
	expect(blockers.run(navigation, after)).toBe(false);
	expect(after.go).toHaveBeenCalledExactlyOnceWith(-2);
});

it("allow", () => {
	const blockers = createBlockers();
	blockers.register(() => true);
	const allowed = steps();
	expect(blockers.run(navigation, allowed)).toBe(true);
	expect(allowed.write).toHaveBeenCalledOnce();
	const open = steps();
	expect(createBlockers().run(navigation, open)).toBe(true);
	expect(open.write).toHaveBeenCalledOnce();
});

it("fields", () => {
	const blockers = createBlockers();
	const first = vi.fn<(args: BlockerArgs) => boolean>(() => false);
	const last = vi.fn<(args: BlockerArgs) => boolean>(() => true);
	blockers.register(first);
	const off = blockers.register(last);
	blockers.run(navigation, steps());
	expect(first).not.toHaveBeenCalled();
	expect(last).toHaveBeenCalledExactlyOnceWith({ current: place("/a"), next: place("/b"), trigger: "navigation" });
	off();
	blockers.run(navigation, steps());
	expect(first).toHaveBeenCalledOnce();
});

it("initial", () => {
	const blockers = createBlockers();
	const blocker = vi.fn<(args: BlockerArgs) => boolean>(() => false);
	blockers.register(blocker);
	expect(blockers.run({ ...navigation, trigger: "initial" }, steps())).toBe(true);
	const same = { current: place("/a"), next: place("/a"), trigger: "revalidation" } as const;
	expect(blockers.run(same, steps())).toBe(true);
	expect(blocker).not.toHaveBeenCalled();
	expect(blockers.run({ ...navigation, trigger: "revalidation" }, steps())).toBe(false);
});

it("beforeunload", () => {
	const blockers = createBlockers();
	const blocker = vi.fn<(args: BlockerArgs) => boolean>(() => false);
	blockers.register(blocker);
	const event = new Event("beforeunload", { cancelable: true });
	blockers.beforeUnload(event, place("/a"));
	expect(blocker).toHaveBeenCalledExactlyOnceWith({ current: place("/a"), next: place("/a"), trigger: "navigation" });
	expect(event.defaultPrevented).toBe(true);
	const allowed = createBlockers();
	allowed.register(() => true);
	const kept = new Event("beforeunload", { cancelable: true });
	allowed.beforeUnload(kept, place("/a"));
	expect(kept.defaultPrevented).toBe(false);
	const none = new Event("beforeunload", { cancelable: true });
	createBlockers().beforeUnload(none, place("/a"));
	expect(none.defaultPrevented).toBe(false);
});

it("popstate skips", () => {
	const blockers = createBlockers();
	const blocker = vi.fn<(args: BlockerArgs) => boolean>(() => false);
	blockers.register(blocker);
	const pop = steps();
	expect(blockers.run({ ...navigation, popstate: true }, pop)).toBe(true);
	expect(pop.write).toHaveBeenCalledOnce();
	expect(blocker).not.toHaveBeenCalled();
});

it("hook", () => {
	const blockers: Blockers = createBlockers();
	const blocker = vi.fn<(args: BlockerArgs) => boolean>(() => false);
	const dispose = render(
		() =>
			createComponent(BlockerContext, {
				value: blockers,
				get children() {
					useBlocker(blocker);
					return "";
				},
			}),
		document.createElement("div"),
	);
	flush();
	expect(blockers.run(navigation, steps())).toBe(false);
	dispose();
	expect(blockers.run(navigation, steps())).toBe(true);
});
