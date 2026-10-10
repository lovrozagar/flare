import type { RouterArg } from "../hydrate/index.tsx";
import type { FlareProviderContext } from "../outlet/types.ts";

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface ClientBuilder {
	onHydrated(fn: () => void): ClientBuilder;
	onIdle(fn: () => void): ClientBuilder;
	onInteraction(fn: () => void): ClientBuilder;
	onReady(fn: (ctx: FlareProviderContext) => void): ClientBuilder;
}

/* ── Builder ───────────────────────────────────────────────────────────── */

export function createClient(router: RouterArg): ClientBuilder {
	const onHydratedFns: Array<() => void> = [];
	const onIdleFns: Array<() => void> = [];
	const onInteractionFns: Array<() => void> = [];
	const onReadyFns: Array<(ctx: FlareProviderContext) => void> = [];

	const builder: ClientBuilder = {
		onHydrated(fn) {
			onHydratedFns.push(fn);
			return builder;
		},
		onIdle(fn) {
			onIdleFns.push(fn);
			return builder;
		},
		onInteraction(fn) {
			onInteractionFns.push(fn);
			return builder;
		},
		onReady(fn) {
			onReadyFns.push(fn);
			return builder;
		},
	};

	/*
	 * Defer hydration to next microtask so builder methods are registered
	 * before hydrate() reads them.
	 */
	queueMicrotask(async () => {
		const { hydrate } = await import("../hydrate");
		await hydrate(router, {
			onContextReady:
				onReadyFns.length > 0
					? (ctx) => {
							for (const fn of onReadyFns) fn(ctx);
						}
					: undefined,
			onHydrated:
				onHydratedFns.length > 0
					? () => {
							for (const fn of onHydratedFns) fn();
						}
					: undefined,
			onIdle:
				onIdleFns.length > 0
					? () => {
							for (const fn of onIdleFns) fn();
						}
					: undefined,
			onInteraction:
				onInteractionFns.length > 0
					? () => {
							for (const fn of onInteractionFns) fn();
						}
					: undefined,
		});
	});

	return builder;
}
