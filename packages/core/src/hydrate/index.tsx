/* @refresh skip */
import swConfig from "virtual:flare-sw-config";

declare const __FLARE_IS_DEV__: boolean | undefined;
const isDevDefault = typeof __FLARE_IS_DEV__ === "boolean" ? __FLARE_IS_DEV__ : false;
import { flush } from "solid-js";
import type { JSX } from "@solidjs/web";
import { createComponent, Hydration, render, hydrate as solidHydrate } from "@solidjs/web";
import { SSRContextProvider } from "../components/ssr-context.tsx";
import { createChannel } from "../broadcast/channel.ts";
import { BroadcastProvider } from "../broadcast/provider.tsx";
import type { MatchCache } from "../caches/index.ts";
import { createMatchCache, createPrefetchCache } from "../caches/index.ts";
import { DirectionProvider } from "../direction.ts";
import { NotFoundError, UnauthenticatedError, UnauthorizedError } from "../errors/index.ts";
import { replaceHistoryState } from "../history/index.ts";
import {
	buildInitialMatches,
	extractRootBoundaries,
	hydrateHeadState,
	loadRouteModules,
	populateMatchCache,
} from "../hydration/index.ts";
import { onceIdle } from "../internal/once-idle.ts";
import { setupNavigation } from "../navigation/index.ts";
import type { LoadedRouteModule } from "../navigation/types.ts";
import { FlareProvider, Outlet, useRouter } from "../outlet/index.tsx";
import type { FlareProviderContext, ProviderLocation, RenderProps } from "../outlet/types.ts";
import type { LocationRewrite } from "../rewrite/index.ts";
import { composeRewrites, executeRewriteInput, rewriteBasePath } from "../rewrite/index.ts";
import type { createRouter, MarkedRouterConfig } from "../router-config/index.ts";
import {
	hydrateFlareState,
	installDeferredResolver,
	installQueryCacheResolver,
	parseFlareState,
} from "../state-parser/index.ts";
import { enableDomInjection, finishHydration } from "../styles/index.ts";
import { ThemeProvider } from "../theme.ts";
import { parseSearchParams } from "../url/index.ts";

function reconstructError(name: string): Error {
	if (name === "NotFoundError") return new NotFoundError();
	if (name === "UnauthenticatedError") return new UnauthenticatedError();
	if (name === "UnauthorizedError") return new UnauthorizedError();
	const err = new Error();
	err.name = name;
	return err;
}

export interface HydrateOptions {
	/** @internal override for testing — auto-resolved from virtual module */
	devOverlay?: boolean;
	onContextReady?: (ctx: FlareProviderContext) => void;
	onHydrated?: () => void;
	onIdle?: () => void;
	onInteraction?: () => void;
}

function readDocumentNonce(): string {
	if (typeof document === "undefined") return "";
	return document.querySelector('meta[name="csp-nonce"]')?.getAttribute("nonce") ?? "";
}

function RootRenderer(props: {
	data: unknown;
	location: ProviderLocation;
	preloaderContext: Record<string, unknown> | undefined;
	renderFn: (p: RenderProps) => JSX.Element;
}): JSX.Element {
	const router = useRouter();
	/* Getter so <Outlet> does not consume hydration child ids before <html>. */
	return props.renderFn({
		get children() {
			return <Outlet />;
		},
		loaderData: props.data,
		location: props.location,
		preloaderContext: props.preloaderContext,
		router,
	});
}

function buildComposedRewrite(r: MarkedRouterConfig): LocationRewrite | undefined {
	const rewrites: LocationRewrite[] = [];
	if (r.basePath) {
		rewrites.push(rewriteBasePath({ basePath: r.basePath, caseSensitive: r.caseSensitive }));
	}
	if (r.rewrite) {
		rewrites.push(r.rewrite);
	}
	if (rewrites.length === 0) return undefined;
	if (rewrites.length === 1) return rewrites[0];
	return composeRewrites(rewrites);
}

declare const self: { flare?: unknown };

export type RouterArg = MarkedRouterConfig | (() => MarkedRouterConfig | Promise<MarkedRouterConfig>);

