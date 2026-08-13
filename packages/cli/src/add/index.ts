import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { RouteDefinition } from "flare/generators"
import { findInsertionPoint } from "./chain-parser"
import type { MethodTemplate } from "./method-templates"
import {
	authenticateTemplate,
	cacheTemplate,
	errorRenderTemplate,
	headTemplate,
	inputTemplate,
	loaderTemplate,
	notFoundRenderTemplate,
	unauthenticatedRenderTemplate,
} from "./method-templates"
import { resolveRoute } from "./route-resolver"

export interface AddResult {
	filePath: string
	method: string
	success: boolean
}

/**
 * Add a method to a route's builder chain.
 */
export function addMethod(
	rootDir: string,
	def: RouteDefinition,
	template: MethodTemplate,
): AddResult {
	const fullPath = join(rootDir, def.filePath)
	let source: string
	try {
		source = readFileSync(fullPath, "utf-8")
	} catch {
		return { filePath: def.filePath, method: template.method, success: false }
	}

	const insertion = findInsertionPoint(source, def.virtualPath, template.method)
	if (!insertion) {
		return { filePath: def.filePath, method: template.method, success: false }
	}

	const before = source.slice(0, insertion.insertOffset)
	const after = source.slice(insertion.insertOffset)
	const updated = `${before}${template.code}${after}`

	writeFileSync(fullPath, updated, "utf-8")
	return { filePath: def.filePath, method: template.method, success: true }
}

export interface AddOptions {
	isr?: number
	ssg?: boolean
}

/**
 * Resolve path + add method in one call. Returns null if route not found.
 */
export function addToRoute(
	rootDir: string,
	defs: RouteDefinition[],
	urlPath: string,
	methodName: string,
	opts?: AddOptions,
): AddResult | null {
	const def = resolveRoute(urlPath, defs)
	if (!def) return null

	const indent = detectIndentFromFile(join(rootDir, def.filePath))
	const template = getTemplate(methodName, indent, opts)
	if (!template) return null

	return addMethod(rootDir, def, template)
}

function detectIndentFromFile(fullPath: string): string {
	try {
		const source = readFileSync(fullPath, "utf-8")
		const match = /\n(\t+|\s+)\./.exec(source)
		return match ? (match[1] ?? "\t") : "\t"
	} catch {
		return "\t"
	}
}

function getTemplate(methodName: string, indent: string, opts?: AddOptions): MethodTemplate | null {
	switch (methodName) {
		case "auth":
		case "authenticate":
			return authenticateTemplate(indent)
		case "cache":
			return cacheTemplate(indent, { isr: opts?.isr, ssg: opts?.ssg })
		case "error-boundary": {
			/* error-boundary adds both errorRender + notFoundRender, return errorRender first */
			return errorRenderTemplate(indent)
		}
		case "head":
			return headTemplate(indent)
		case "input":
			return inputTemplate(indent)
		case "loader":
			return loaderTemplate(indent)
		default:
			return null
	}
}

/**
 * Add error-boundary: errorRender + notFoundRender in sequence.
 */
export function addErrorBoundary(rootDir: string, def: RouteDefinition): AddResult[] {
	const indent = detectIndentFromFile(join(rootDir, def.filePath))
	const results: AddResult[] = []

	const errorResult = addMethod(rootDir, def, errorRenderTemplate(indent))
	results.push(errorResult)

	if (errorResult.success) {
		const nfResult = addMethod(rootDir, def, notFoundRenderTemplate(indent))
		results.push(nfResult)
	}

	return results
}

/**
 * Add unauthenticated render boundary.
 */
export function addUnauthenticatedBoundary(rootDir: string, def: RouteDefinition): AddResult {
	const indent = detectIndentFromFile(join(rootDir, def.filePath))
	return addMethod(rootDir, def, unauthenticatedRenderTemplate(indent))
}
