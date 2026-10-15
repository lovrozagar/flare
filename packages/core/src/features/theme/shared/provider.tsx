import {
	createComponent,
	createContext,
	createMemo,
	createSignal,
	onSettled,
	useContext,
	type Accessor,
} from "solid-js"
import { isServer, type JSX } from "@solidjs/web"
import { post, subscribe } from "../../../client/sync/index.ts"
import { nonce } from "../../../shared/csp/index.ts"
import { useRouter, type ThemeConfig, type ThemeName } from "../../../shared/router/index.ts"

export type Resolved = "light" | "dark"

export type ThemeState = {
	theme: Accessor<ThemeName>
	resolvedTheme: Accessor<Resolved>
	setTheme: (next: ThemeName) => void
}

const ThemeContext = createContext<ThemeState | null>(null)

const QUERY = "(prefers-color-scheme: dark)"
const NO_TRANSITION = "*{transition:none!important}"

// The subtree, and the state useTheme reads. With no theme config the children still render, and useTheme throws.
export function ThemeProvider(props: { children: JSX.Element }): JSX.Element {
	const config = useRouter().theme
	return createComponent(ThemeContext, {
		value: config === undefined ? null : themeState(config),
		get children() {
			return props.children
		},
	})
}

export function useTheme(): ThemeState {
	const state = useContext(ThemeContext)
	if (state === null) throw new Error("useTheme outside ThemeProvider")
	return state
}

// The server render and the hydration render seed `defaultTheme` and call no setter (B90). After the commit, the
// stored value, the media query, and the channel write from client callbacks. The before-paint script owns the
// attribute until then.
function themeState(config: ThemeConfig): ThemeState {
	const [theme, setThemeSignal] = createSignal<ThemeName>(config.defaultTheme)
	const [dark, setDark] = createSignal(false)
	const resolvedTheme = createMemo(() => resolve(theme(), dark()))
	// The value the client shows. Signal reads before a flush return the previous value, so the handlers read this.
	let current: ThemeName = config.defaultTheme
	const show = (next: ThemeName): void => {
		current = next
		setThemeSignal(next)
		paint(config, resolve(next, matchMedia(QUERY).matches))
	}
	onSettled(() => {
		const media = matchMedia(QUERY)
		setDark(media.matches)
		const stored = readStored(config)
		if (stored !== undefined) {
			current = stored
			setThemeSignal(stored)
		}
		const onMedia = (event: { matches: boolean }): void => {
			setDark(event.matches)
			if (current === "system") paint(config, event.matches ? "dark" : "light")
		}
		media.addEventListener("change", onMedia)
		const close = subscribe((data) => {
			const value = themeMessage(data, config)
			if (value !== undefined && value !== current) show(value)
		})
		return () => {
			media.removeEventListener("change", onMedia)
			close()
		}
	})
	const setTheme = (next: ThemeName): void => {
		if (isServer) throw new Error("setTheme on the server")
		if (!config.themes.includes(next)) throw new Error(`setTheme ${String(next)}`)
		try {
			localStorage.setItem(config.storageKey, next)
		} catch {
			// A storage failure leaves the attribute to update anyway (dx/features.md).
		}
		show(next)
		post({ type: "theme", value: next })
	}
	return { theme, resolvedTheme, setTheme }
}

function resolve(theme: ThemeName, dark: boolean): Resolved {
	if (theme !== "system") return theme
	return dark ? "dark" : "light"
}

// A stored member of `themes`, or nothing. A storage throw is nothing.
function readStored(config: ThemeConfig): ThemeName | undefined {
	try {
		const value = localStorage.getItem(config.storageKey)
		return config.themes.find((theme) => theme === value)
	} catch {
		return undefined
	}
}

// `{ type: "theme", value }` with exactly those keys and a value in this app's themes (dx/features.md Cross-tab).
function themeMessage(data: unknown, config: ThemeConfig): ThemeName | undefined {
	if (typeof data !== "object" || data === null) return undefined
	const keys = Object.keys(data)
	if (keys.length !== 2 || !("type" in data) || !("value" in data) || data.type !== "theme") return undefined
	return config.themes.find((theme) => theme === data.value)
}

// Sets the attribute and `colorScheme`. A change of the resolved value, with the flag on, first disables
// transitions for one frame.
function paint(config: ThemeConfig, resolved: Resolved): void {
	const root = document.documentElement
	if (root.getAttribute(config.attribute) === resolved) return
	if (config.disableTransitionOnChange) suppressTransitions()
	root.setAttribute(config.attribute, resolved)
	root.style.colorScheme = resolved
}

function suppressTransitions(): void {
	const style = document.createElement("style")
	const value = nonce()
	if (value !== "") style.setAttribute("nonce", value)
	style.textContent = NO_TRANSITION
	document.head.append(style)
	requestAnimationFrame(() => style.remove())
}
