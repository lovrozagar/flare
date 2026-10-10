export type LogLevel = "error" | "silent" | "verbose" | "warn";

/* A Vite `define` from Flare's plugin (its `logLevel`, else warn in dev and error in production).
   Outside the plugin (a library's unit tests importing `cn`) the logger warns, and needs nothing
   from Flare's build. */
declare const __FLARE_LOG_LEVEL__: LogLevel | undefined;

const PRIORITY: Record<LogLevel, number> = { error: 1, silent: 0, verbose: 3, warn: 2 };

const level: LogLevel = typeof __FLARE_LOG_LEVEL__ === "string" ? __FLARE_LOG_LEVEL__ : "warn";

export function warn(tag: string, msg: string, data?: unknown): void {
	if (PRIORITY[level] < 2) return;
	console.warn(`[flare:${tag}]`, msg, ...(data !== undefined ? [data] : []));
}

export function error(tag: string, msg: string, data?: unknown): void {
	if (PRIORITY[level] < 1) return;
	console.error(`[flare:${tag}]`, msg, ...(data !== undefined ? [data] : []));
}

export function verbose(tag: string, msg: string, data?: unknown): void {
	if (PRIORITY[level] < 3) return;
	console.log(`[flare:${tag}]`, msg, ...(data !== undefined ? [data] : []));
}
