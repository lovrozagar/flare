type Method = "error" | "warn" | "log"

type Entry = {
	dev: boolean
	method: Method
	tag: string
	message: string
	data?: unknown
}

export type Logger = {
	level: "warn" | "error"
	error: (tag: string, message: string, data?: unknown) => void
	warn: (tag: string, message: string, data?: unknown) => void
	log: (tag: string, message: string, data?: unknown) => void
}

export function createLogger(options: { dev: boolean }): Logger {
	const dev = options.dev
	return {
		level: dev ? "warn" : "error",
		error(tag, message, data) {
			emit({ dev, method: "error", tag, message, data })
		},
		warn(tag, message, data) {
			emit({ dev, method: "warn", tag, message, data })
		},
		log(tag, message, data) {
			emit({ dev, method: "log", tag, message, data })
		},
	}
}

function emit(entry: Entry): void {
	if (!entry.dev && entry.method !== "error") return
	const line: unknown[] = [`[flare:${entry.tag}]`, entry.message]
	if (entry.data !== undefined) line.push(entry.data)
	console[entry.method](...line)
}
