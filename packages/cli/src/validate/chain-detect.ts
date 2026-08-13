const NEXT_EXPORT_RE = /\nexport\s+const\s+/

export interface ChainMethods {
	hasAuthorize: boolean
	hasEffects: boolean
	hasErrorRender: boolean
	hasHead: boolean
	hasHeaders: boolean
	hasLoader: boolean
	hasNotFoundRender: boolean
	hasPreloader: boolean
	hasRender: boolean
	hasResponse: boolean
	hasUnauthenticatedRender: boolean
	hasUnauthorizedRender: boolean
}

const METHOD_PATTERNS: Array<[keyof ChainMethods, RegExp]> = [
	["hasAuthorize", /\.authorize\s*\(/],
	["hasEffects", /\.effects\s*\(/],
	["hasErrorRender", /\.errorRender\s*\(/],
	["hasHead", /\.head\s*\(/],
	["hasHeaders", /\.headers\s*\(/],
	["hasLoader", /\.loader\s*\(/],
	["hasNotFoundRender", /\.notFoundRender\s*\(/],
	["hasPreloader", /\.preloader\s*\(/],
	["hasRender", /\.render\s*\(/],
	["hasResponse", /\.response\s*\(/],
	["hasUnauthenticatedRender", /\.unauthenticatedRender\s*\(/],
	["hasUnauthorizedRender", /\.unauthorizedRender\s*\(/],
]

/**
 * Extract chain scope from source starting at a builder call match position.
 * Returns text from match end to next `export const` or EOF.
 */
export function extractChainScope(source: string, matchEnd: number): string {
	const rest = source.slice(matchEnd)
	const boundary = NEXT_EXPORT_RE.exec(rest)
	return boundary ? rest.slice(0, boundary.index) : rest
}

/**
 * Detect which builder chain methods are present in a chain scope.
 */
export function detectChainMethods(chainScope: string): ChainMethods {
	const result: ChainMethods = {
		hasAuthorize: false,
		hasEffects: false,
		hasErrorRender: false,
		hasHead: false,
		hasHeaders: false,
		hasLoader: false,
		hasNotFoundRender: false,
		hasPreloader: false,
		hasRender: false,
		hasResponse: false,
		hasUnauthenticatedRender: false,
		hasUnauthorizedRender: false,
	}

	for (const [key, pattern] of METHOD_PATTERNS) {
		result[key] = pattern.test(chainScope)
	}

	return result
}

const BUILDER_RE =
	/export\s+const\s+(\w+)\s*=\s*(createPage|createLayout|createRootLayout|createPathSegment)\s*(?:<[^>]*>)?\s*\(\s*["'`]([^"'`]+)["'`]/g

export interface DetectedRoute {
	builderType: string
	chainMethods: ChainMethods
	exportName: string
	matchEnd: number
	matchStart: number
	virtualPath: string
}

/**
 * Detect all builder chains in a source file with their methods.
 */
export function detectAllChains(source: string): DetectedRoute[] {
	const results: DetectedRoute[] = []
	const re = new RegExp(BUILDER_RE.source, "g")
	let match = re.exec(source)

	while (match !== null) {
		const chainScope = extractChainScope(source, match.index + match[0].length)
		results.push({
			builderType: match[2] ?? "",
			chainMethods: detectChainMethods(chainScope),
			exportName: match[1] ?? "",
			matchEnd: match.index + match[0].length,
			matchStart: match.index,
			virtualPath: match[3] ?? "",
		})
		match = re.exec(source)
	}

	return results
}
