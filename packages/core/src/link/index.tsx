import { createMemo, type JSX, onCleanup, Show, splitProps } from "solid-js"
import { applyRewriteOutput, isExternal, navigate, prefetch } from "../navigation/index.ts"
import { useRouterContext } from "../outlet/index.tsx"
import type { RouteParamsProps, RoutePaths, RouteSearchProps } from "../route-builder/register.ts"
import { matchRoute, toLocaleMatch } from "../router-primitives/index.ts"
import { buildUrl } from "../url/index.ts"

export type PrefetchStrategy = false | "intent" | "render" | "viewport"

export type FlareAnchorProps = Omit<
	JSX.AnchorHTMLAttributes<HTMLAnchorElement>,
	"children" | "href"
>

type InternalLinkProps<TPath extends RoutePaths = RoutePaths> = FlareAnchorProps & {
	activeClass?: string
	activeProps?: FlareAnchorProps
	children: JSX.Element
	disabled?: boolean
	force?: boolean
	hash?: string
	href?: never
	inactiveClass?: string
	inactiveProps?: FlareAnchorProps
	isActive?: (location: { pathname: string }) => boolean
	prefetch?: PrefetchStrategy
	replace?: boolean
	revalidate?: boolean
	scroll?: boolean
	shallow?: boolean
	to: TPath
	viewTransition?: boolean | { types: string[] }
} & RouteParamsProps<TPath> &
	RouteSearchProps<TPath>

export type ExternalLinkProps = FlareAnchorProps & {
	children: JSX.Element
	disabled?: boolean
	href: string
	to?: never
}

export type LinkProps<TPath extends RoutePaths = RoutePaths> =
	| InternalLinkProps<TPath>
	| ExternalLinkProps

/* Flattened internal type for splitProps — avoids TS intersection issues with Omit */
interface LinkPropsInternal {
	activeClass?: string
	activeProps?: FlareAnchorProps
	children: JSX.Element
	class?: string
	disabled?: boolean
	force?: boolean
	hash?: string
	href?: string
	inactiveClass?: string
	inactiveProps?: FlareAnchorProps
	isActive?: (location: { pathname: string }) => boolean
	params?: Record<string, unknown>
	prefetch?: PrefetchStrategy
	rel?: string
	replace?: boolean
	revalidate?: boolean
	scroll?: boolean
	search?: Record<string, unknown>
	shallow?: boolean
	style?: JSX.CSSProperties | string
	target?: string
	to?: string
	viewTransition?: boolean | { types: string[] }
}

const DANGEROUS_PROTOCOLS = ["javascript:", "data:", "blob:", "vbscript:"]
const LEADING_WHITESPACE_RE = /^[\s\u00A0\u200B\uFEFF\u2028\u2029]+/

function isDangerousHref(href: string): boolean {
	const stripped = href.replace(LEADING_WHITESPACE_RE, "").toLowerCase()
	let decoded = stripped
	try {
		decoded = decodeURIComponent(stripped)
	} catch {
		/* malformed percent-encoding — check raw only */
	}
	return DANGEROUS_PROTOCOLS.some((p) => stripped.startsWith(p) || decoded.startsWith(p))
}

