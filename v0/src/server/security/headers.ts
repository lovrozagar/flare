/**
 * Security Headers Builder
 *
 * Builds comprehensive security headers for HTTP responses.
 * Includes CSP, HSTS, X-Frame-Options, etc.
 */

import { buildCspHeader, type CspDirectives } from "./csp"

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

export type { SecurityHeadersConfig }

export { buildSecurityHeaders }
