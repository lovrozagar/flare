import type { JSX } from "@solidjs/web";
import { Dynamic, isServer } from "@solidjs/web";
import { type Component, createSignal, onSettled, Show, sharedConfig, untrack } from "solid-js";
import { retryImport } from "../internal.ts";
import { warn } from "../logger.ts";

export interface LazyOptions<P extends Record<string, unknown>> {
	loader: () => Promise<{ default: Component<P> }>;
	pending?: Component<P>;
}

export interface ClientLazyOptions<P extends Record<string, unknown>> {
	eager?: boolean;
	loader: () => Promise<{ default: Component<P> }>;
	pending?: Component<P>;
}

const PENDING_KEY = "__FLARE_LAZY_PENDING__";
const LOADED_KEY = "__FLARE_LAZY_LOADED__";

function getGlobalPending(): Set<Promise<void>> {
	const g = globalThis as Record<string, unknown>;
	if (!g[PENDING_KEY]) g[PENDING_KEY] = new Set<Promise<void>>();
	return g[PENDING_KEY] as Set<Promise<void>>;
}

function getGlobalLoaded(): Set<Promise<void>> {
	const g = globalThis as Record<string, unknown>;
	if (!g[LOADED_KEY]) g[LOADED_KEY] = new Set<Promise<void>>();
	return g[LOADED_KEY] as Set<Promise<void>>;
}

/** Throw during render so `<Errored>` can catch. Read is untracked — error is a snapshot. */
function ThrowError(props: { error: Error }): JSX.Element {
	throw untrack(() => props.error);
}

export function lazy<P extends Record<string, unknown>>(options: LazyOptions<P>): Component<P> {
	const { loader, pending } = options;
	let loaded: Component<P> | undefined;
	let loadError: Error | undefined;
	let loadPromise: Promise<void> | undefined;

	/* Start loading immediately at factory call */
	loadPromise = retryImport(loader)
		.then((mod) => {
			loaded = mod.default;
			getGlobalLoaded().add(loadPromise as Promise<void>);
			getGlobalPending().delete(loadPromise as Promise<void>);
		})
		.catch((e: unknown) => {
			loadError = e instanceof Error ? e : new Error(String(e));
			getGlobalPending().delete(loadPromise as Promise<void>);
		});
	getGlobalPending().add(loadPromise);

	return ((props: P) => {
		const isSSR = isServer || !!sharedConfig.hydrating;

		/* Pre-known error at render time → throw from component body */
		if (loadError) throw loadError;

		/* Store `{ C }` — Solid 2 treats a function initial value as a derived signal. */
		const [component, setComponent] = createSignal<{ C: Component<P> } | undefined>(
			isSSR || !loaded ? undefined : { C: loaded },
		);
		const [error, setError] = createSignal<Error | undefined>();

		if (isSSR || !loaded) {
			onSettled(() => {
				if (loadError) {
					setError(loadError);
				} else if (loaded) {
					setComponent({ C: loaded });
				} else {
					loadPromise?.then(() => {
						if (loadError) setError(loadError);
						else if (loaded) setComponent({ C: loaded });
					});
				}
			});
		}

		return (
			<Show
				fallback={
					<Show fallback={pending ? <Dynamic component={pending} {...props} /> : null} when={component()}>
						{(entry) => <Dynamic component={entry().C} {...props} />}
					</Show>
				}
				when={error()}
			>
				{(err) => <ThrowError error={err() as Error} />}
			</Show>
		) as JSX.Element;
	}) as Component<P>;
}

export function clientLazy<P extends Record<string, unknown>>(
	options: ClientLazyOptions<P>,
): Component<P & { pending?: Component<P> }> {
	const { eager, loader, pending: factoryPending } = options;
	let loaded: Component<P> | undefined;
	let loadError: Error | undefined;
	let loadPromise: Promise<void> | undefined;

	if (eager) {
		loadPromise = retryImport(loader)
			.then((mod) => {
				loaded = mod.default;
			})
			.catch((e: unknown) => {
				loadError = e instanceof Error ? e : new Error(String(e));
			});
	}

	return ((props: P & { pending?: Component<P> }) => {
		const isSSR = isServer || !!sharedConfig.hydrating;

		/* Pre-known error at render time → throw from component body */
		if (loadError) throw loadError;

		/* Store `{ C }` — Solid 2 treats a function initial value as a derived signal. */
		const [component, setComponent] = createSignal<{ C: Component<P> } | undefined>(
			isSSR || !loaded ? undefined : { C: loaded },
		);
		const [error, setError] = createSignal<Error | undefined>();

		const startLoading = () => {
			if (!loadPromise) {
				loadPromise = retryImport(loader)
					.then((mod) => {
						loaded = mod.default;
					})
					.catch((e: unknown) => {
						loadError = e instanceof Error ? e : new Error(String(e));
					});
			}
			loadPromise
				.then(() => {
					if (loadError) setError(loadError);
					else if (loaded) setComponent({ C: loaded });
				})
				.catch((e: unknown) => {
					warn("lazy", "chunk retry failed", e);
				});
		};

		if (!isSSR && !loaded) {
			startLoading();
		}

		if (!isSSR && loaded) {
			/* Already loaded — render immediately */
		} else {
			/* SSR hydration or not-yet-loaded: kick off after mount */
			onSettled(() => {
				if (loaded) {
					setComponent({ C: loaded });
				} else if (loadError) {
					setError(loadError);
				} else {
					startLoading();
				}
			});
		}

		return (
			<Show
				fallback={
					<Show
						fallback={
							<Show when={props.pending ?? factoryPending}>
								{(Comp) => <Dynamic component={Comp()} {...(props as P)} />}
							</Show>
						}
						when={component()}
					>
						{(entry) => <Dynamic component={entry().C} {...(props as P)} />}
					</Show>
				}
				when={error()}
			>
				{(err) => <ThrowError error={err() as Error} />}
			</Show>
		) as JSX.Element;
	}) as Component<P & { pending?: Component<P> }>;
}

export async function waitForLazyPreloads(): Promise<void> {
	const pending = getGlobalPending();
	if (pending.size === 0) return;
	await Promise.all(pending);
}

/**
 * Reset global tracking state. No-ops outside test environment.
 */
export function resetLazyState(): void {
	if (process.env.NODE_ENV !== "test") return;
	const g = globalThis as Record<string, unknown>;
	g[PENDING_KEY] = new Set<Promise<void>>();
	g[LOADED_KEY] = new Set<Promise<void>>();
}