export function Link<TPath extends RoutePaths>(props: LinkProps<TPath>): JSX.Element {
	const ctx = useRouterContext()

	const [local, rest] = splitProps(props as unknown as LinkPropsInternal, [
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
	])

	const resolvedHref = createMemo(() => {
		if (local.href !== undefined) {
			if (isDangerousHref(local.href)) return "#"
			return local.href
		}
		const raw = buildUrl({
			hash: local.hash,
			params: local.params,
			search: local.search,
			to: local.to ?? "",
		})
		if (isDangerousHref(raw)) return "#"
		return applyRewriteOutput(raw)
	})

	const effectiveRel = createMemo(() => {
		if (local.rel) return local.rel
		if (local.target === "_blank") return "noopener noreferrer"
		return undefined
	})

	const routePrefetch = createMemo(() => {
		if (local.href !== undefined) return undefined
		const h = resolvedHref()
		if (isExternal(h)) return undefined
		try {
			const url = new URL(
				h,
				typeof window !== "undefined" ? window.location.href : "http://localhost/",
			)
			const match = matchRoute(
					ctx.routeTree,
					url.pathname,
					ctx.caseSensitive,
					toLocaleMatch(ctx.localeConfig),
				)
			return match?.route.o.client?.prefetch
		} catch {
			return undefined
		}
	})

	const effectivePrefetch = createMemo(() => {
		if (local.href !== undefined) return false
		return local.prefetch ?? routePrefetch() ?? ctx.routerCacheDefaults?.prefetch ?? false
	})

	const active = createMemo(() => {
		if (local.href !== undefined) return false
		if (local.isActive) {
			return local.isActive(ctx.location())
		}
		try {
			const url = new URL(
				resolvedHref(),
				typeof window !== "undefined" ? window.location.href : "http://localhost/",
			)
			return url.pathname === ctx.location().pathname
		} catch {
			return false
		}
	})

	const stateProps = createMemo(() => (active() ? local.activeProps : local.inactiveProps))

	const classes = createMemo(() => {
		const result: string[] = []
		if (typeof local.class === "string") result.push(local.class)
		const sp = stateProps()
		if (typeof sp?.class === "string") result.push(sp.class)
		if (active()) {
			if (local.activeClass) result.push(local.activeClass)
		} else {
			if (local.inactiveClass) result.push(local.inactiveClass)
		}
		return result.length > 0 ? result.join(" ") : undefined
	})

	const mergedStyle = createMemo((): JSX.CSSProperties | string | undefined => {
		const spStyle = stateProps()?.style
		if (!spStyle) return local.style || undefined
		if (!local.style) return spStyle || undefined
		if (typeof local.style === "object" && typeof spStyle === "object") {
			return { ...local.style, ...spStyle }
		}
		if (typeof local.style === "string" && typeof spStyle === "string") {
			return `${local.style};${spStyle}`
		}
		return spStyle
	})

	const stateAttrs = createMemo(() => {
		const sp = stateProps()
		if (!sp) return undefined
		const { class: _cls, style: _sty, ...attrs } = sp
		return Object.keys(attrs).length > 0 ? attrs : undefined
	})

	function handleClick(event: MouseEvent): void {
		if (local.disabled) {
			event.preventDefault()
			return
		}

		if (event.defaultPrevented) return

		const h = resolvedHref()
		if (isExternal(h)) return
		if (event.button !== 0) return
		if (event.metaKey || event.ctrlKey) return
		if (event.shiftKey) return
		if (event.altKey) return
		if (local.target && local.target !== "_self") return

		/* Allow native download behavior */
		const el = event.currentTarget as HTMLAnchorElement
		if (el.hasAttribute("download")) return

		event.preventDefault()

		if (
			!local.force &&
			typeof window !== "undefined" &&
			h === window.location.pathname + window.location.search + window.location.hash
		) {
			return
		}

		navigate({
			hash: local.hash,
			params: local.params,
			replace: local.replace,
			revalidate: local.revalidate,
			scroll: local.scroll,
			search: local.search,
			shallow: local.shallow,
			to: local.to ?? "",
			viewTransition: local.viewTransition,
		})
	}

	function triggerPrefetch(): void {
		if (local.disabled) return
		if (local.href !== undefined) return
		const h = resolvedHref()
		if (isExternal(h)) return
		/* params + search already resolved into h by resolvedHref() — passing them again would double-apply */
		prefetch({ to: h })
	}

	function handleIntent(): void {
		if (effectivePrefetch() === "intent") triggerPrefetch()
	}

	function scheduleAfterLoad(fn: () => void): () => void {
		let cancelled = false
		let idleId: number | undefined
		let timeoutId: ReturnType<typeof setTimeout> | undefined

		const run = () => {
			if (!cancelled) fn()
		}

		const armIdle = () => {
			if (cancelled) return
			if (typeof requestIdleCallback === "function") {
				idleId = requestIdleCallback(run)
			} else {
				timeoutId = setTimeout(run, 0)
			}
		}

		if (typeof document !== "undefined" && document.readyState === "complete") {
			armIdle()
		} else if (typeof window !== "undefined") {
			addEventListener("load", armIdle, { once: true })
		} else {
			armIdle()
		}

		return () => {
			cancelled = true
			if (typeof window !== "undefined") removeEventListener("load", armIdle)
			if (idleId !== undefined && typeof cancelIdleCallback === "function") {
				cancelIdleCallback(idleId)
			}
			if (timeoutId !== undefined) clearTimeout(timeoutId)
		}
	}

	function setupPrefetchBehavior(el: HTMLAnchorElement): void {
		if (local.href !== undefined) return
		if (isExternal(resolvedHref())) return

		const strategy = effectivePrefetch()

		if (strategy === "intent") {
			el.addEventListener("focus", handleIntent)
			el.addEventListener("touchstart", handleIntent, { passive: true })
			onCleanup(() => {
				el.removeEventListener("focus", handleIntent)
				el.removeEventListener("touchstart", handleIntent)
			})
		}

		if (strategy === "viewport") {
			let observer: IntersectionObserver | undefined
			const cancel = scheduleAfterLoad(() => {
				if (typeof IntersectionObserver === "undefined") return
				observer = new IntersectionObserver(
					(entries) => {
						for (const entry of entries) {
							if (entry.isIntersecting) {
								triggerPrefetch()
								observer?.unobserve(entry.target)
							}
						}
					},
					{ threshold: 0 },
				)
				observer.observe(el)
			})
			onCleanup(() => {
				cancel()
				observer?.disconnect()
			})
		}

		if (strategy === "render") {
			const cancel = scheduleAfterLoad(() => triggerPrefetch())
			onCleanup(cancel)
		}
	}

	function disabledStyle(): JSX.CSSProperties | string {
		if (typeof local.style === "string") return `cursor:not-allowed;${local.style}`
		if (local.style) return { cursor: "not-allowed", ...local.style }
		return "cursor:not-allowed"
	}

	return (
		<Show
			fallback={
				<span
					{...rest}
					aria-disabled="true"
					class={classes()}
					style={disabledStyle()}
					tabIndex={-1}
				>
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
				ref={setupPrefetchBehavior}
				rel={effectiveRel()}
				target={local.target}
			>
				{local.children}
			</a>
		</Show>
	) as JSX.Element
}
