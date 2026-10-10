import type { ViewTransitionConfig } from "../outlet/types.ts";
import { createEffect, createMemo, createSignal, omit, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import { applyRewriteOutput, isExternal, navigate, prefetch } from "../navigation/index.ts";
import { useRouterContext } from "../outlet/index.tsx";
import { scheduleAfterLoad } from "../prefetch/after-load.ts";
import { constrainedConnection } from "../prefetch/connection.ts";
import { type PrefetchConfig, type PrefetchTrigger, resolvePrefetch } from "../prefetch/resolve.ts";
import type { RouteParamsProps, RoutePaths, RouteSearchProps } from "../route-builder/register.ts";
import { matchRoute, toLocaleMatch } from "../router-primitives/index.ts";
import { buildUrl } from "../url/index.ts";

/** @deprecated Use `PrefetchConfig`. */
export type PrefetchStrategy = PrefetchTrigger;
export type { PrefetchConfig, PrefetchTrigger } from "../prefetch/resolve.ts";

export type FlareAnchorProps = Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href">;

type InternalLinkProps<TPath extends RoutePaths = RoutePaths> = FlareAnchorProps & {
	activeClass?: string;
	activeProps?: FlareAnchorProps;
	children: JSX.Element;
	disabled?: boolean;
	force?: boolean;
	hash?: string;
	href?: never;
	inactiveClass?: string;
	inactiveProps?: FlareAnchorProps;
	isActive?: (location: { pathname: string }) => boolean;
	prefetch?: PrefetchConfig;
	replace?: boolean;
	revalidate?: boolean;
	scroll?: boolean;
	shallow?: boolean;
	to: TPath;
	viewTransition?: ViewTransitionConfig;
} & RouteParamsProps<TPath> &
	RouteSearchProps<TPath>;

export type ExternalLinkProps = FlareAnchorProps & {
	children: JSX.Element;
	disabled?: boolean;
	href: string;
	to?: never;
};

export type LinkProps<TPath extends RoutePaths = RoutePaths> = InternalLinkProps<TPath> | ExternalLinkProps;

/* Flattened internal type for omit — avoids TS intersection issues with Omit */
interface LinkPropsInternal {
	activeClass?: string;
	activeProps?: FlareAnchorProps;
	children: JSX.Element;
	class?: string;
	disabled?: boolean;
	force?: boolean;
	hash?: string;
	href?: string;
	inactiveClass?: string;
	inactiveProps?: FlareAnchorProps;
	isActive?: (location: { pathname: string }) => boolean;
	params?: Record<string, unknown>;
	prefetch?: PrefetchConfig;
	rel?: string;
	replace?: boolean;
	revalidate?: boolean;
	scroll?: boolean;
	search?: Record<string, unknown>;
	shallow?: boolean;
	style?: JSX.CSSProperties | string;
	target?: string;
	to?: string;
	viewTransition?: ViewTransitionConfig;
}

const DANGEROUS_PROTOCOLS = ["javascript:", "data:", "blob:", "vbscript:"];
const LEADING_WHITESPACE_RE = /^[\s\u00A0\u200B\uFEFF\u2028\u2029]+/;

function isDangerousHref(href: string): boolean {
	const stripped = href.replace(LEADING_WHITESPACE_RE, "").toLowerCase();
	let decoded = stripped;
	try {
		decoded = decodeURIComponent(stripped);
	} catch {
		/* malformed percent-encoding — check raw only */
	}
	return DANGEROUS_PROTOCOLS.some((p) => stripped.startsWith(p) || decoded.startsWith(p));
}

export function Link<TPath extends RoutePaths>(props: LinkProps<TPath>): JSX.Element {
	const ctx = useRouterContext();

	const local = props as unknown as LinkPropsInternal;
	const rest = omit(
		local,
		"activeClass",
		"activeProps",
		"children",
		"class",
		"disabled",
		"force",
		"hash",
		"href",
		"inactiveClass",
		"inactiveProps",
		"isActive",
		"params",
		"prefetch",
		"rel",
		"replace",
		"revalidate",
		"scroll",
		"search",
		"shallow",
		"style",
		"target",
		"to",
		"viewTransition",
	);

	const internalHref = createMemo(() => {
		if (local.href !== undefined) return undefined;
		return buildUrl({
			hash: local.hash,
			params: local.params,
			search: local.search,
			to: local.to ?? "",
		});
	});

	const resolvedHref = createMemo(() => {
		if (local.href !== undefined) {
			if (isDangerousHref(local.href)) return "#";
			return local.href;
		}
		const raw = internalHref() ?? "";
		if (isDangerousHref(raw)) return "#";
		return applyRewriteOutput(raw);
	});

	const effectiveRel = createMemo(() => {
		if (local.rel) return local.rel;
		if (local.target === "_blank") return "noopener noreferrer";
		return undefined;
	});

	const routePrefetch = createMemo(() => {
		if (local.href !== undefined) return undefined;
		const h = internalHref();
		if (!h || isExternal(h)) return undefined;
		try {
			const url = new URL(h, typeof window !== "undefined" ? window.location.href : "http://localhost/");
			const match = matchRoute(ctx.routeTree, url.pathname, ctx.caseSensitive, toLocaleMatch(ctx.localeConfig));
			return match?.route.o.client?.prefetch;
		} catch {
			return undefined;
		}
	});

	/* When each part of the target route loads. "all" belongs to the app-wide idle prefetch;
	   on a constrained connection that is off, so links warm modules when visible instead. */
	const prefetchTriggers = createMemo((): { data: PrefetchTrigger; modules: PrefetchTrigger } => {
		if (local.href !== undefined) return { data: false, modules: false };
		const resolved = resolvePrefetch({
			link: local.prefetch,
			route: routePrefetch(),
			router: ctx.routerPrefetch,
			routerLegacy: ctx.routerCacheDefaults?.prefetch,
		});
		const modules = resolved.modules === "all" ? (constrainedConnection() ? "viewport" : false) : resolved.modules;
		return { data: resolved.data, modules };
	});

	const active = createMemo(() => {
		if (local.href !== undefined) return false;
		if (local.isActive) {
			return local.isActive(ctx.location());
		}
		try {
			const url = new URL(resolvedHref(), typeof window !== "undefined" ? window.location.href : "http://localhost/");
			return url.pathname === ctx.location().pathname;
		} catch {
			return false;
		}
	});

	const stateProps = createMemo(() => (active() ? local.activeProps : local.inactiveProps));

	const classes = createMemo(() => {
		const result: string[] = [];
		if (typeof local.class === "string") result.push(local.class);
		const sp = stateProps();
		if (typeof sp?.class === "string") result.push(sp.class);
		if (active()) {
			if (local.activeClass) result.push(local.activeClass);
		} else {
			if (local.inactiveClass) result.push(local.inactiveClass);
		}
		return result.length > 0 ? result.join(" ") : undefined;
	});

	const mergedStyle = createMemo((): JSX.CSSProperties | string | undefined => {
		const spStyle = stateProps()?.style;
		if (!spStyle) return local.style || undefined;
		if (!local.style) return spStyle || undefined;
		if (typeof local.style === "object" && typeof spStyle === "object") {
			return { ...local.style, ...spStyle };
		}
		if (typeof local.style === "string" && typeof spStyle === "string") {
			return `${local.style};${spStyle}`;
		}
		return spStyle;
	});

	const stateAttrs = createMemo(() => {
		const sp = stateProps();
		if (!sp) return undefined;
		const { class: _cls, style: _sty, ...attrs } = sp;
		return Object.keys(attrs).length > 0 ? attrs : undefined;
	});

	function handleClick(event: MouseEvent): void {
		if (local.disabled) {
			event.preventDefault();
			return;
		}

		if (event.defaultPrevented) return;

		const h = resolvedHref();
		if (isExternal(h)) return;
		if (event.button !== 0) return;
		if (event.metaKey || event.ctrlKey) return;
		if (event.shiftKey) return;
		if (event.altKey) return;
		if (local.target && local.target !== "_self") return;

		/* Allow native download behavior */
		const el = event.currentTarget as HTMLAnchorElement;
		if (el.hasAttribute("download")) return;

		event.preventDefault();

		if (
			!local.force &&
			typeof window !== "undefined" &&
			h === window.location.pathname + window.location.search + window.location.hash
		) {
			return;
		}

		let to = local.to ?? "";
		let hash = local.hash;
		if (!local.to && local.href !== undefined) {
			try {
				const url = new URL(h, typeof window !== "undefined" ? window.location.href : "http://localhost/");
				to = url.pathname + url.search;
				hash = hash ?? (url.hash || undefined);
			} catch {
				to = h;
			}
		}

		navigate({
			hash,
			params: local.params,
			replace: local.replace,
			revalidate: local.revalidate,
			scroll: local.scroll,
			search: local.search,
			shallow: local.shallow,
			to,
			viewTransition: local.viewTransition,
		});
	}

	/* Data always brings the route's modules; modules alone never touch the server. */
	function triggerPrefetch(modulesOnly: boolean): void {
		if (local.disabled) return;
		if (local.href !== undefined) return;
		const h = resolvedHref();
		if (isExternal(h)) return;
		/* params + search already resolved into h by resolvedHref() — passing them again would double-apply. */
		prefetch(modulesOnly ? { modulesOnly: true, to: h } : { to: h });
	}

	function fire(event: PrefetchTrigger): void {
		const t = prefetchTriggers();
		if (t.data === event) triggerPrefetch(false);
		else if (t.modules === event) triggerPrefetch(true);
	}

	function handleIntent(): void {
		fire("intent");
	}

	/* Capture the element; attach listeners in createEffect so cleanup is owned. */
	const [anchor, setAnchor] = createSignal<HTMLAnchorElement | undefined>();

	createEffect(
		() => {
			const el = anchor();
			const t = prefetchTriggers();
			const href = resolvedHref();
			return {
				data: t.data,
				disabled: !!local.disabled,
				el,
				external: isExternal(href),
				hrefOnly: local.href !== undefined,
				modules: t.modules,
			};
		},
		({ data, disabled, el, external, hrefOnly, modules }) => {
			if (!el || disabled || hrefOnly || external) return undefined;
			const uses = (event: PrefetchTrigger) => data === event || modules === event;
			const cleanups: Array<() => void> = [];

			if (uses("intent")) {
				el.addEventListener("focus", handleIntent);
				el.addEventListener("touchstart", handleIntent, { passive: true });
				cleanups.push(() => {
					el.removeEventListener("focus", handleIntent);
					el.removeEventListener("touchstart", handleIntent);
				});
			}

			if (uses("viewport")) {
				let observer: IntersectionObserver | undefined;
				const cancel = scheduleAfterLoad(() => {
					if (typeof IntersectionObserver === "undefined") return;
					observer = new IntersectionObserver(
						(entries) => {
							for (const entry of entries) {
								if (entry.isIntersecting) {
									fire("viewport");
									observer?.unobserve(entry.target);
								}
							}
						},
						{ threshold: 0 },
					);
					observer.observe(el);
				});
				cleanups.push(() => {
					cancel();
					observer?.disconnect();
				});
			}

			if (uses("render")) {
				cleanups.push(scheduleAfterLoad(() => fire("render")));
			}

			return cleanups.length > 0 ? () => cleanups.forEach((c) => c()) : undefined;
		},
	);

	function disabledStyle(): JSX.CSSProperties | string {
		if (typeof local.style === "string") return `cursor:not-allowed;${local.style}`;
		if (local.style) return { cursor: "not-allowed", ...local.style };
		return "cursor:not-allowed";
	}

	return (
		<Show
			fallback={
				<span {...rest} aria-disabled="true" class={classes()} style={disabledStyle()} tabindex={-1}>
					{local.children}
				</span>
			}
			when={!local.disabled}
		>
			<a
				{...rest}
				{...(stateAttrs() ?? {})}
				{...(classes() ? { class: classes() } : {})}
				{...(mergedStyle() ? { style: mergedStyle() } : {})}
				aria-current={active() ? "page" : undefined}
				href={resolvedHref()}
				onClick={handleClick}
				onMouseEnter={handleIntent}
				ref={setAnchor}
				rel={effectiveRel()}
				target={local.target}
			>
				{local.children}
			</a>
		</Show>
	) as JSX.Element;
}
