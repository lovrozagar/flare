import { createEffect, createMemo, createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";

export interface Deferred<T> {
	__deferred: true;
	__error?: { message: string };
	__key?: string;
	__resolved?: T;
	promise: Promise<T>;
}

export type AwaitStatus = "error" | "pending" | "success";

export interface AwaitProps<T> {
	children: (data: T) => JSX.Element;
	error?: ((err: Error, reset: () => void) => JSX.Element) | null;
	pending?: JSX.Element;
	promise: Deferred<T> | Promise<T>;
}

export function isDeferred<T>(value: unknown): value is Deferred<T> {
	return (
		value !== null &&
		value !== undefined &&
		typeof value === "object" &&
		(value as Record<string, unknown>).__deferred === true
	);
}

export function getPromise<T>(value: Deferred<T> | Promise<T> | null | undefined): Promise<T> | undefined {
	if (isDeferred<T>(value)) {
		return value.promise instanceof Promise ? value.promise : undefined;
	}
	if (value != null && typeof (value as Promise<T>).then === "function") {
		return value as Promise<T>;
	}
	return undefined;
}

export function getResolvedValue<T>(value: Deferred<T> | Promise<T>): T | undefined {
	return isDeferred<T>(value) ? value.__resolved : undefined;
}

export function getResolvedError(value: unknown): Error | undefined {
	if (!isDeferred(value)) return undefined;
	if (value.__error) return new Error(value.__error.message);
	return undefined;
}

export function Await<T>(props: AwaitProps<T>): JSX.Element {
	const initialResolved = getResolvedValue(props.promise);
	const initialError = getResolvedError(props.promise);

	function computeInitialStatus(): AwaitStatus {
		if (initialResolved !== undefined) return "success";
		if (initialError) return "error";
		return "pending";
	}

	const [status, setStatus] = createSignal<AwaitStatus>(computeInitialStatus());
	const [data, setData] = createSignal<T | undefined>(initialResolved as Exclude<T | undefined, Function>);
	const [error, setError] = createSignal<Error | undefined>(initialError);

	let currentPromise = getPromise(props.promise);

	if (initialResolved === undefined && !initialError && currentPromise) {
		trackPromise(currentPromise);
	}

	function trackPromise(p: Promise<T>): void {
		p.then(
			(result) => {
				if (currentPromise === p) {
					setData(() => result);
					setStatus("success");
				}
			},
			(err: unknown) => {
				if (currentPromise === p) {
					setError(() => (err instanceof Error ? err : new Error(String(err))));
					setStatus("error");
				}
			},
		);
	}

	function reset(): void {
		const p = getPromise(props.promise);
		currentPromise = p;
		setStatus("pending");
		setData(undefined);
		setError(undefined);
		if (p) trackPromise(p);
	}

	/* Watch for promise prop changes. Wrap in an object so a Promise value is
	   not treated as an async computation (Solid 2 unwraps returned Promises). */
	createEffect(
		() => ({ promise: props.promise }),
		({ promise }) => {
			const newPromise = getPromise(promise);
			if (newPromise === currentPromise) return;
			currentPromise = newPromise;

			const resolved = getResolvedValue(promise);
			const resolvedError = getResolvedError(promise);

			if (resolved !== undefined) {
				setData(() => resolved);
				setStatus("success");
				return;
			}
			if (resolvedError) {
				setError(() => resolvedError);
				setStatus("error");
				return;
			}

			setStatus("pending");
			if (newPromise) trackPromise(newPromise);
		},
	);

	return createMemo(() => {
		const s = status();
		if (s === "success") {
			return props.children(data() as T);
		}
		if (s === "error") {
			if (props.error) return props.error(error() as Error, reset);
			return null;
		}
		return props.pending ?? null;
	}) as unknown as JSX.Element;
}