export async function hydrate(router: RouterArg, options?: HydrateOptions): Promise<void> {
	enableDomInjection();
	const r = typeof router === "function" ? await router() : router;
	const raw = parseFlareState(self.flare);
	if (!raw) return;

	const state = hydrateFlareState(raw);
	installDeferredResolver(state.resolvers);

	/* Forward SSR-captured server logs to browser console */
	if (raw.g) {
		const logPrefix = "%c[server]";
		const logStyle = "color:#60a5fa;font-weight:bold";
		const srcStyle = "color:#9ca3af";
		for (const entry of raw.g) {
			const args = Array.isArray(entry.a) ? entry.a : [];
			const prefix = entry.s
				? [logPrefix, logStyle, `%c ${entry.s}`, srcStyle, ...args]
				: [logPrefix, logStyle, ...args];
			switch (entry.l) {
				case "warn":
					console.warn(...prefix);
					break;
				case "error":
					console.error(...prefix);
					break;
				default:
					console.log(...prefix);
					break;
			}
		}
	}

	const matchCache: MatchCache = createMatchCache(r.routeCacheMaxEntries);
	const prefetchCache = createPrefetchCache();

	populateMatchCache(matchCache, state.matches, raw.ph);

	if (raw.ph) {
		hydrateHeadState({
			ph: raw.ph.map((h) => ({
				head: { ...h.head },
				matchId: h.matchId,
			})),
		});
	}

	/* Hydrate TanStack Query cache from FlareState.q (spec 33) */
	let QCP: ((props: { children: JSX.Element; client: unknown }) => JSX.Element) | undefined;
	let queryClientInstance: unknown;
	if (r.queryClientGetter) {
		queryClientInstance = r.queryClientGetter();
		const qEntries = raw.q;
		if (qEntries && Array.isArray(qEntries) && qEntries.length > 0) {
			const { hydrateQueryCache } = await import("../query-client");
			hydrateQueryCache(queryClientInstance as Parameters<typeof hydrateQueryCache>[0], qEntries);
		}
		const { QueryClientProvider } = await import("../query-client");
		QCP = QueryClientProvider as typeof QCP;
		installQueryCacheResolver(queryClientInstance);
	}

	/* Build composed rewrite: basePath (if any) + user rewrite */
	const composedRewrite = buildComposedRewrite(r);

	const hydrateUrl = new URL(state.pathname, "http://localhost");
	const hydratePathname = composedRewrite ? executeRewriteInput(composedRewrite, hydrateUrl).pathname : state.pathname;
	let modules = await loadRouteModules(hydratePathname, r.routeTree, r.layouts, r.caseSensitive, r.locale);
	/* Same fuzzy fallback as the server: unmatched URLs still hydrate the
	   root index so NotFoundError from FlareState maps onto `_root_/`
	   instead of a greedy `[locale]` param (which would render with no
	   loaderData and throw on `.t`). */
	if (!modules && (r.notFoundMode ?? "fuzzy") !== "root") {
		modules = await loadRouteModules("/", r.routeTree, r.layouts, r.caseSensitive, r.locale);
	}

	if (modules) {
		const search = parseSearchParams(new URL(window.location.href).searchParams);
		const rootLayout = modules.layouts.find((m) => m._type === "root-layout");
		const nonRootLayouts = modules.layouts.filter((m) => m._type !== "root-layout");
		const allModules: LoadedRouteModule[] = [...nonRootLayouts, modules.page];

		/* Build error map from per-match error names (survives serialization) */
		const errorMap = new Map<string, Error>();
		for (const hm of state.matches) {
			if (hm.errorName) {
				errorMap.set(hm.virtualPath, reconstructError(hm.errorName));
			}
		}

		const rootBoundaries = extractRootBoundaries(rootLayout);
		const initialMatches = buildInitialMatches(allModules, matchCache, modules.params, search, errorMap);

		let resolveCtx: (ctx: FlareProviderContext) => void = () => {};
		const ctxReady = new Promise<FlareProviderContext>((resolve) => {
			resolveCtx = resolve;
		});

		/* Root layout data from FlareState (populated by SSR) */
		const rootMatchState = rootLayout ? state.matches.find((m) => m.virtualPath === rootLayout.virtualPath) : undefined;

		/*
		 * Full-document hydration. SSR and client wrappers must match —
		 * Solid 2 `_hk` ids follow the owner tree.
		 *
		 * Both: Hydration > QCP? > SSRContextProvider > Theme > Direction >
		 *       Broadcast > FlareProvider > rootRenderFn({children: Outlet})
		 */
		const channel = createChannel();
		const renderInner = () => (
			<SSRContextProvider
				value={{
					direction: r.direction,
					flareStateScript: "",
					isServer: false,
					nonce: readDocumentNonce(),
					theme: r.theme,
				}}
			>
				<ThemeProvider config={r.theme}>
					<DirectionProvider config={r.direction}>
						<BroadcastProvider value={channel}>
							<FlareProvider
								boundaries={rootBoundaries}
								caseSensitive={r.caseSensitive}
								layouts={r.layouts}
								localeConfig={r.locale}
								matchCache={matchCache}
								matches={initialMatches}
								onContextReady={(ctx) => {
									resolveCtx(ctx);
								}}
								params={state.params}
								prefetchCache={prefetchCache}
								resolvers={state.resolvers}
								routerCacheDefaults={r.cache?.client || undefined}
								routeTree={r.routeTree}
								search={search}
							>
								{rootLayout?.render ? (
									RootRenderer({
										data: rootMatchState?.loaderData,
										location: {
											hash: window.location.hash,
											params: state.params,
											pathname: state.pathname,
											search,
											url: new URL(window.location.href),
											variablePath: "",
											virtualPath: rootLayout.virtualPath,
										},
										preloaderContext: rootMatchState?.preloaderContext,
										renderFn: rootLayout.render,
									})
								) : (
									<Outlet />
								)}
							</FlareProvider>
						</BroadcastProvider>
					</DirectionProvider>
				</ThemeProvider>
			</SSRContextProvider>
		);

		solidHydrate(
			() => (
				<Hydration>
					{QCP && queryClientInstance
						? createComponent(QCP, {
								get children() {
									return renderInner();
								},
								client: queryClientInstance,
							})
						: renderInner()}
				</Hydration>
			),
			document,
		);
		flush();
		finishHydration();

		replaceHistoryState(window.location.pathname, state.params, window.location.search, {
			hash: window.location.hash,
			historyIndex: 0,
		});

		if (options?.onHydrated) {
			options.onHydrated();
		}

		if (options?.onIdle) {
			const cb = options.onIdle;
			if (typeof requestIdleCallback === "function") {
				requestIdleCallback(() => cb());
			} else {
				setTimeout(cb, 0);
			}
		}

		if (options?.onInteraction) {
			const cb = options.onInteraction;
			const events = ["mousemove", "touchstart", "scroll", "keydown"] as const;
			const handler = () => {
				for (const e of events) removeEventListener(e, handler, { capture: true });
				cb();
			};
			for (const e of events) {
				addEventListener(e, handler, { capture: true, once: true, passive: true });
			}
		}

		const providerCtx = await ctxReady;

		if (options?.onContextReady) {
			options.onContextReady(providerCtx);
		}

		const initialRouteIds = allModules.map((mod) => mod.virtualPath);
		if (rootLayout) initialRouteIds.push(rootLayout.virtualPath);

		setupNavigation(
			providerCtx,
			async (pathname, tree, lyts) => {
				const result = await loadRouteModules(
					pathname,
					tree as ReturnType<typeof createRouter>["routeTree"],
					lyts,
					r.caseSensitive,
					r.locale,
				);
				if (!result)
					throw new Error(
						`No route modules found for "${pathname}". Verify the route file exists and the build completed successfully.`,
					);
				return result;
			},
			{
				caseSensitive: r.caseSensitive,
				direction: r.direction,
				initialRouteIds,
				keepalive: (raw.c.router as Record<string, unknown> | undefined)?.keepalive as false | number | undefined,
				locale: r.locale,
				notFoundMode: r.notFoundMode ?? "fuzzy",
				queryClient: queryClientInstance,
				rewrite: composedRewrite,
				scrollRestoration: r.scrollRestoration,
				scrollRestorationBehavior: r.scrollRestorationBehavior,
				scrollRestorationMaxEntries: r.scrollRestorationMaxEntries,
				viewTransitions: r.viewTransitions ?? false,
			},
		);

		const showDevOverlay = options?.devOverlay ?? isDevDefault;
		if (showDevOverlay) {
			const { DevErrorOverlay } = await import("../components/dev-error-overlay");
			let overlayRoot = document.getElementById("flare-dev-overlay-root");
			if (!overlayRoot) {
				overlayRoot = document.createElement("div");
				overlayRoot.id = "flare-dev-overlay-root";
				document.body.appendChild(overlayRoot);
			}
			overlayRoot.textContent = "";
			render(() => <DevErrorOverlay />, overlayRoot);
		}

		document.documentElement.setAttribute("data-hydrated", "");
	}

	/* Service worker registration / unregistration */
	if ("serviceWorker" in navigator) {
		if ((swConfig as { enabled: boolean }).enabled) {
			const cfg = swConfig as { enabled: boolean; path: string; scope: string };
			onceIdle(() => {
				navigator.serviceWorker
					.register(cfg.path, {
						scope: cfg.scope,
						updateViaCache: "none" as ServiceWorkerUpdateViaCache,
					})
					.catch(() => {});
			});
		} else {
			onceIdle(() => {
				navigator.serviceWorker
					.getRegistrations()
					.then((regs) => {
						for (const reg of regs) reg.unregister();
					})
					.catch(() => {});
			});
		}
	}
}
