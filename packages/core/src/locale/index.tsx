import {
	createContext,
	createEffect,
	createSignal,
	type JSX,
	on,
	onCleanup,
	onMount,
	sharedConfig,
	useContext,
} from "solid-js";
import { BroadcastCtx } from "../broadcast/context.ts";
import { escapeJsString } from "../theme/index.tsx";

/* ── Types ─────────────────────────────────────────────────────────── */

export interface LocaleConfig {
	broadcast?: boolean;
	cookieName?: string;
	defaultLocale: string;
	locales: readonly string[];
	paramName?: string;
	skip?: readonly string[];
	syncDirection?: boolean;
}

export interface LocaleContextValue {
	defaultLocale: string;
	locale: () => string;
	locales: readonly string[];
	setLocale: (locale: string) => void;
}

/* ── getLocaleScript ───────────────────────────────────────────────── */

export function getLocaleScript(opts: LocaleConfig): string {
	const defaultLocale = escapeJsString(opts.defaultLocale);
	return `(d=>{var e=document.documentElement;e.setAttribute("lang",e.getAttribute("lang")||d)})("${defaultLocale}")`;
}

/* ── Context ───────────────────────────────────────────────────────── */

const LocaleCtx = createContext<LocaleContextValue>();

export function LocaleProvider(props: { children: JSX.Element; config: LocaleConfig; initial?: string }): JSX.Element {
	if (sharedConfig.context) {
		return props.children;
	}

	const cfg = props.config;
	const defaultLocale = cfg.defaultLocale;
	const cookieName = cfg.cookieName ?? "flare.locale";

	/* Capture context at component setup level (not inside onMount) */
	const channel = cfg.broadcast ? useContext(BroadcastCtx) : undefined;

	/* URL is truth: initial comes from server (URL params), not localStorage */
	const initial = props.initial ?? defaultLocale;
	const [locale, setLocaleSignal] = createSignal(initial);

	/* Cross-tab sync: BroadcastChannel for locale (opt-in) */
	onMount(() => {
		if (!channel) return;

		const unsubscribe = channel.onMessage((msg) => {
			if (msg.type === "locale" && typeof msg.value === "string" && cfg.locales.includes(msg.value)) {
				setLocaleSignal(msg.value);
			}
		});

		createEffect(
			on(
				locale,
				(l) => {
					channel.broadcast({ type: "locale", value: l });
				},
				{ defer: true },
			),
		);

		onCleanup(unsubscribe);
	});

	createEffect(() => {
		const l = locale();
		if (typeof document === "undefined") return;
		document.documentElement.setAttribute("lang", l);
		document.cookie = `${cookieName}=${l}; path=/; max-age=31536000; samesite=lax`;
	});

	const setLocale = (l: string): void => {
		if (!cfg.locales.includes(l)) return;
		setLocaleSignal(l);
	};

	const value: LocaleContextValue = {
		defaultLocale,
		locale,
		locales: cfg.locales,
		setLocale,
	};

	return <LocaleCtx.Provider value={value}>{props.children}</LocaleCtx.Provider>;
}

export function useLocale(): LocaleContextValue {
	const ctx = useContext(LocaleCtx);
	if (!ctx)
		throw new Error(
			"useLocale() called outside LocaleProvider. Ensure <LocaleProvider> wraps components using locale hooks.",
		);
	return ctx;
}

/* ── buildHreflangLinks ────────────────────────────────────────────── */

export function buildHreflangLinks(opts: {
	baseUrl: string;
	config: LocaleConfig;
	pathname: string;
}): Record<string, string> {
	const base = opts.baseUrl.replace(/\/$/, "");
	const links: Record<string, string> = {};

	for (const locale of opts.config.locales) {
		if (locale === opts.config.defaultLocale) {
			links[locale] = `${base}${opts.pathname}`;
		} else {
			const path = opts.pathname === "/" ? "" : opts.pathname;
			links[locale] = `${base}/${locale}${path}`;
		}
	}

	links["x-default"] = links[opts.config.defaultLocale] ?? `${base}${opts.pathname}`;

	return links;
}
