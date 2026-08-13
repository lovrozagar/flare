/**
 * Flare Link Component
 * SPA navigation with prefetch strategies and active state detection.
 * Same component runs on server AND client - structure must match for hydration.
 *
 * @example
 * // Basic navigation
 * <Link to="/products/[id]" params={{ id: "123" }}>Product</Link>
 *
 * // With optional locale
 * <Link to="/[[locale]]/compare" params={{ locale: "en" }}>Compare</Link>
 *
 * // With styling
 * <Link to="/about" activeClass="font-bold" activeTw="text-blue-500">About</Link>
 */

import { createEffect, createMemo, createSignal, type JSX, onCleanup, splitProps } from "solid-js"
import type { ViewTransitionConfig } from "../../client/view-transitions/types"
import type { NavFormat } from "../../server/handler/constants"
import type { PrefetchStrategy } from "../_internal/types"
import { buildUrl } from "../build-url"

/**
 * Anchor attributes to forward (excludes conflicting props)
 */
type AnchorAttributes = Omit<
	JSX.AnchorHTMLAttributes<HTMLAnchorElement>,
	"href" | "onClick" | "class" | "children"
>

export interface LinkProps extends AnchorAttributes {
	/* Navigation */
	/** Route path pattern (variablePath format) */
	to: string
	/** Route params to fill path placeholders */
	params?: Record<string, string | string[] | undefined>
	/** Search/query params */
	search?: Record<string, unknown>
	/** URL hash (without #) */
	hash?: string

	/* Behavior */
	/** Use replaceState instead of pushState */
	replace?: boolean
	/** Scroll to top after navigation (default: true) */
	scroll?: boolean
	/** Update URL without fetching data */
	shallow?: boolean
	/** Force navigation even if URL matches current */
	force?: boolean
	/** Prefetch strategy: false, "hover", or "viewport" */
	prefetch?: PrefetchStrategy
	/** Navigation format for data fetching */
	navFormat?: NavFormat
	/** View transition configuration */
	viewTransition?: ViewTransitionConfig
	/** Render as disabled span instead of anchor */
	disabled?: boolean

	/* Children */
	children?: JSX.Element

	/* Base styling */
	/** CSS class */
	class?: string
	/** Inline CSS string */
	css?: string
	/** Tailwind classes */
	tw?: string

	/* Active styling (when link matches current route) */
	/** CSS class when active */
	activeClass?: string
	/** Inline CSS string when active */
	activeCss?: string
	/** Tailwind classes when active */
	activeTw?: string

	/* Inactive styling (when link doesn't match current route) */
	/** CSS class when inactive */
	inactiveClass?: string
	/** Inline CSS string when inactive */
	inactiveCss?: string
	/** Tailwind classes when inactive */
	inactiveTw?: string
}

export function isLinkProps(value: unknown): value is LinkProps {
	if (typeof value !== "object" || value === null) {
		return false
	}

	const obj = value as Record<string, unknown>

	if (typeof obj.to !== "string") {
		return false
	}

	return true
}

export function createLinkProps(props: LinkProps): LinkProps & { prefetch: PrefetchStrategy } {
	return {
		...props,
		prefetch: props.prefetch ?? "hover",
	}
}

/**
 * Router interface for Link component.
 * Optional to allow standalone usage without full router.
 */
interface LinkRouter {
	navigate: (options: {
		hash?: string
		navFormat?: NavFormat
		params?: Record<string, string | string[] | undefined>
		replace?: boolean
		scroll?: boolean
		search?: Record<string, unknown>
		shallow?: boolean
		to: string
		viewTransition?: ViewTransitionConfig
	}) => Promise<void>
	prefetch: (options: {
		navFormat?: NavFormat
		params?: Record<string, string | string[] | undefined>
		to: string
	}) => Promise<void>
	state: {
		location: {
			pathname: string
		}
	}
}

/**
 * Router context for Link.
 * Uses globalThis singleton so SSR and client builds share the same instance.
 * Set via setLinkRouter() during client initialization.
 */
const LINK_ROUTER_KEY = "__FLARE_LINK_ROUTER__"

function getLinkRouterInternal(): LinkRouter | null {
	return (globalThis as Record<string, unknown>)[LINK_ROUTER_KEY] as LinkRouter | null
}

export function setLinkRouter(router: LinkRouter | null): void {
	;(globalThis as Record<string, unknown>)[LINK_ROUTER_KEY] = router
}

export function getLinkRouter(): LinkRouter | null {
	return getLinkRouterInternal()
}

/**
 * Link component - unified for SSR and client hydration.
 * Same structure on both sides for correct hydration.
 */
