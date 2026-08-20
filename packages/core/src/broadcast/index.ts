import { createSignal, onCleanup, type Setter, useContext } from "solid-js";
import type { ChannelMessage } from "./channel.ts";
import { BroadcastCtx } from "./context.ts";

export type { ChannelMessage, InternalChannel, SerializedInvalidateOptions } from "./channel.ts";
export { createChannel } from "./channel.ts";
export { BroadcastCtx } from "./context.ts";

/**
 * Signal registry — same key in same tab shares one signal instance.
 * BroadcastChannel fires in OTHER tabs only, so without this,
 * two components using createBroadcastSignal("cart", 0) in the same tab
 * would NOT share state when one calls the setter.
 */
const registry = new Map<string, { refCount: number; signal: [() => unknown, (v: unknown) => void] }>();

/** @internal test-only accessor — no-ops in production builds (tree-shaken) */
export function _getRegistryForTest(): typeof registry | null {
	if (process.env.NODE_ENV !== "test") return null;
	return registry;
}

export function useBroadcast<T = void>(key: string, handler?: (payload: T) => void): (payload: T) => void {
	const channel = useContext(BroadcastCtx);

	if (handler) {
		const unsubscribe = channel.onMessage((msg: ChannelMessage) => {
			if (msg.type === "custom" && msg.key === key) {
				handler(msg.payload as T);
			}
		});
		onCleanup(unsubscribe);
	}

	return (payload: T) => {
		channel.broadcast({ key, payload, type: "custom" });
	};
}

export function createBroadcastSignal<T>(key: string, initialValue: T): [() => T, (value: T) => void] {
	const channel = useContext(BroadcastCtx);

	let entry = registry.get(key);
	if (!entry) {
		const [value, setValue] = createSignal(initialValue as Exclude<T, Function>);
		entry = {
			refCount: 0,
			signal: [value, setValue as (v: unknown) => void],
		};
		registry.set(key, entry);
	}
	entry.refCount++;

	const [value, setValue] = entry.signal as [() => T, Setter<T>];

	const unsubscribe = channel.onMessage((msg: ChannelMessage) => {
		if (msg.type === "custom" && msg.key === key) {
			setValue(() => msg.payload as T);
		}
	});

	onCleanup(() => {
		unsubscribe();
		const e = registry.get(key);
		if (e && --e.refCount === 0) registry.delete(key);
	});

	return [
		value,
		(v: T) => {
			setValue(() => v);
			channel.broadcast({ key, payload: v, type: "custom" });
		},
	];
}
