export { NavigationProgress, type NavigationProgressProps } from "../navigation-progress/index.tsx";
export {
	Await,
	type AwaitProps,
	type AwaitStatus,
	type Deferred,
	getPromise,
	getResolvedError,
	getResolvedValue,
	isDeferred,
} from "./await.tsx";
export { DirectionScript, type DirectionScriptProps } from "./direction-script.tsx";
export { ResetCSS } from "./reset-css.tsx";
export { SSRContextProvider, type SSRContextValue, setSSRContext, useSSRContext } from "./ssr-context.tsx";
export { ThemeScript, type ThemeScriptProps } from "./theme-script.tsx";
export { ViewTransitionCSS, type ViewTransitionCSSProps } from "./view-transition-css.tsx";

export interface SerializedError {
	message: string;
	name: string;
	source: string;
	stack?: string;
}

export interface CapturedError {
	dismissed: boolean;
	error: Error;
	id: string;
	source: string;
	timestamp: number;
}

export interface DevErrorStore {
	clear: () => void;
	dismiss: (id: string) => void;
	errors: () => CapturedError[];
	hasErrors: () => boolean;
	register: (error: Error | SerializedError, source?: string) => void;
}

function hashError(name: string, message: string, source: string, stack?: string): string {
	/* Use first 100 chars of stack to avoid huge keys while still differentiating call sites */
	const stackPrefix = stack ? stack.slice(0, 100) : "";
	const raw = `${name}|${message}|${source}|${stackPrefix}`;
	let hash = 0;
	for (let i = 0; i < raw.length; i++) {
		const ch = raw.charCodeAt(i);
		hash = ((hash << 5) - hash + ch) | 0;
	}
	return hash.toString(36);
}

function isSerializedError(value: unknown): value is SerializedError {
	return (
		value !== null &&
		typeof value === "object" &&
		"message" in (value as Record<string, unknown>) &&
		"name" in (value as Record<string, unknown>) &&
		"source" in (value as Record<string, unknown>)
	);
}

const MAX_DEV_ERRORS = 100;

/* Benign dev-mode errors that should not surface in the overlay */
const DEV_IGNORE_PATTERNS = [/ServiceWorker.*SSL certificate error/i];

/**
 * Error names benign during navigation — WebKit surfaces AbortError as
 * unhandledrejection for both fetch cancellation (NDJSON stream aborted
 * when navigating away) and view transition overlap (new startViewTransition
 * aborts previous). Chromium suppresses these internally.
 */
const DEV_IGNORE_NAMES = new Set(["AbortError"]);

export function createDevErrorStore(): DevErrorStore {
	let store: CapturedError[] = [];

	function errors(): CapturedError[] {
		return store;
	}

	function hasErrors(): boolean {
		return store.some((e) => !e.dismissed);
	}

	function register(error: Error | SerializedError, source?: string): void {
		const src = source ?? (isSerializedError(error) ? error.source : "unknown");
		let err: Error;
		if (error instanceof Error) {
			err = error;
		} else {
			err = new Error(error.message);
			err.name = error.name;
			if (error.stack) {
				err.stack = error.stack;
			}
		}

		/* Skip benign dev-mode errors (e.g. SW cert during local HTTPS, fetch abort during nav) */
		if (DEV_IGNORE_PATTERNS.some((p) => p.test(err.message))) return;
		if (DEV_IGNORE_NAMES.has(err.name)) return;

		const id = hashError(err.name, err.message, src, err.stack);

		/* Dedup: skip if already tracked (even if dismissed) */
		if (store.some((e) => e.id === id)) return;

		/* Cap: evict dismissed first, then oldest */
		if (store.length >= MAX_DEV_ERRORS) {
			const dismissedIdx = store.findIndex((e) => e.dismissed);
			store.splice(dismissedIdx >= 0 ? dismissedIdx : 0, 1);
		}

		store.push({
			dismissed: false,
			error: err,
			id,
			source: src,
			timestamp: Date.now(),
		});
	}

	function dismiss(id: string): void {
		const entry = store.find((e) => e.id === id);
		if (entry) {
			entry.dismissed = true;
		}
	}

	function clear(): void {
		store = [];
	}

	return { clear, dismiss, errors, hasErrors, register };
}

