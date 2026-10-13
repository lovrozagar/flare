import { afterEach, expect, it, vi } from "vitest";
import { post, subscribe } from "./channel.ts";

const flags = vi.hoisted(() => ({ enabled: true }));

vi.mock("./enabled.ts", () => ({
	get broadcastEnabled() {
		return flags.enabled;
	},
}));

afterEach(() => {
	flags.enabled = true;
	vi.unstubAllGlobals();
});

// The messages a listener heard by the time a probe channel's own message arrives. BroadcastChannel delivers in
// posting order, so a later probe proves an earlier post was or was not delivered.
async function heard(listen: (listener: (data: unknown) => void) => () => void, send: () => void): Promise<unknown[]> {
	const received: unknown[] = [];
	const close = listen((data) => void received.push(data));
	const probe = new BroadcastChannel("flare.sync");
	const done = new Promise<void>((resolve) => {
		const tail = new BroadcastChannel("flare.sync");
		tail.onmessage = (event: MessageEvent<unknown>) => {
			if (event.data !== "probe") return;
			tail.close();
			resolve();
		};
	});
	send();
	probe.postMessage("probe");
	await done;
	probe.close();
	close();
	return received.filter((data) => data !== "probe");
}

it("posts", async () => {
	const message = { type: "theme", value: "dark" } as const;
	expect(await heard(subscribe, () => post(message))).toEqual([message]);
	// The object that sent a message does not receive it.
	const sender = new BroadcastChannel("flare.sync");
	const own: unknown[] = [];
	sender.onmessage = (event: MessageEvent<unknown>) => void own.push(event.data);
	expect(await heard(subscribe, () => sender.postMessage(message))).toEqual([message]);
	sender.close();
	expect(own).not.toContainEqual(message);
});

it("applies", async () => {
	const messages = [
		{ type: "direction", value: null },
		{ type: "locale", tag: "hr" },
	] as const;
	expect(await heard(subscribe, () => messages.forEach((message) => post(message)))).toEqual(messages);
});

it("off", async () => {
	flags.enabled = false;
	const construct = vi.fn<(name: string) => void>();
	const Real = BroadcastChannel;
	vi.stubGlobal(
		"BroadcastChannel",
		class extends Real {
			constructor(name: string) {
				super(name);
				construct(name);
			}
		},
	);
	expect(post({ type: "theme", value: "dark" })).toBeUndefined();
	const close = subscribe(() => undefined);
	expect(close).toBeTypeOf("function");
	close();
	expect(construct).not.toHaveBeenCalled();
});

it("missing", () => {
	vi.stubGlobal("BroadcastChannel", undefined);
	expect(post({ type: "locale", tag: "hr" })).toBeUndefined();
	const close = subscribe(() => undefined);
	expect(close).toBeTypeOf("function");
	expect(close()).toBeUndefined();
});

it("closes", async () => {
	const listener = vi.fn<(data: unknown) => void>();
	const close = subscribe(listener);
	close();
	expect(await heard(subscribe, () => post({ type: "theme", value: "light" }))).toEqual([
		{ type: "theme", value: "light" },
	]);
	expect(listener).not.toHaveBeenCalled();
});
