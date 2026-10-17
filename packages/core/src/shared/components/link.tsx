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
	RouterContext,
	type NavigateOptions,
	type NavigateTo,
} from "../router/context.ts"
import { rewriteLocation, type Router } from "../router/create-router.ts"
import { buildUrl, href as checkHref, readSearch, routeHref, type Location } from "../url/index.ts"

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
	const router = useContext(RouterContext)
	const url = createMemo(() => (props.to === undefined ? linkHref(props.href) : internalHref(props, props.to, router)))
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
		// A link to the browser's own URL stays put unless its hash moves the page (BUGS.md 148, 292). The router's
		// location still names the page left during a Back or Forward, until the step commits (BUGS.md 296).
		if (props.force !== true && !props.hash && !window.location.hash && sameUrl(url(), window.location)) return
		void navigate({ ...pick(props), to: props.to })
	}
	return createComponent(
		Dynamic,
		merge(omit(props, ...OWN), () => stateProps(props, active()), ownAttributes(props, active), {
			component: "a",
			ref: (anchor: HTMLAnchorElement) => void (element = anchor),
			onClick,
			get href() {
				return url()
			},
			get children() {
				return props.children
			},
		}),
	)
}

// The state's own attributes, `activeProps` or `inactiveProps`.
function stateProps(props: AnyLinkProps, active: boolean): Record<string, unknown> {
	return Object((active ? props.activeProps : props.inactiveProps) ?? {})
}

// The attributes Link writes itself. One Link leaves unset falls back to the state's own, and the state's class joins
// Link's classes (BUGS.md 306).
function ownAttributes(props: AnyLinkProps, active: () => boolean): Record<string, unknown> {
	const stated = (name: string): unknown => stateProps(props, active())[name]
	return {
		get class() {
			const classes = [props.class, active() ? props.activeClass : props.inactiveClass, stated("class")]
			const present = classes.filter(Boolean)
			return present.length === 0 ? undefined : present.join(" ")
		},
		get rel() {
			return props.rel ?? stated("rel") ?? (props.target === "_blank" ? "noopener noreferrer" : undefined)
		},
		get "aria-current"() {
			return active() ? "page" : stated("aria-current")
		},
		get "aria-disabled"() {
			return props.disabled === true ? "true" : stated("aria-disabled")
		},
		get tabindex() {
			return props.disabled === true ? -1 : stated("tabindex")
		},
	}
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

// The route's URL as the router writes it: under its base, with its trailing-slash rule (plan 21 3.7, 3.9).
function internalHref(props: AnyLinkProps, to: string, router: Router): string {
	const path = buildUrl({ to, params: props.params, search: withoutInternalKeys(props.search), hash: props.hash })
	return routeHref(router, path)
}

// Schemes the browser hands to another app, carrying no script (BUGS.md 310).
const HANDED_OFF = /^(?:mailto|tel|sms):/i

// Link's own href classification (BUGS.md 310). A `mailto:`, `tel:`, or `sms:` link renders as written, and so does a
// `#fragment`, an in-page anchor. A path or an http(s) URL is `href()`'s to check. A relative path, a bare `?query`, or
// "" cannot resolve alike on the server and the client: `#`, and a throw in dev pointing to `to`. Anything else,
// `javascript:` say, is `#`. `redirect({ href })` keeps `href()`'s rule alone.
function linkHref(text: string | undefined): string {
	// A Link with neither `to` nor `href`, a type error, is `#`.
	if (text === undefined) return "#"
	if (HANDED_OFF.test(text) || text.startsWith("#")) return text
	if (import.meta.env?.DEV && !text.startsWith("/") && !/^[^/?#]*:/.test(text)) {
		throw new Error(`Link href ${JSON.stringify(text)} is relative: use \`to\` for a page, or an absolute path`)
	}
	try {
		return checkHref(text)
	} catch {
		return "#"
	}
}

// The default compares the exact pathname and the search as a multiset of pairs. The hash is not compared.
function isActive(props: AnyLinkProps, href: string, location: Location): boolean {
	return props.isActive
		? props.isActive({ pathname: location.pathname, search: readSearch(location.search) })
		: sameUrl(href, location)
}

// The link's own URL is the location: the same pathname, and the same search as a multiset of pairs.
function sameUrl(href: string, location: Location): boolean {
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
