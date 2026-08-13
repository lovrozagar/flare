/**
 * HeadContent Component
 *
 * Renders head elements from resolved HeadConfig during SSR.
 * Includes HydrationScript for client-side hydration.
 * On client, returns null (head already in DOM from SSR).
 */

import type { JSX } from "solid-js"
import { generateHydrationScript } from "solid-js/web"
import type { HeadConfig } from "../router/_internal/types"
import { useSSRContext } from "./ssr-context"

function buildRobotsContent(robots: HeadConfig["robots"]): string {
	if (!robots) return ""
	const parts: string[] = []
	if (robots.index === true) parts.push("index")
	if (robots.index === false) parts.push("noindex")
	if (robots.follow === true) parts.push("follow")
	if (robots.follow === false) parts.push("nofollow")
	if (robots.noarchive) parts.push("noarchive")
	if (robots.noimageindex) parts.push("noimageindex")
	if (robots["max-snippet"] !== undefined) parts.push(`max-snippet:${robots["max-snippet"]}`)
	if (robots["max-image-preview"]) parts.push(`max-image-preview:${robots["max-image-preview"]}`)
	if (robots["max-video-preview"] !== undefined)
		parts.push(`max-video-preview:${robots["max-video-preview"]}`)
	return parts.join(", ")
}

function HeadContent(): JSX.Element {
	const ctx = useSSRContext()

	/* On client, return null - head already in DOM from SSR */
	if (!ctx?.isServer) {
		return null as unknown as JSX.Element
	}

	const head = ctx.resolvedHead
	const elements: JSX.Element[] = []

	/* HydrationScript must be first in head for early execution */
	/* generateHydrationScript() returns full <script>...</script>, extract inner content */
	const hydrationScript = generateHydrationScript().replace(/^<script>|<\/script>$/g, "")
	elements.push(
		<script data-testid="hydration-script" nonce={ctx.nonce || undefined}>
			{hydrationScript}
		</script>,
	)

	if (head?.title) {
		elements.push(<title>{head.title}</title>)
	}

	if (head?.description) {
		elements.push(<meta content={head.description} name="description" />)
	}

	if (head?.keywords) {
		elements.push(<meta content={head.keywords} name="keywords" />)
	}

	if (head?.canonical) {
		elements.push(<link href={head.canonical} rel="canonical" />)
	}

	if (head?.robots) {
		const robotsContent = buildRobotsContent(head.robots)
		if (robotsContent) {
			elements.push(<meta content={robotsContent} name="robots" />)
		}
	}

	if (head?.openGraph) {
		const og = head.openGraph
		if (og.title) {
			elements.push(<meta content={og.title} property="og:title" />)
		}
		if (og.description) {
			elements.push(<meta content={og.description} property="og:description" />)
		}
		if (og.type) {
			elements.push(<meta content={og.type} property="og:type" />)
		}
		if (og.url) {
			elements.push(<meta content={og.url} property="og:url" />)
		}
		if (og.siteName) {
			elements.push(<meta content={og.siteName} property="og:site_name" />)
		}
		if (og.locale) {
			elements.push(<meta content={og.locale} property="og:locale" />)
		}
		/* Render OG images */
		if (og.images) {
			for (const img of og.images) {
				elements.push(<meta content={img.url} property="og:image" />)
				if (img.width) {
					elements.push(<meta content={String(img.width)} property="og:image:width" />)
				}
				if (img.height) {
					elements.push(<meta content={String(img.height)} property="og:image:height" />)
				}
				if (img.alt) {
					elements.push(<meta content={img.alt} property="og:image:alt" />)
				}
			}
		}
	}

	if (head?.twitter) {
		const tw = head.twitter
		if (tw.card) {
			elements.push(<meta content={tw.card} name="twitter:card" />)
		}
		if (tw.title) {
			elements.push(<meta content={tw.title} name="twitter:title" />)
		}
		if (tw.description) {
			elements.push(<meta content={tw.description} name="twitter:description" />)
		}
		if (tw.site) {
			elements.push(<meta content={tw.site} name="twitter:site" />)
		}
		if (tw.creator) {
			elements.push(<meta content={tw.creator} name="twitter:creator" />)
		}
		/* Render Twitter images */
		if (tw.images) {
			for (const img of tw.images) {
				elements.push(<meta content={img.url} name="twitter:image" />)
				if (img.alt) {
					elements.push(<meta content={img.alt} name="twitter:image:alt" />)
				}
			}
		}
	}

	/* Render JSON-LD structured data */
	if (head?.jsonLd) {
		const jsonLdContent = Array.isArray(head.jsonLd) ? head.jsonLd : [head.jsonLd]
		for (const ld of jsonLdContent) {
			elements.push(<script type="application/ld+json">{JSON.stringify(ld)}</script>)
		}
	}

	/* Render hreflang links */
	if (head?.languages) {
		for (const [lang, href] of Object.entries(head.languages)) {
			elements.push(<link href={href} hreflang={lang} rel="alternate" />)
		}
	}

	/* Render custom meta tags */
	if (head?.custom?.meta) {
		for (const meta of head.custom.meta) {
			if (meta.name && meta.content) {
				elements.push(<meta content={meta.content} name={meta.name} />)
			} else if (meta.property && meta.content) {
				elements.push(<meta content={meta.content} property={meta.property} />)
			}
		}
	}

	/* Always return elements - at minimum contains HydrationScript */
	return <>{elements}</>
}

export { HeadContent }
