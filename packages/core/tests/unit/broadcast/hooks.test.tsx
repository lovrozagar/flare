import { createRoot, flush } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* We need to set up the mock BroadcastChannel BEFORE importing the module */
let channels: Map<string, Set<(e: MessageEvent) => void>>;

class MockBC {
	name: string;
	private _handler: ((e: MessageEvent) => void) | null = null;

	constructor(name: string) {
		this.name = name;
		if (!channels.has(name)) channels.set(name, new Set());
	}

	postMessage(data: unknown): void {
		const listeners = channels.get(this.name);
		if (!listeners) return;
		const event = new MessageEvent("message", { data });
		for (const handler of listeners) {
			if (handler !== this._handler) handler(event);
		}
	}

	close(): void {
		const listeners = channels.get(this.name);
		if (listeners && this._handler) listeners.delete(this._handler);
	}

	get onmessage(): ((e: MessageEvent) => void) | null {
		return this._handler;
	}

	set onmessage(handler: ((e: MessageEvent) => void) | null) {
		const listeners = channels.get(this.name);
		if (listeners && this._handler) listeners.delete(this._handler);
		this._handler = handler;
		if (listeners && handler) listeners.add(handler);
	}
}

let container: HTMLDivElement;
let dispose: (() => void) | undefined;

beforeEach(() => {
	channels = new Map();
	(globalThis as Record<string, unknown>).BroadcastChannel = MockBC;
	container = document.createElement("div");
	document.body.appendChild(container);
});

afterEach(() => {
	dispose?.();
	dispose = undefined;
	container?.remove();
	channels.clear();
	delete (globalThis as Record<string, unknown>).BroadcastChannel;
	vi.resetModules();
	vi.restoreAllMocks();
});

function tick(): Promise<void> {
	return new Promise((r) => setTimeout(r, 0));
}

