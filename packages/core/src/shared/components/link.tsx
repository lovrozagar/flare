/// <reference types="vite/client" />
import { createComponent, createEffect, createMemo, merge, omit, untrack, useContext } from "solid-js"
import { Dynamic, type JSX } from "@solidjs/web"
import { withoutInternalKeys } from "../protocol/index.ts"
import type { RoutePrefetch } from "../route-builder/index.ts"
import type { FlareRegister, RouteTarget, To } from "../route-builder/register.ts"
import {
	LocationContext,
	NavigateContext,
	PrefetchContext,
	type NavigateOptions,
	type NavigateTo,
} from "../router/context.ts"
import { rewriteLocation, type Router } from "../router/create-router.ts"
import { buildUrl, href as checkHref, readSearch, type Location } from "../url/index.ts"

type Anchor = JSX.AnchorHTMLAttributes<HTMLAnchorElement> & { [data: `data-${string}`]: string | undefined }

type Click = MouseEvent & { currentTarget: HTMLAnchorElement }

type Own = Omit<Anchor, "href" | "onClick"> & {
	prefetch?: RoutePrefetch
	activeClass?: string
	inactiveClass?: string
	activeProps?: Anchor
	inactiveProps?: Anchor
	isActive?: (location: { pathname: string; search: Record<string, string | string[]> }) => boolean
	disabled?: boolean
	force?: boolean
	onClick?: (event: Click) => void
	children: JSX.Element
}

// An internal link has `to`, a page id whose params and search are that route's (dx/types.md). An external link has
// `href` and no `to` (dx/link.md).
export type LinkProps<Id extends To<FlareRegister> = To<FlareRegister>> = Own &
	NavigateOptions &
	(
		| (RouteTarget<FlareRegister, Id> & { href?: never })
		| { href: string; to?: never; params?: never; search?: never; hash?: never; replace?: never }
	)

// What the body reads. The typed signature above it is the public one.
type AnyLinkProps = Own & Omit<NavigateTo, "to"> & { to?: string | undefined; href?: string | undefined }

const OWN = [
	"to",
	"href",
	"params",
	"search",
	"hash",
	"prefetch",
	"replace",
	"revalidate",
	"scroll",
	"shallow",
	"state",
	"viewTransition",
	"activeClass",
	"inactiveClass",
	"activeProps",
	"inactiveProps",
	"isActive",
	"disabled",
	"force",
	"onClick",
	"class",
	"rel",
	"children",
] as const

// The public `Link` is generic on the page id. It is one declaration, not an overload: Solid's dev refresh rewrites a
// component function into a `const`, and an overload signature beside it would then be declared twice.
export const Link: <Id extends To<FlareRegister>>(props: LinkProps<Id>) => JSX.Element = anchor

