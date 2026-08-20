import { createContext, createEffect, createSignal, onSettled, sharedConfig, useContext } from "solid-js";
import { isServer, type JSX } from "@solidjs/web";

export type Direction = "ltr" | "rtl";

export interface DirectionConfig {
	attribute?: string;
	defaultDir?: Direction;
	rtlLocales?: readonly string[];
	storageKey?: string;
}

const DEFAULT_CONFIG: Required<DirectionConfig> = {
	attribute: "data-dir",
	defaultDir: "ltr",
	rtlLocales: ["ar", "he", "fa", "ur"],
	storageKey: "flare.dir",
};

/* Escape for safe interpolation into JS double-quoted strings inside <script> */
function escapeJsString(s: string): string {
	return s
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/<\//g, "<\\/")
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r")
		.replace(/\u2028/g, "\\u2028")
		.replace(/\u2029/g, "\\u2029");
}

export function getDirectionScript(opts?: DirectionConfig): string {
	const attr = escapeJsString(opts?.attribute ?? DEFAULT_CONFIG.attribute);
	const defaultDir = escapeJsString(opts?.defaultDir ?? DEFAULT_CONFIG.defaultDir);
	const storageKey = escapeJsString(opts?.storageKey ?? DEFAULT_CONFIG.storageKey);
	return `((k,d,a)=>{const e=document.documentElement;let v;try{v=localStorage.getItem(k)}catch{}v=v||e.getAttribute("dir")||d;e.setAttribute(a,v);e.setAttribute("dir",v)})("${storageKey}","${defaultDir}","${attr}")`;
}

export function getDirFromLocale(locale: string | undefined, rtlLocales?: readonly string[]): Direction {
	if (!locale) return "ltr";
	const base = locale.split("-")[0]?.toLowerCase() ?? "";
	return (rtlLocales ?? DEFAULT_CONFIG.rtlLocales).includes(base) ? "rtl" : "ltr";
}

/* ── Context ──────────────────────────────────────────────────────── */

export interface DirectionContextValue {
	direction: () => Direction;
	getDirFromLocale: (locale: string | undefined) => Direction;
	setDirection: (dir: Direction) => void;
	toggleDirection: () => void;
}

const DirectionCtx = createContext<DirectionContextValue | null>(null);

export function DirectionProvider(props: { children: JSX.Element; config?: DirectionConfig }): JSX.Element {
	/* SSR: pass through children (context not needed on server, scripts handle direction) */
	if (isServer || sharedConfig.hydrating) {
		return props.children;
	}

	const cfg: Required<DirectionConfig> = {
		attribute: props.config?.attribute ?? DEFAULT_CONFIG.attribute,
		defaultDir: props.config?.defaultDir ?? DEFAULT_CONFIG.defaultDir,
		rtlLocales: props.config?.rtlLocales ?? DEFAULT_CONFIG.rtlLocales,
		storageKey: props.config?.storageKey ?? DEFAULT_CONFIG.storageKey,
	};

	/* Read initial direction from localStorage, DOM dir attr, or default */
	let initial: Direction = cfg.defaultDir;
	if (typeof localStorage !== "undefined") {
		try {
			const stored = localStorage.getItem(cfg.storageKey);
			if (stored === "ltr" || stored === "rtl") {
				initial = stored;
			}
		} catch {
			/* noop */
		}
	}
	if (initial === cfg.defaultDir && typeof document !== "undefined") {
		const domDir = document.documentElement.getAttribute("dir");
		if (domDir === "ltr" || domDir === "rtl") {
			initial = domDir;
		}
	}

	const [direction, setDirectionSignal] = createSignal<Direction>(initial);

	/* Sync direction to DOM */
	createEffect(direction, (dir) => {
		if (typeof document === "undefined") return;
		const el = document.documentElement;
		el.setAttribute(cfg.attribute, dir);
		el.setAttribute("dir", dir);
	});

	/* Cross-tab sync: StorageEvent fires in OTHER tabs only */
	onSettled(() => {
		const handler = (e: StorageEvent) => {
			if (e.key !== cfg.storageKey || e.storageArea !== localStorage) return;
			const v = e.newValue;
			if (v === "ltr" || v === "rtl") {
				setDirectionSignal(v);
			}
		};
		window.addEventListener("storage", handler);
		return () => window.removeEventListener("storage", handler);
	});

	/* Persist to localStorage on changes */
	createEffect(
		direction,
		(dir) => {
			try {
				localStorage.setItem(cfg.storageKey, dir);
			} catch {
				/* noop */
			}
		},
		{ defer: true },
	);

	const setDirection = (dir: Direction): void => {
		setDirectionSignal(dir);
	};

	const toggleDirection = (): void => {
		const current = direction();
		setDirection(current === "ltr" ? "rtl" : "ltr");
	};

	const dirFromLocale = (locale: string | undefined): Direction => {
		return getDirFromLocale(locale, cfg.rtlLocales);
	};

	const value: DirectionContextValue = {
		direction,
		getDirFromLocale: dirFromLocale,
		setDirection,
		toggleDirection,
	};

	return <DirectionCtx value={value}>{props.children}</DirectionCtx>;
}

export function useDirection(): DirectionContextValue {
	const ctx = useContext(DirectionCtx);
	if (!ctx) throw new Error("useDirection() called outside DirectionProvider. Wrap your app with <DirectionProvider>.");
	return ctx;
}