describe("useBroadcast", () => {
	it("listen + emit: handler fires on matching key from other channel", async () => {
		vi.resetModules();
		const { createChannel } = await import("../../../src/broadcast/channel");
		const { BroadcastCtx } = await import("../../../src/broadcast/context");
		const { useBroadcast } = await import("../../../src/broadcast/index");

		const ch = createChannel();
		const received: unknown[] = [];

		dispose = render(
			() => (
				<BroadcastCtx value={ch}>
					{(() => {
						useBroadcast<number>("counter", (v) => received.push(v));
						return null;
					})()}
				</BroadcastCtx>
			),
			container,
		);
		await tick();

		/* Simulate message from another tab */
		const bc2 = new MockBC("flare");
		bc2.postMessage({ _f: 1, key: "counter", payload: 42, type: "custom" });

		expect(received).toEqual([42]);
		ch.close();
	});

	it("handler does NOT fire for different key", async () => {
		vi.resetModules();
		const { createChannel } = await import("../../../src/broadcast/channel");
		const { BroadcastCtx } = await import("../../../src/broadcast/context");
		const { useBroadcast } = await import("../../../src/broadcast/index");

		const ch = createChannel();
		const received: unknown[] = [];

		dispose = render(
			() => (
				<BroadcastCtx value={ch}>
					{(() => {
						useBroadcast<number>("counter", (v) => received.push(v));
						return null;
					})()}
				</BroadcastCtx>
			),
			container,
		);
		await tick();

		const bc2 = new MockBC("flare");
		bc2.postMessage({ _f: 1, key: "other", payload: 99, type: "custom" });

		expect(received).toEqual([]);
		ch.close();
	});

	it("emit only (no handler): returns emit function", async () => {
		vi.resetModules();
		const { createChannel } = await import("../../../src/broadcast/channel");
		const { BroadcastCtx } = await import("../../../src/broadcast/context");
		const { useBroadcast } = await import("../../../src/broadcast/index");

		const ch = createChannel();
		let emitFn: ((v: number) => void) | undefined;

		dispose = render(
			() => (
				<BroadcastCtx value={ch}>
					{(() => {
						emitFn = useBroadcast<number>("counter");
						return null;
					})()}
				</BroadcastCtx>
			),
			container,
		);
		await tick();

		expect(typeof emitFn).toBe("function");
		ch.close();
	});

	it("emit broadcasts { type: custom, key, payload }", async () => {
		vi.resetModules();
		const { createChannel } = await import("../../../src/broadcast/channel");
		const { BroadcastCtx } = await import("../../../src/broadcast/context");
		const { useBroadcast } = await import("../../../src/broadcast/index");

		const ch = createChannel();
		const ch2 = createChannel();
		const received: unknown[] = [];
		ch2.onMessage((msg) => received.push(msg));

		let emitFn: ((v: number) => void) | undefined;
		dispose = render(
			() => (
				<BroadcastCtx value={ch}>
					{(() => {
						emitFn = useBroadcast<number>("counter");
						return null;
					})()}
				</BroadcastCtx>
			),
			container,
		);
		await tick();

		emitFn?.(7);
		expect(received.length).toBe(1);
		const msg = received[0] as Record<string, unknown>;
		expect(msg.type).toBe("custom");
		expect(msg.key).toBe("counter");
		expect(msg.payload).toBe(7);

		ch.close();
		ch2.close();
	});

	it("multiple handlers for same key all fire", async () => {
		vi.resetModules();
		const { createChannel } = await import("../../../src/broadcast/channel");
		const { BroadcastCtx } = await import("../../../src/broadcast/context");
		const { useBroadcast } = await import("../../../src/broadcast/index");

		const ch = createChannel();
		const a: unknown[] = [];
		const b: unknown[] = [];

		dispose = render(
			() => (
				<BroadcastCtx value={ch}>
					{(() => {
						useBroadcast<number>("x", (v) => a.push(v));
						useBroadcast<number>("x", (v) => b.push(v));
						return null;
					})()}
				</BroadcastCtx>
			),
			container,
		);
		await tick();

		const bc2 = new MockBC("flare");
		bc2.postMessage({ _f: 1, key: "x", payload: 1, type: "custom" });

		expect(a).toEqual([1]);
		expect(b).toEqual([1]);
		ch.close();
	});

	it("cleanup removes handler on component unmount", async () => {
		vi.resetModules();
		const { createChannel } = await import("../../../src/broadcast/channel");
		const { BroadcastCtx } = await import("../../../src/broadcast/context");
		const { useBroadcast } = await import("../../../src/broadcast/index");

		const ch = createChannel();
		const received: unknown[] = [];

		dispose = render(
			() => (
				<BroadcastCtx value={ch}>
					{(() => {
						useBroadcast<number>("x", (v) => received.push(v));
						return null;
					})()}
				</BroadcastCtx>
			),
			container,
		);
		await tick();

		dispose?.();
		dispose = undefined;

		const bc2 = new MockBC("flare");
		bc2.postMessage({ _f: 1, key: "x", payload: 1, type: "custom" });
		expect(received).toEqual([]);
		ch.close();
	});

	it("void payload emits/receives without error", async () => {
		vi.resetModules();
		const { createChannel } = await import("../../../src/broadcast/channel");
		const { BroadcastCtx } = await import("../../../src/broadcast/context");
		const { useBroadcast } = await import("../../../src/broadcast/index");

		const ch = createChannel();
		let fired = false;

		let emitFn: (() => void) | undefined;
		dispose = render(
			() => (
				<BroadcastCtx value={ch}>
					{(() => {
						/* Tab A: listen */
						useBroadcast("logout", () => {
							fired = true;
						});
						return null;
					})()}
				</BroadcastCtx>
			),
			container,
		);
		await tick();

		/* Simulate emit from another tab */
		const bc2 = new MockBC("flare");
		bc2.postMessage({ _f: 1, key: "logout", payload: undefined, type: "custom" });
		expect(fired).toBe(true);
		ch.close();
	});

	it("used outside BroadcastCtx.Provider → no-op", async () => {
		vi.resetModules();
		const { useBroadcast } = await import("../../../src/broadcast/index");

		let emitFn: (() => void) | undefined;
		dispose = render(() => {
			emitFn = useBroadcast("test");
			return null;
		}, container);
		await tick();

		expect(typeof emitFn).toBe("function");
		expect(() => emitFn?.()).not.toThrow();
	});
});