// An anchor in every render. In the browser a click on an internal link navigates on the client, and the link
// prefetches by its `prefetch` setting. An external or dangerous href never prefetches (B84).
function anchor(props: AnyLinkProps): JSX.Element {
	rejectAll(props.prefetch)
	const location = useContext(LocationContext)
	const navigate = useContext(NavigateContext)
	const prefetcher = useContext(PrefetchContext)
	const url = createMemo(() => (props.to === undefined ? safeHref(props.href) : internalHref(props, props.to)))
	const active = createMemo(() => props.to !== undefined && isActive(props, url(), location()))
	let element: HTMLAnchorElement | undefined
	createEffect(
		() => (props.to !== undefined && props.disabled !== true ? url() : undefined),
		(href) => {
			const anchor = element
			if (href === undefined || anchor === undefined) return undefined
			// The watch reads the location on screen once. It is not a dependency of this effect.
			return untrack(() => prefetcher?.watch(anchor, href, props.prefetch))
		},
	)
	const onClick = (event: Click): void => {
		props.onClick?.(event)
		if (props.disabled === true || (props.to === undefined && url() === "#")) return event.preventDefault()
		if (props.to === undefined || navigate === null || !followable(event, event.currentTarget)) return
		event.preventDefault()
		if (active() && props.force !== true && (props.hash ?? "") === location().hash.replace(/^#/, "")) return
		void navigate({ ...pick(props), to: props.to })
	}
	return createComponent(
		Dynamic,
		merge(omit(props, ...OWN), () => (active() ? props.activeProps : props.inactiveProps) ?? {}, {
			component: "a",
			ref: (anchor: HTMLAnchorElement) => void (element = anchor),
			onClick,
			get href() {
				return url()
			},
			get class() {
				const classes = [props.class, active() ? props.activeClass : props.inactiveClass].filter(Boolean)
				return classes.length === 0 ? undefined : classes.join(" ")
			},
			get rel() {
				return props.rel ?? (props.target === "_blank" ? "noopener noreferrer" : undefined)
			},
			get "aria-current"() {
				return active() ? "page" : undefined
			},
			get "aria-disabled"() {
				return props.disabled === true ? "true" : undefined
			},
			get tabindex() {
				return props.disabled === true ? -1 : undefined
			},
			get children() {
				return props.children
			},
		}),
	)
}

// A same-origin anchor that matches a route is followed like `Link` (B84). `visit` is the client navigator's.
export function delegateClicks(
	root: Document,
	deps: { router: Router; origin: string; visit: (url: string) => void },
): () => void {
	const listener = (event: MouseEvent): void => {
		const anchor = event.target instanceof Element ? event.target.closest("a") : null
		const href = anchor?.getAttribute("href")
		if (anchor === null || typeof href !== "string" || !followable(event, anchor)) return
		const url = new URL(href, root.baseURI)
		if (url.origin !== deps.origin) return
		// The rewrite runs once, before the route check. A throw fails the click and leaves the URL (B17).
		let location: Location
		try {
			location = rewriteLocation(
				deps.router,
				{ pathname: url.pathname, search: url.search, hash: url.hash },
				deps.origin,
			)
		} catch (error) {
			event.preventDefault()
			throw error
		}
		if (deps.router.match(location.pathname).id === undefined) return
		event.preventDefault()
		deps.visit(`${location.pathname}${location.search}${location.hash}`)
	}
	root.addEventListener("click", listener)
	return () => root.removeEventListener("click", listener)
}

// The browser keeps a non-primary button, a modifier key, another target, a download, an external rel, an
// opt-out, and a click something else already handled.
function followable(event: MouseEvent, anchor: Element): boolean {
	if (event.defaultPrevented || event.button !== 0) return false
	if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
	const target = anchor.getAttribute("target")
	if (target !== null && target !== "" && target !== "_self") return false
	if (anchor.hasAttribute("download") || anchor.hasAttribute("data-flare-skip")) return false
	return !(anchor.getAttribute("rel") ?? "").split(/\s+/).includes("external")
}

// `modules: "all"` is the router's alone. The type rejects it, and a cast throws in dev (B64).
function rejectAll(prefetch: RoutePrefetch | undefined): void {
	const modules: unknown = typeof prefetch === "object" ? prefetch.modules : undefined
	if (import.meta.env?.DEV && modules === "all") throw new Error('Link prefetch cannot use modules: "all"')
}

function internalHref(props: AnyLinkProps, to: string): string {
	return buildUrl({ to, params: props.params, search: withoutInternalKeys(props.search), hash: props.hash })
}

// A dangerous scheme renders `#` instead of throwing (dx/link.md).
function safeHref(value: string | undefined): string {
	try {
		return checkHref(value ?? "")
	} catch {
		return "#"
	}
}

// The default compares the exact pathname and the search as a multiset of pairs. The hash is not compared.
function isActive(props: AnyLinkProps, href: string, location: Location): boolean {
	if (props.isActive !== undefined) {
		return props.isActive({ pathname: location.pathname, search: readSearch(location.search) })
	}
	const url = new URL(href, "http://flare.invalid")
	return url.pathname === location.pathname && pairs(url.search) === pairs(location.search)
}

function pairs(search: string): string {
	return JSON.stringify([...new URLSearchParams(search)].map((pair) => JSON.stringify(pair)).sort())
}

function pick(props: AnyLinkProps): Omit<NavigateTo, "to"> {
	return {
		params: props.params,
		search: props.search,
		hash: props.hash,
		replace: props.replace,
		revalidate: props.revalidate,
		scroll: props.scroll,
		shallow: props.shallow,
		state: props.state,
		viewTransition: props.viewTransition,
	}
}
