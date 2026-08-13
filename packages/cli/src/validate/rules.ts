import type { RouteDefinition } from "flare/generators"
import type { ChainMethods } from "./chain-detect"

export type DiagnosticLevel = "error" | "info" | "warning"

export interface Diagnostic {
	filePath: string
	fix?: { command: string }
	level: DiagnosticLevel
	message: string
	rule: string
}

export interface EnrichedDefinition extends RouteDefinition {
	chainMethods: ChainMethods
}

export function runRules(defs: EnrichedDefinition[], validationErrors: string[]): Diagnostic[] {
	const diagnostics: Diagnostic[] = []

	/* Error: missing-root-layout */
	if (!defs.some((d) => d.type === "root-layout")) {
		diagnostics.push({
			filePath: "",
			level: "error",
			message: "No root layout found. Create one with: flare gen layout --root",
			rule: "missing-root-layout",
		})
	}

	/* Error: duplicate-routes (from validateRouteDefinitions) */
	for (const err of validationErrors) {
		diagnostics.push({
			filePath: "",
			level: "error",
			message: err,
			rule: "duplicate-routes",
		})
	}

	const pages = defs.filter((d) => d.type === "page")

	for (const page of pages) {
		const isPublic = page.authenticateMode === false

		/* Warning: loader-no-error-boundary */
		if (page.chainMethods.hasLoader && !page.chainMethods.hasErrorRender) {
			diagnostics.push({
				filePath: page.filePath,
				fix: { command: `flare add error-boundary ${page.virtualPath}` },
				level: "warning",
				message: "Page has loader but no error boundary",
				rule: "loader-no-error-boundary",
			})
		}

		/* Warning: auth-no-boundary */
		if (page.authenticateMode !== false && !page.chainMethods.hasUnauthenticatedRender) {
			diagnostics.push({
				filePath: page.filePath,
				fix: { command: `flare add error-boundary ${page.virtualPath}` },
				level: "warning",
				message: "Page has authenticate but no unauthenticated boundary",
				rule: "auth-no-boundary",
			})
		}

		/* Warning: public-no-head */
		if (isPublic && !page.chainMethods.hasHead && !page.responseRoute) {
			diagnostics.push({
				filePath: page.filePath,
				fix: { command: `flare add head ${page.virtualPath}` },
				level: "warning",
				message: "Public page has no .head() for SEO",
				rule: "public-no-head",
			})
		}

		/* Warning: public-no-cache */
		if (isPublic && !page.cache.isr && !page.cache.ssg && !page.responseRoute) {
			diagnostics.push({
				filePath: page.filePath,
				fix: { command: `flare add cache ${page.virtualPath} --ssg` },
				level: "warning",
				message: "Public page has no cache configuration",
				rule: "public-no-cache",
			})
		}

		/* Info: suggest-prefetch */
		if (page.cache.client && page.cache.client.prefetch === undefined && !page.responseRoute) {
			diagnostics.push({
				filePath: page.filePath,
				level: "info",
				message: "Route has client cache but no prefetch strategy",
				rule: "suggest-prefetch",
			})
		}
	}

	return diagnostics
}