export function Link(props: LinkProps): JSX.Element {
	const linkRouter = getLinkRouterInternal()

	const [local, anchorProps] = splitProps(props, [
		"activeClass",
		"activeCss",
		"activeTw",
		"children",
		"class",
		"css",
		"disabled",
		"force",
		"hash",
		"inactiveClass",
		"inactiveCss",
		"inactiveTw",
		"navFormat",
		"params",
		"prefetch",
		"replace",
		"scroll",
		"search",
		"shallow",
		"to",
		"tw",
		"viewTransition",
	])

	const href = createMemo(() =>
		buildUrl({
			hash: local.hash,
			params: local.params,
			search: local.search,
			to: local.to,
		}),
	)

	const isActive = createMemo(() => {
		if (!linkRouter) return false
		const currentPath = linkRouter.state.location.pathname
		const resolvedHref = href()
		return currentPath === resolvedHref || currentPath.startsWith(`${resolvedHref}/`)
	})

	const computedClass = createMemo(() => {
		const classes: string[] = []

		/* Base classes */
		if (local.class) classes.push(local.class)
		if (local.tw) classes.push(local.tw)

		/* Active/inactive classes */
		if (isActive()) {
			if (local.activeClass) classes.push(local.activeClass)
			if (local.activeTw) classes.push(local.activeTw)
		} else {
			if (local.inactiveClass) classes.push(local.inactiveClass)
			if (local.inactiveTw) classes.push(local.inactiveTw)
		}

		/* Always return string to ensure SSR/client parity - undefined would cause hydration mismatch */
		return classes.join(" ")
	})

	const computedStyle = createMemo(() => {
		const styles: string[] = []

		/* Base CSS */
		if (local.css) styles.push(local.css)

		/* Active/inactive CSS */
		if (isActive()) {
			if (local.activeCss) styles.push(local.activeCss)
		} else {
			if (local.inactiveCss) styles.push(local.inactiveCss)
		}

		return styles.length > 0 ? styles.join("; ") : undefined
	})

	const [hasPrefetched, setHasPrefetched] = createSignal(false)

	let elementRef: HTMLAnchorElement | undefined

	createEffect(() => {
		if (local.prefetch !== "viewport" || !elementRef || !linkRouter || hasPrefetched()) {
			return
		}
		if (typeof IntersectionObserver === "undefined") {
			return
		}

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0]
				if (entry?.isIntersecting && !hasPrefetched()) {
					setHasPrefetched(true)
					linkRouter?.prefetch({ navFormat: local.navFormat, to: local.to }).catch(() => {})
					observer.disconnect()
				}
			},
			{ rootMargin: "100px" },
		)

		observer.observe(elementRef)
		onCleanup(() => observer.disconnect())
	})

	const handleMouseEnter = () => {
		if (local.prefetch === "hover" && linkRouter && !hasPrefetched()) {
			setHasPrefetched(true)
			linkRouter.prefetch({ navFormat: local.navFormat, to: local.to }).catch(() => {})
		}
	}

	const handleClick: JSX.EventHandlerUnion<HTMLAnchorElement, MouseEvent> = (e) => {
		if (local.disabled) {
			e.preventDefault()
			return
		}
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
			return
		}

		e.preventDefault()

		if (linkRouter && !local.force) {
			const resolvedHref = href()
			const currentFull =
				typeof window !== "undefined"
					? window.location.pathname + window.location.search + window.location.hash
					: linkRouter.state.location.pathname
			if (currentFull === resolvedHref) {
				return
			}
		}

		if (linkRouter) {
			linkRouter
				.navigate({
					hash: local.hash,
					navFormat: local.navFormat,
					params: local.params,
					replace: local.replace,
					scroll: local.scroll,
					search: local.search,
					shallow: local.shallow,
					to: local.to,
					viewTransition: local.viewTransition,
				})
				.catch(() => {})
		}
	}

	if (local.disabled) {
		const disabledStyle = computedStyle()
		return (
			<span
				aria-disabled="true"
				class={computedClass()}
				role="link"
				style={disabledStyle ? `cursor:not-allowed;${disabledStyle}` : "cursor:not-allowed"}
				tabIndex={-1}
			>
				{local.children}
			</span>
		)
	}

	return (
		<a
			{...anchorProps}
			class={computedClass()}
			href={href()}
			onClick={handleClick}
			onMouseEnter={handleMouseEnter}
			ref={elementRef}
			style={computedStyle()}
		>
			{local.children}
		</a>
	)
}

export type { PrefetchStrategy }