describe("createBroadcastSignal", () => {
	it("returns [accessor, setter] like createSignal", async () => {
		vi.resetModules();
		const { createChannel } = await import("../../../src/broadcast/channel");
		const { BroadcastCtx } = await import("../../../src/broadcast/context");
		const { createBroadcastSignal } = await import("../../../src/broadcast/index");

		const ch = createChannel();
		let accessor: (() => number) | undefined;

		dispose = render(
			() => (
				<BroadcastCtx value={ch}>
					{(() => {
						const [val] = createBroadcastSignal("count", 0);
						accessor = val;
						return null;
					})()}
				</BroadcastCtx>
			),
			container,
		);
		await tick();

		expect(accessor?.()).toBe(0);
		ch.close();
	});

	it("setter updates local signal immediately", async () => {
		vi.resetModules();
		const { createChannel } = await import("../../../src/broadcast/channel");
		const { BroadcastCtx } = await import("../../../src/broadcast/context");
		const { createBroadcastSignal } = await import("../../../src/broadcast/index");

		const ch = createChannel();
		let accessor: (() => number) | undefined;
		let setter: ((v: number) => void) | undefined;

		dispose = render(
			() => (
				<BroadcastCtx value={ch}>
					{(() => {
						const [val, set] = createBroadcastSignal("count", 0);
						accessor = val;
						setter = set;
						return null;
					})()}
				</BroadcastCtx>
			),
			container,
		);
		await tick();

		setter?.(5);
		flush();
		expect(accessor?.()).toBe(5);
		ch.close();
	});

	it("setter broadcasts { type: custom, key, payload }", async () => {
		vi.resetModules();
		const { createChannel } = await import("../../../src/broadcast/channel");
		const { BroadcastCtx } = await import("../../../src/broadcast/context");
		const { createBroadcastSignal } = await import("../../../src/broadcast/index");

		const ch = createChannel();
		const ch2 = createChannel();
		const received: unknown[] = [];
		ch2.onMessage((msg) => received.push(msg));

		let setter: ((v: number) => void) | undefined;

		dispose = render(
			() => (
				<BroadcastCtx value={ch}>
					{(() => {
						const [, set] = createBroadcastSignal("count", 0);
						setter = set;
						return null;
					})()}
				</BroadcastCtx>
			),
			container,
		);
		await tick();

		setter?.(10);
		expect(received.length).toBe(1);
		const msg = received[0] as Record<string, unknown>;
		expect(msg.type).toBe("custom");
		expect(msg.key).toBe("count");
		expect(msg.payload).toBe(10);

		ch.close();
		ch2.close();
	});

	it("incoming message updates signal", async () => {
		vi.resetModules();
		const { createChannel } = await import("../../../src/broadcast/channel");
		const { BroadcastCtx } = await import("../../../src/broadcast/context");
		const { createBroadcastSignal } = await import("../../../src/broadcast/index");

		const ch = createChannel();
		let accessor: (() => number) | undefined;

		dispose = render(
			() => (
				<BroadcastCtx value={ch}>
					{(() => {
						const [val] = createBroadcastSignal("count", 0);
						accessor = val;
						return null;
					})()}
				</BroadcastCtx>
			),
			container,
		);
		await tick();

		const bc2 = new MockBC("flare");
		bc2.postMessage({ _f: 1, key: "count", payload: 99, type: "custom" });
		flush();

		expect(accessor?.()).toBe(99);
		ch.close();
	});

	it("different keys don't interfere", async () => {
		vi.resetModules();
		const { createChannel } = await import("../../../src/broadcast/channel");
		const { BroadcastCtx } = await import("../../../src/broadcast/context");
		const { createBroadcastSignal } = await import("../../../src/broadcast/index");

		const ch = createChannel();
		let aVal: (() => number) | undefined;
		let bVal: (() => string) | undefined;

		dispose = render(
			() => (
				<BroadcastCtx value={ch}>
					{(() => {
						const [a] = createBroadcastSignal("a", 0);
						const [b] = createBroadcastSignal("b", "hello");
						aVal = a;
						bVal = b;
						return null;
					})()}
				</BroadcastCtx>
			),
			container,
		);
		await tick();

		const bc2 = new MockBC("flare");
		bc2.postMessage({ _f: 1, key: "a", payload: 42, type: "custom" });
		flush();

		expect(aVal?.()).toBe(42);
		expect(bVal?.()).toBe("hello");
		ch.close();
	});

	it("same key in same tab shares signal (registry)", async () => {
		vi.resetModules();
		const { createChannel } = await import("../../../src/broadcast/channel");
		const { BroadcastCtx } = await import("../../../src/broadcast/context");
		const { createBroadcastSignal } = await import("../../../src/broadcast/index");

		const ch = createChannel();
		let aVal: (() => number) | undefined;
		let bVal: (() => number) | undefined;
		let aSetter: ((v: number) => void) | undefined;

		dispose = render(
			() => (
				<BroadcastCtx value={ch}>
					{(() => {
						const [a, setA] = createBroadcastSignal("cart", 0);
						aVal = a;
						aSetter = setA;
						return null;
					})()}
					{(() => {
						const [b] = createBroadcastSignal("cart", 0);
						bVal = b;
						return null;
					})()}
				</BroadcastCtx>
			),
			container,
		);
		await tick();

		aSetter?.(5);
		flush();
		expect(aVal?.()).toBe(5);
		expect(bVal?.()).toBe(5);
		ch.close();
	});

	it("registry refCount: single consumer unmount → signal kept", async () => {
		vi.resetModules();
		const { createChannel } = await import("../../../src/broadcast/channel");
		const { BroadcastCtx } = await import("../../../src/broadcast/context");
		const { createBroadcastSignal, _getRegistryForTest } = await import("../../../src/broadcast/index");

		const ch = createChannel();
		let innerDispose: (() => void) | undefined;
		let outerVal: (() => number) | undefined;

		dispose = render(
			() => (
				<BroadcastCtx value={ch}>
					{(() => {
						const [val] = createBroadcastSignal("cart", 0);
						outerVal = val;
						return null;
					})()}
					{(() => {
						let d: (() => void) | undefined;
						createRoot((dispose) => {
							d = dispose;
							const [val] = createBroadcastSignal("cart", 0);
						});
						innerDispose = d;
						return null;
					})()}
				</BroadcastCtx>
			),
			container,
		);
		await tick();

		innerDispose?.();
		await tick();

		/* Registry still has the entry because outer component still uses it */
		const registry = _getRegistryForTest();
		expect(registry).not.toBeNull();
		expect(registry?.has("cart")).toBe(true);
		ch.close();
	});

	it("registry refCount: all consumers unmount → entry deleted", async () => {
		vi.resetModules();
		const { createChannel } = await import("../../../src/broadcast/channel");
		const { BroadcastCtx } = await import("../../../src/broadcast/context");
		const { createBroadcastSignal, _getRegistryForTest } = await import("../../../src/broadcast/index");

		const ch = createChannel();

		dispose = render(
			() => (
				<BroadcastCtx value={ch}>
					{(() => {
						createBroadcastSignal("temp", 0);
						return null;
					})()}
				</BroadcastCtx>
			),
			container,
		);
		await tick();

		const registry = _getRegistryForTest();
		expect(registry).not.toBeNull();
		expect(registry?.has("temp")).toBe(true);

		dispose?.();
		dispose = undefined;
		await tick();

		expect(registry?.has("temp")).toBe(false);
		ch.close();
	});

	it("registry reuse: unmount all → remount → fresh signal with initialValue", async () => {
		vi.resetModules();
		const { createChannel } = await import("../../../src/broadcast/channel");
		const { BroadcastCtx } = await import("../../../src/broadcast/context");
		const { createBroadcastSignal } = await import("../../../src/broadcast/index");

		const ch = createChannel();
		let val: (() => number) | undefined;
		let setter: ((v: number) => void) | undefined;

		/* First mount */
		dispose = render(
			() => (
				<BroadcastCtx value={ch}>
					{(() => {
						const [v, s] = createBroadcastSignal("cart", 0);
						val = v;
						setter = s;
						return null;
					})()}
				</BroadcastCtx>
			),
			container,
		);
		await tick();
		setter?.(99);
		flush();
		expect(val?.()).toBe(99);

		dispose?.();
		dispose = undefined;
		await tick();

		/* Second mount — should get fresh signal with initialValue */
		dispose = render(
			() => (
				<BroadcastCtx value={ch}>
					{(() => {
						const [v] = createBroadcastSignal("cart", 0);
						val = v;
						return null;
					})()}
				</BroadcastCtx>
			),
			container,
		);
		await tick();
		expect(val?.()).toBe(0);
		ch.close();
	});

	it("object value syncs correctly", async () => {
		vi.resetModules();
		const { createChannel } = await import("../../../src/broadcast/channel");
		const { BroadcastCtx } = await import("../../../src/broadcast/context");
		const { createBroadcastSignal } = await import("../../../src/broadcast/index");

		const ch = createChannel();
		let val: (() => { fontSize: number }) | undefined;
		let setter: ((v: { fontSize: number }) => void) | undefined;

		dispose = render(
			() => (
				<BroadcastCtx value={ch}>
					{(() => {
						const [v, s] = createBroadcastSignal("prefs", { fontSize: 14 });
						val = v;
						setter = s;
						return null;
					})()}
				</BroadcastCtx>
			),
			container,
		);
		await tick();

		setter?.({ fontSize: 16 });
		flush();
		expect(val?.()).toEqual({ fontSize: 16 });
		ch.close();
	});

	it("used outside BroadcastCtx.Provider → signal works locally, no broadcast", async () => {
		vi.resetModules();
		const { createBroadcastSignal } = await import("../../../src/broadcast/index");

		let val: (() => number) | undefined;
		let setter: ((v: number) => void) | undefined;

		dispose = render(() => {
			const [v, s] = createBroadcastSignal("x", 0);
			val = v;
			setter = s;
			return null;
		}, container);
		await tick();

		setter?.(5);
		flush();
		expect(val?.()).toBe(5);
	});
});
