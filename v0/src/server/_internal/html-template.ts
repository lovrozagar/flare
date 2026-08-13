/**
 * HTML Template Builder
 *
 * Builds HTML documents using template literals (NOT string replace).
 * Guarantees structure and injection order.
 */

import type { Direction } from "../../_internal/types"

interface MetaTag {
	charset?: string
	content?: string
	httpEquiv?: string
	name?: string
	property?: string
}

interface LinkTag {
	as?: string
	crossorigin?: string
	href: string
	rel: string
	type?: string
}

interface DataScript {
	data: unknown
	id: string
}

interface HeadOptions {
	links?: LinkTag[]
	meta?: MetaTag[]
	scripts?: string[]
	styles?: string[]
	title?: string
}

interface BodyOptions {
	attributes?: Record<string, string>
	content: string
	dataScripts?: DataScript[]
	moduleScripts?: string[]
	scripts?: string[]
}

interface HtmlDocumentOptions {
	body: BodyOptions
	dir?: Direction
	head: HeadOptions
	htmlAttributes?: Record<string, string>
	lang?: string
	nonce: string
	trustedTypesPolicy?: string
}

function escapeHtml(str: string): string {
	if (!str) return ""
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;")
}

function escapeJsonScript(json: string): string {
	return json.replace(/<\/script>/gi, "<\\/script>")
}

function buildDataScript(id: string, data: unknown, nonce: string): string {
	const json = JSON.stringify(data)
	const escapedJson = escapeJsonScript(json)
	return `<script nonce="${nonce}" id="${id}" type="application/json">${escapedJson}</script>`
}

function buildInlineScript(content: string, nonce: string): string {
	return `<script nonce="${nonce}">${content}</script>`
}

function buildModuleScript(src: string, nonce: string): string {
	return `<script nonce="${nonce}" type="module" src="${src}"></script>`
}

function buildStyleTag(content: string, nonce: string): string {
	return `<style nonce="${nonce}">${content}</style>`
}

function buildMetaTag(meta: MetaTag): string {
	if (meta.charset) {
		return `<meta charset="${meta.charset}">`
	}
	const attrs: string[] = []
	if (meta.name) attrs.push(`name="${meta.name}"`)
	if (meta.property) attrs.push(`property="${meta.property}"`)
	if (meta.httpEquiv) attrs.push(`http-equiv="${meta.httpEquiv}"`)
	if (meta.content) attrs.push(`content="${escapeHtml(meta.content)}"`)
	return `<meta ${attrs.join(" ")}>`
}

function buildLinkTag(link: LinkTag): string {
	const attrs: string[] = [`rel="${link.rel}"`, `href="${link.href}"`]
	if (link.type) attrs.push(`type="${link.type}"`)
	if (link.as) attrs.push(`as="${link.as}"`)
	if (link.crossorigin) attrs.push(`crossorigin="${link.crossorigin}"`)
	return `<link ${attrs.join(" ")}>`
}

function buildAttributes(attrs: Record<string, string>): string {
	return Object.entries(attrs)
		.map(([key, value]) => `${key}="${escapeHtml(value)}"`)
		.join(" ")
}

function buildHtmlDocument(options: HtmlDocumentOptions): string {
	const { body, dir, head, htmlAttributes = {}, lang, nonce, trustedTypesPolicy } = options

	const htmlAttrs: string[] = []
	if (lang) htmlAttrs.push(`lang="${lang}"`)
	if (dir) htmlAttrs.push(`dir="${dir}"`)
	for (const [key, value] of Object.entries(htmlAttributes)) {
		htmlAttrs.push(`${key}="${escapeHtml(value)}"`)
	}
	const htmlAttrStr = htmlAttrs.length > 0 ? ` ${htmlAttrs.join(" ")}` : ""

	const headParts: string[] = []

	if (trustedTypesPolicy) {
		headParts.push(buildInlineScript(trustedTypesPolicy, nonce))
	}

	headParts.push('<meta charset="utf-8">')
	headParts.push('<meta name="viewport" content="width=device-width, initial-scale=1">')

	if (head.title) {
		headParts.push(`<title>${escapeHtml(head.title)}</title>`)
	}

	if (head.meta) {
		for (const meta of head.meta) {
			headParts.push(buildMetaTag(meta))
		}
	}

	if (head.links) {
		for (const link of head.links) {
			headParts.push(buildLinkTag(link))
		}
	}

	if (head.styles) {
		for (const style of head.styles) {
			headParts.push(buildStyleTag(style, nonce))
		}
	}

	if (head.scripts) {
		for (const script of head.scripts) {
			headParts.push(buildInlineScript(script, nonce))
		}
	}

	const bodyAttrs = body.attributes ? ` ${buildAttributes(body.attributes)}` : ""

	const bodyEndParts: string[] = []

	if (body.scripts) {
		for (const script of body.scripts) {
			bodyEndParts.push(buildInlineScript(script, nonce))
		}
	}

	if (body.dataScripts) {
		for (const ds of body.dataScripts) {
			bodyEndParts.push(buildDataScript(ds.id, ds.data, nonce))
		}
	}

	if (body.moduleScripts) {
		for (const src of body.moduleScripts) {
			bodyEndParts.push(buildModuleScript(src, nonce))
		}
	}

	const headContent = headParts.join("\n\t\t")
	const bodyEndContent = bodyEndParts.length > 0 ? `\n\t\t${bodyEndParts.join("\n\t\t")}\n\t` : ""

	return `<!DOCTYPE html>
<html${htmlAttrStr}>
\t<head>
\t\t${headContent}
\t</head>
\t<body${bodyAttrs}>
\t\t${body.content}${bodyEndContent}
\t</body>
</html>`
}

export type { BodyOptions, DataScript, HeadOptions, HtmlDocumentOptions, LinkTag, MetaTag }

export { buildDataScript, buildHtmlDocument, buildInlineScript, escapeHtml }
