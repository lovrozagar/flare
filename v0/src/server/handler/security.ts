/**
 * Security Header Application
 *
 * Applies security headers to responses.
 */

import { buildSecurityHeaders, type CspDirectives } from "../_internal/security"

function applySecurityHeaders(
	response: Response,
	nonce: string,
	isDev: boolean,
	csp: CspDirectives,
): Response {
	const securityHeaders = buildSecurityHeaders({ csp, isDev, nonce })

	const newResponse = new Response(response.body, response)
	for (const [key, value] of Object.entries(securityHeaders)) {
		newResponse.headers.set(key, value)
	}
	return newResponse
}

export { applySecurityHeaders }
