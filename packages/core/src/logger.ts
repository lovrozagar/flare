import defaultLevel from "virtual:flare-log-level"

export type LogLevel = "error" | "silent" | "verbose" | "warn"

const PRIORITY: Record<LogLevel, number> = { error: 1, silent: 0, verbose: 3, warn: 2 }

const level: LogLevel = defaultLevel

export function warn(tag: string, msg: string, data?: unknown): void {
	if (PRIORITY[level] < 2) return
	console.warn(`[flare:${tag}]`, msg, ...(data !== undefined ? [data] : []))
}

export function error(tag: string, msg: string, data?: unknown): void {
	if (PRIORITY[level] < 1) return
	console.error(`[flare:${tag}]`, msg, ...(data !== undefined ? [data] : []))
}

export function verbose(tag: string, msg: string, data?: unknown): void {
	if (PRIORITY[level] < 3) return
	console.log(`[flare:${tag}]`, msg, ...(data !== undefined ? [data] : []))
}
