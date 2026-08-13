import { skipStringOrComment } from "flare/generators"

/**
 * Method insertion hierarchy — higher level = earlier in chain.
 * Insert before the first existing method with a lower level.
 */
const METHOD_LEVEL: Record<string, number> = {
	authenticate: 8,
	authorize: 7,
	cache: 10,
	effects: 6,
	errorRender: 0,
	head: 3,
	headers: 2,
	input: 9,
	intercept: 10,
	loader: 4,
	notFoundRender: 0,
	preloader: 5,
	render: 1,
	response: 1,
	unauthenticatedRender: 0,
	unauthorizedRender: 0,
}

const BUILDER_RE =
	/export\s+const\s+(\w+)\s*=\s*(createPage|createLayout|createRootLayout|createPathSegment)\s*(?:<[^>]*>)?\s*\(\s*["'`]([^"'`]*)["'`]\s*\)/g

const NEXT_EXPORT_RE = /\nexport\s+const\s+/

interface MethodPosition {
	level: number
	name: string
	offset: number
}

/**
 * Find all chain method call positions within a chain scope.
 * Skips methods inside strings, comments, and template literals.
 */
function findMethodPositions(chainScope: string): MethodPosition[] {
	const positions: MethodPosition[] = []
	const methodNames = Object.keys(METHOD_LEVEL)

	for (let i = 0; i < chainScope.length; i++) {
		const skipped = skipStringOrComment(chainScope, i)
		if (skipped !== i) {
			i = skipped
			continue
		}

		if (chainScope[i] !== ".") continue

		for (const name of methodNames) {
			if (!chainScope.startsWith(name, i + 1)) continue
			const afterName = i + 1 + name.length
			/* Must be followed by optional whitespace/generic then ( */
			const rest = chainScope.slice(afterName)
			if (/^\s*(?:<[^>]*>)?\s*\(/.test(rest)) {
				positions.push({
					level: METHOD_LEVEL[name] ?? 0,
					name,
					offset: i,
				})
				break
			}
		}
	}

	return positions.sort((a, b) => b.level - a.level)
}

export interface InsertionResult {
	chainEnd: number
	chainStart: number
	existingMethods: string[]
	indent: string
	insertOffset: number
}

/**
 * Find the insertion position for a new method in a builder chain.
 * Returns null if the builder call isn't found or the virtual path doesn't match.
 */
export function findInsertionPoint(
	source: string,
	virtualPath: string,
	methodName: string,
): InsertionResult | null {
	const re = new RegExp(BUILDER_RE.source, "g")
	let match = re.exec(source)

	while (match !== null) {
		if (match[3] === virtualPath) {
			const chainStart = match.index
			const matchEnd = match.index + match[0].length

			/* Chain scope: from match end to next export const or EOF */
			const rest = source.slice(matchEnd)
			const boundary = NEXT_EXPORT_RE.exec(rest)
			const chainScope = boundary ? rest.slice(0, boundary.index) : rest
			const chainEnd = matchEnd + chainScope.length

			/* Detect indentation from existing chain */
			const indentMatch = /\n(\t+|\s+)\./.exec(chainScope)
			const indent = indentMatch ? (indentMatch[1] ?? "\t") : "\t"

			/* Find existing methods */
			const positions = findMethodPositions(chainScope)
			const existingMethods = positions.map((p) => p.name)

			/* Check for duplicate */
			if (existingMethods.includes(methodName)) return null

			const targetLevel = METHOD_LEVEL[methodName] ?? 0

			/* Find insertion point: before first method with lower level */
			const lowerMethod = positions.find((p) => p.level < targetLevel)

			let insertOffset: number
			if (lowerMethod) {
				/* Find the newline that precedes the method's dot, insert before it.
				   This keeps the existing \n\t.method() intact and our template adds \n\t.newMethod() before it. */
				let nlPos = lowerMethod.offset - 1
				while (nlPos >= 0 && chainScope[nlPos] !== "\n") {
					nlPos--
				}
				insertOffset = matchEnd + (nlPos >= 0 ? nlPos : lowerMethod.offset)
			} else if (positions.length > 0) {
				/* All existing methods are same or higher level — insert after last method's closing.
				   Trim trailing whitespace so template's \n doesn't create a blank line. */
				let trimEnd = chainScope.length
				while (
					trimEnd > 0 &&
					(chainScope[trimEnd - 1] === "\n" ||
						chainScope[trimEnd - 1] === "\r" ||
						chainScope[trimEnd - 1] === " " ||
						chainScope[trimEnd - 1] === "\t")
				) {
					trimEnd--
				}
				insertOffset = matchEnd + trimEnd
			} else {
				/* No methods — insert right after builder call close paren */
				insertOffset = matchEnd
			}

			return {
				chainEnd,
				chainStart,
				existingMethods,
				indent,
				insertOffset,
			}
		}
		match = re.exec(source)
	}

	return null
}
