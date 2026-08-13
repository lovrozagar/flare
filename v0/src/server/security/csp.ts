/**
 * CSP (Content-Security-Policy) Builder
 *
 * Builds CSP headers with nonce injection.
 * Supports dev mode relaxation for HMR/debugging.
 */

interface CspDirectives {
	baseUri?: string[]
	connectSrc?: string[]
	defaultSrc?: string[]
	fontSrc?: string[]
	formAction?: string[]
	frameAncestors?: string[]
	frameSrc?: string[]
	imgSrc?: string[]
	mediaSrc?: string[]
	objectSrc?: string[]
	scriptSrc?: string[]
	styleSrc?: string[]
	upgradeInsecureRequests?: boolean
	workerSrc?: string[]
}

const DEFAULT_CSP_DIRECTIVES: CspDirectives = {
	baseUri: ["'self'"],
	connectSrc: ["'self'"],
	defaultSrc: ["'self'"],
	fontSrc: ["'self'"],
	formAction: ["'self'"],
	frameAncestors: ["'self'"],
	frameSrc: ["'self'"],
	imgSrc: ["'self'", "data:", "blob:"],
	mediaSrc: ["'self'"],
	objectSrc: ["'none'"],
	scriptSrc: ["'self'"],
	styleSrc: ["'self'", "'unsafe-inline'"],
	workerSrc: ["'self'"],
}

function buildCspHeader(directives: CspDirectives, nonce: string, isDev: boolean): string {
	const parts: string[] = []

	const defaultSrc = directives.defaultSrc ?? DEFAULT_CSP_DIRECTIVES.defaultSrc ?? []
	parts.push(`default-src ${defaultSrc.join(" ")}`)

	const baseScriptSrc = directives.scriptSrc ?? []
	let scriptSrc: string[]
	if (isDev) {
		scriptSrc = ["'self'", "'unsafe-inline'", "'unsafe-eval'", ...baseScriptSrc]
	} else {
		scriptSrc = ["'self'", "'strict-dynamic'", `'nonce-${nonce}'`, ...baseScriptSrc]
	}
	parts.push(`script-src ${scriptSrc.join(" ")}`)

	const styleSrc = directives.styleSrc ?? DEFAULT_CSP_DIRECTIVES.styleSrc ?? []
	parts.push(`style-src ${styleSrc.join(" ")}`)

	const baseConnectSrc = directives.connectSrc ?? DEFAULT_CSP_DIRECTIVES.connectSrc ?? []
	let connectSrc: string[]
	if (isDev) {
		connectSrc = [...baseConnectSrc, "ws://localhost:*", "wss://localhost:*"]
	} else {
		connectSrc = baseConnectSrc
	}
	parts.push(`connect-src ${connectSrc.join(" ")}`)

	const imgSrc = directives.imgSrc ?? DEFAULT_CSP_DIRECTIVES.imgSrc ?? []
	parts.push(`img-src ${imgSrc.join(" ")}`)

	const fontSrc = directives.fontSrc ?? DEFAULT_CSP_DIRECTIVES.fontSrc ?? []
	parts.push(`font-src ${fontSrc.join(" ")}`)

	const mediaSrc = directives.mediaSrc ?? DEFAULT_CSP_DIRECTIVES.mediaSrc ?? []
	parts.push(`media-src ${mediaSrc.join(" ")}`)

	const frameSrc = directives.frameSrc ?? DEFAULT_CSP_DIRECTIVES.frameSrc ?? []
	parts.push(`frame-src ${frameSrc.join(" ")}`)

	const objectSrc = directives.objectSrc ?? DEFAULT_CSP_DIRECTIVES.objectSrc ?? []
	parts.push(`object-src ${objectSrc.join(" ")}`)

	const baseUri = directives.baseUri ?? DEFAULT_CSP_DIRECTIVES.baseUri ?? []
	parts.push(`base-uri ${baseUri.join(" ")}`)

	const formAction = directives.formAction ?? DEFAULT_CSP_DIRECTIVES.formAction ?? []
	parts.push(`form-action ${formAction.join(" ")}`)

	const frameAncestors = directives.frameAncestors ?? DEFAULT_CSP_DIRECTIVES.frameAncestors ?? []
	parts.push(`frame-ancestors ${frameAncestors.join(" ")}`)

	const baseWorkerSrc = directives.workerSrc ?? DEFAULT_CSP_DIRECTIVES.workerSrc ?? []
	let workerSrc: string[]
	if (isDev) {
		workerSrc = ["'self'", "blob:"]
	} else {
		workerSrc = baseWorkerSrc
	}
	parts.push(`worker-src ${workerSrc.join(" ")}`)

	if (directives.upgradeInsecureRequests === true) {
		parts.push("upgrade-insecure-requests")
	}

	return parts.join("; ")
}

function parseCspHeader(csp: string): CspDirectives {
	if (!csp.trim()) return {}

	const result: CspDirectives = {}
	const directives = csp
		.split(";")
		.map((d) => d.trim())
		.filter(Boolean)

	for (const directive of directives) {
		const [name, ...values] = directive.split(/\s+/)
		if (!name) continue

		const kebabToCamel = (str: string): string => {
			return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
		}

		const key = kebabToCamel(name) as keyof CspDirectives

		if (key === "upgradeInsecureRequests") {
			result.upgradeInsecureRequests = true
		} else if (values.length > 0) {
			;(result as Record<string, string[]>)[key] = values
		}
	}

	return result
}

export type { CspDirectives }

export { buildCspHeader, DEFAULT_CSP_DIRECTIVES, parseCspHeader }
