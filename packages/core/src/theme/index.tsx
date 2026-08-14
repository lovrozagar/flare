import {
	createContext,
	createEffect,
	createSignal,
	type JSX,
	on,
	onCleanup,
	onMount,
	useContext,
} from "solid-js"

export type Theme = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

export interface ThemeConfig {
	attribute?: string
	defaultTheme?: Theme
	disableTransitionOnChange?: boolean
	storageKey?: string
	themes?: readonly Theme[]
}

const DEFAULT_CONFIG: Required<ThemeConfig> = {
	attribute: "data-theme",
	defaultTheme: "system",
	disableTransitionOnChange: true,
	storageKey: "flare.theme",
	themes: ["light", "dark", "system"],
}

/* Escape for safe interpolation into JS double-quoted strings inside <script> */
export function escapeJsString(s: string): string {
	return s
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/<\//g, "<\\/")
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r")
		.replace(/\u2028/g, "\\u2028")
		.replace(/\u2029/g, "\\u2029")
}

export function getThemeScript(opts?: ThemeConfig): string {
	const attr = escapeJsString(opts?.attribute ?? DEFAULT_CONFIG.attribute)
	const defaultTheme = escapeJsString(opts?.defaultTheme ?? DEFAULT_CONFIG.defaultTheme)
	const storageKey = escapeJsString(opts?.storageKey ?? DEFAULT_CONFIG.storageKey)
	return `((k,d,a)=>{const e=document.documentElement;let t;try{t=localStorage.getItem(k)||d}catch{t=d}if(t==="system")t=matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light";e.setAttribute(a,t);e.style.colorScheme=t})("${storageKey}","${defaultTheme}","${attr}")`
}

/* ── Context ──────────────────────────────────────────────────────── */

export interface ThemeContextValue {
	resolvedTheme: () => ResolvedTheme
	setTheme: (theme: Theme) => void
	theme: () => Theme
	toggleTheme: () => void
}

const ThemeCtx = createContext<ThemeContextValue>()

export function ThemeProvider(props: { children: JSX.Element; config?: ThemeConfig }): JSX.Element {
	const cfg: Required<ThemeConfig> = {
		attribute: props.config?.attribute ?? DEFAULT_CONFIG.attribute,
		defaultTheme: props.config?.defaultTheme ?? DEFAULT_CONFIG.defaultTheme,
		disableTransitionOnChange:
			props.config?.disableTransitionOnChange ?? DEFAULT_CONFIG.disableTransitionOnChange,
		storageKey: props.config?.storageKey ?? DEFAULT_CONFIG.storageKey,
		themes: props.config?.themes ?? DEFAULT_CONFIG.themes,
	}

	/* Read initial theme from localStorage or default */
	let initial: Theme = cfg.defaultTheme
	if (typeof localStorage !== "undefined") {
		try {
			const stored = localStorage.getItem(cfg.storageKey)
			if (stored && cfg.themes.includes(stored as Theme)) {
				initial = stored as Theme
			}
		} catch {
			/* noop */
		}
	}

	const [theme, setThemeSignal] = createSignal<Theme>(initial)

	/* Initialize system theme synchronously to avoid extra effect cycle */
	let initialSystem: ResolvedTheme = "light"
	if (typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches) {
		initialSystem = "dark"
	}
	const [systemTheme, setSystemTheme] = createSignal<ResolvedTheme>(initialSystem)

	const resolvedTheme = (): ResolvedTheme => {
		const t = theme()
		return t === "system" ? systemTheme() : t
	}

	/* Listen for OS preference changes */
	onMount(() => {
		if (typeof matchMedia === "undefined") return
		const mq = matchMedia("(prefers-color-scheme: dark)")
		const handler = (e: MediaQueryListEvent) => {
			setSystemTheme(e.matches ? "dark" : "light")
		}
		mq.addEventListener("change", handler)
		onCleanup(() => mq.removeEventListener("change", handler))
	})

	/* Cross-tab sync: StorageEvent fires in OTHER tabs only */
	onMount(() => {
		const handler = (e: StorageEvent) => {
			if (e.key !== cfg.storageKey || e.storageArea !== localStorage) return
			const v = e.newValue
			if (v && cfg.themes.includes(v as Theme)) {
				setThemeSignal(v as Theme)
			}
		}
		window.addEventListener("storage", handler)
		onCleanup(() => window.removeEventListener("storage", handler))
	})

	/* Sync resolved theme to DOM (skip transition-disable on first run) */
	let skipFirst = true
	createEffect(() => {
		const resolved = resolvedTheme()
		if (typeof document === "undefined") return
		const el = document.documentElement

		if (skipFirst) {
			skipFirst = false
			el.setAttribute(cfg.attribute, resolved)
			el.style.colorScheme = resolved
			return
		}

		if (cfg.disableTransitionOnChange) {
			const style = document.createElement("style")
			style.textContent = "* { transition: none !important }"
			document.head.appendChild(style)
			el.setAttribute(cfg.attribute, resolved)
			el.style.colorScheme = resolved
			if (document.body) getComputedStyle(document.body).opacity
			requestAnimationFrame(() => style.remove())
		} else {
			el.setAttribute(cfg.attribute, resolved)
			el.style.colorScheme = resolved
		}
	})

	/* Persist to localStorage on changes (not initial — it was read from there) */
	createEffect(
		on(
			theme,
			(t) => {
				try {
					localStorage.setItem(cfg.storageKey, t)
				} catch {
					/* noop */
				}
			},
			{ defer: true },
		),
	)

	const setTheme = (t: Theme): void => {
		if (!cfg.themes.includes(t)) return
		setThemeSignal(t)
	}

	const toggleTheme = (): void => {
		const current = resolvedTheme()
		setTheme(current === "light" ? "dark" : "light")
	}

	const value: ThemeContextValue = {
		resolvedTheme,
		setTheme,
		theme,
		toggleTheme,
	}

	return <ThemeCtx.Provider value={value}>{props.children}</ThemeCtx.Provider>
}

export function useTheme(): ThemeContextValue {
	const ctx = useContext(ThemeCtx)
	if (!ctx)
		throw new Error("useTheme() called outside ThemeProvider. Wrap your app with <ThemeProvider>.")
	return ctx
}
