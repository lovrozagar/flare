/**
 * Head Resolution
 *
 * Merges HeadConfig across route chain (root-layout → layouts → page).
 * Child values override parent for scalars, arrays concatenate.
 */

import type { Thing } from "schema-dts"
import type { FlareLocation, HeadConfig } from "../../router/_internal/types"

interface HeadContext {
	cause: "enter" | "stay"
	loaderData: unknown
	location: FlareLocation
	parentHead?: HeadConfig
	prefetch: boolean
	preloaderContext: unknown
}

interface RouteMatch {
	context: Omit<HeadContext, "parentHead">
	route: {
		head?: (ctx: HeadContext) => HeadConfig
	}
}

function mergeHeadConfigs(
	parent: HeadConfig | undefined,
	child: HeadConfig | undefined,
): HeadConfig {
	if (!parent && !child) {
		return {}
	}
	if (!parent) {
		return child ?? {}
	}
	if (!child) {
		return parent
	}

	const result: HeadConfig = { ...parent }

	if (child.title !== undefined) {
		result.title = child.title
	}
	if (child.description !== undefined) {
		result.description = child.description
	}
	if (child.canonical !== undefined) {
		result.canonical = child.canonical
	}
	if (child.keywords !== undefined) {
		result.keywords = child.keywords
	}
	if (child.css !== undefined) {
		result.css = child.css
	}

	if (child.robots !== undefined) {
		result.robots = child.robots
	}
	if (child.openGraph !== undefined) {
		result.openGraph = child.openGraph
	}
	if (child.twitter !== undefined) {
		result.twitter = child.twitter
	}
	if (child.favicons !== undefined) {
		result.favicons = child.favicons
	}

	if (child.meta !== undefined) {
		result.meta = parent.meta ? { ...parent.meta, ...child.meta } : child.meta
	}

	if (child.languages !== undefined) {
		result.languages = parent.languages
			? { ...parent.languages, ...child.languages }
			: child.languages
	}

	if (child.images !== undefined) {
		result.images = parent.images ? [...parent.images, ...child.images] : child.images
	}

	if (child.jsonLd !== undefined) {
		let parentLd: Thing[] = []
		if (parent.jsonLd) {
			parentLd = Array.isArray(parent.jsonLd) ? parent.jsonLd : [parent.jsonLd]
		}
		const childLd: Thing[] = Array.isArray(child.jsonLd) ? child.jsonLd : [child.jsonLd]
		result.jsonLd = [...parentLd, ...childLd]
	}

	if (child.custom !== undefined) {
		if (parent.custom) {
			result.custom = {
				links:
					parent.custom.links || child.custom.links
						? [...(parent.custom.links ?? []), ...(child.custom.links ?? [])]
						: undefined,
				meta:
					parent.custom.meta || child.custom.meta
						? [...(parent.custom.meta ?? []), ...(child.custom.meta ?? [])]
						: undefined,
				scripts:
					parent.custom.scripts || child.custom.scripts
						? [...(parent.custom.scripts ?? []), ...(child.custom.scripts ?? [])]
						: undefined,
				styles:
					parent.custom.styles || child.custom.styles
						? [...(parent.custom.styles ?? []), ...(child.custom.styles ?? [])]
						: undefined,
			}
		} else {
			result.custom = child.custom
		}
	}

	return result
}

function resolveHeadChain(matches: RouteMatch[]): HeadConfig {
	let accumulated: HeadConfig = {}

	for (const match of matches) {
		if (!match.route.head) {
			continue
		}

		const ctx: HeadContext = {
			...match.context,
			parentHead: accumulated,
		}

		const headResult = match.route.head(ctx)
		accumulated = mergeHeadConfigs(accumulated, headResult)
	}

	return accumulated
}

export { mergeHeadConfigs, resolveHeadChain }
export type { HeadContext, RouteMatch }