/* Tailwind CSS v4 preflight — --theme() calls resolved to fallback values */
export const resetCss =
	"@layer reset {*,::after,::before,::backdrop,::file-selector-button{box-sizing:border-box;margin:0;padding:0;border:0 solid}html,:host{line-height:1.5;-webkit-text-size-adjust:100%;tab-size:4;font-family:ui-sans-serif,system-ui,sans-serif,'Apple Color Emoji','Segoe UI Emoji','Segoe UI Symbol','Noto Color Emoji';font-feature-settings:normal;font-variation-settings:normal;-webkit-tap-highlight-color:transparent}body{line-height:inherit}hr{height:0;color:inherit;border-top-width:1px}abbr:where([title]){-webkit-text-decoration:underline dotted;text-decoration:underline dotted}h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}a{color:inherit;-webkit-text-decoration:inherit;text-decoration:inherit}b,strong{font-weight:bolder}code,kbd,samp,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-feature-settings:normal;font-variation-settings:normal;font-size:1em}small{font-size:80%}sub,sup{font-size:75%;line-height:0;position:relative;vertical-align:baseline}sub{bottom:-0.25em}sup{top:-0.5em}table{text-indent:0;border-color:inherit;border-collapse:collapse}:-moz-focusring{outline:auto}progress{vertical-align:baseline}summary{display:list-item}ol,ul,menu{list-style:none}img,svg,video,canvas,audio,iframe,embed,object{display:block;vertical-align:middle}img,video{max-width:100%;height:auto}button,input,select,optgroup,textarea,::file-selector-button{font:inherit;font-feature-settings:inherit;font-variation-settings:inherit;letter-spacing:inherit;color:inherit;border-radius:0;background-color:transparent;opacity:1}:where(select:is([multiple],[size])) optgroup{font-weight:bolder}:where(select:is([multiple],[size])) optgroup option{padding-inline-start:20px}::file-selector-button{margin-inline-end:4px}::placeholder{opacity:1}@supports (not (-webkit-appearance:-apple-pay-button)) or (contain-intrinsic-size:1px){::placeholder{color:color-mix(in oklab,currentcolor 50%,transparent)}}textarea{resize:vertical}::-webkit-search-decoration{-webkit-appearance:none}::-webkit-date-and-time-value{min-height:1lh;text-align:inherit}::-webkit-datetime-edit{display:inline-flex}::-webkit-datetime-edit-fields-wrapper{padding:0}::-webkit-datetime-edit,::-webkit-datetime-edit-year-field,::-webkit-datetime-edit-month-field,::-webkit-datetime-edit-day-field,::-webkit-datetime-edit-hour-field,::-webkit-datetime-edit-minute-field,::-webkit-datetime-edit-second-field,::-webkit-datetime-edit-millisecond-field,::-webkit-datetime-edit-meridiem-field{padding-block:0}::-webkit-calendar-picker-indicator{line-height:1}:-moz-ui-invalid{box-shadow:none}button,input:where([type='button'],[type='reset'],[type='submit']),::file-selector-button{appearance:button}::-webkit-inner-spin-button,::-webkit-outer-spin-button{height:auto}[hidden]:where(:not([hidden='until-found'])){display:none!important}}";

function buildViewTransitionCss(duration: number): string {
	return `@view-transition{navigation:auto}::view-transition-old(*),::view-transition-new(*){animation-duration:${duration}ms}`;
}

export const viewTransitionCss: string = buildViewTransitionCss(175);

export function getViewTransitionCss(duration: number): string {
	return buildViewTransitionCss(duration);
}
