/**
 * Security Utilities - Internal
 *
 * CSP building, nonce generation, and security headers.
 * Not part of public API.
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

function generateNonce(): string {
	const array = new Uint8Array(16)
	crypto.getRandomValues(array)

	let result = ""
	for (let i = 0; i < array.length; i++) {
		const byte = array[i]
		if (byte !== undefined) {
			result += byte.toString(16).padStart(2, "0")
		}
	}
	return result
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

interface SecurityHeadersConfig {
	csp?: CspDirectives
	headers?: Record<string, string>
	isDev?: boolean
	nonce: string
}

function buildSecurityHeaders(config: SecurityHeadersConfig): Record<string, string> {
	const { csp = {}, headers = {}, isDev = false, nonce } = config

	const result: Record<string, string> = {}

	result["Content-Security-Policy"] = buildCspHeader(csp, nonce, isDev)

	result["X-Content-Type-Options"] = "nosniff"
	result["X-Frame-Options"] = "SAMEORIGIN"
	result["Referrer-Policy"] = "strict-origin-when-cross-origin"
	result["X-XSS-Protection"] = "1; mode=block"

	result["Permissions-Policy"] = [
		"accelerometer=()",
		"autoplay=()",
		"camera=()",
		"cross-origin-isolated=()",
		"display-capture=()",
		"encrypted-media=()",
		"fullscreen=()",
		"geolocation=()",
		"gyroscope=()",
		"keyboard-map=()",
		"magnetometer=()",
		"microphone=()",
		"midi=()",
		"payment=()",
		"picture-in-picture=()",
		"publickey-credentials-get=()",
		"screen-wake-lock=()",
		"sync-xhr=()",
		"usb=()",
		"xr-spatial-tracking=()",
	].join(", ")

	if (!isDev) {
		result["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
		result["Cross-Origin-Opener-Policy"] = "same-origin"
	}

	for (const [key, value] of Object.entries(headers)) {
		result[key] = value
	}

	return result
}

export type { CspDirectives, SecurityHeadersConfig }

export {
	buildCspHeader,
	buildSecurityHeaders,
	DEFAULT_CSP_DIRECTIVES,
	generateNonce,
	parseCspHeader,
}
