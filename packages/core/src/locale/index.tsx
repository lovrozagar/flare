import { createContext, createEffect, createSignal, onSettled, untrack, useContext } from "solid-js";
import type { JSX } from "@solidjs/web";
import { BroadcastCtx } from "../broadcast/context.ts";
import { escapeJsString } from "../theme/index.tsx";
import { formatLocaleCookie } from "./cookie.ts";

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

export { formatLocaleCookie } from "./cookie.ts";

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

const LocaleCtx = createContext<LocaleContextValue | null>(null);

export function LocaleProvider(props: { children: JSX.Element; config: LocaleConfig; initial?: string }): JSX.Element {
	const cfg = untrack(() => props.config);
	const defaultLocale = cfg.defaultLocale;
	const cookieName = cfg.cookieName ?? "flare.locale";

	/* Capture context at component setup level (not inside onSettled) */
	const channel = cfg.broadcast ? useContext(BroadcastCtx) : undefined;

	/* URL is truth: initial comes from server (URL params), not localStorage */
	const initial = untrack(() => props.initial) ?? defaultLocale;
	const [locale, setLocaleSignal] = createSignal(initial);

	/* Cross-tab sync: BroadcastChannel for locale (opt-in) */
	onSettled(() => {
		if (!channel) return;

		return channel.onMessage((msg) => {
			if (msg.type === "locale" && typeof msg.value === "string" && cfg.locales.includes(msg.value)) {
				setLocaleSignal(msg.value);
			}
		});
	});

	if (channel) {
		createEffect(
			locale,
			(l) => {
				channel.broadcast({ type: "locale", value: l });
			},
			{ defer: true },
		);
	}

	createEffect(locale, (l) => {
		if (typeof document === "undefined") return;
		document.documentElement.setAttribute("lang", l);
		document.cookie = formatLocaleCookie(l, cookieName, {
			https: typeof location !== "undefined" && location.protocol === "https:",
		});
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

	return <LocaleCtx value={value}>{props.children}</LocaleCtx>;
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
