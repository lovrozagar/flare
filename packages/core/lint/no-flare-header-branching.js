function headerLiteral(node) {
	const value = node.arguments?.[0]?.value
	return typeof value === "string" ? value : undefined
}

// B40's one exception: the dev-only tab header, which routes a dev payload and changes no response (B42).
function isDevTab(node) {
	const argument = node.arguments?.[0]
	return argument?.value === "flare-dev-tab" || (argument?.type === "Identifier" && argument.name === "TAB_HEADER")
}

function isHeaders(callee) {
	const object = callee?.object
	if (object?.type === "Identifier") return object.name === "headers"
	return object?.property?.name === "headers"
}

export const rule = {
	create(context) {
		return {
			CallExpression(node) {
				const name = node.callee?.property?.name
				if (name !== "get" && name !== "set") return
				if (!isHeaders(node.callee) || isDevTab(node)) return
				const file = String(context.filename).replaceAll("\\", "/")
				if (name === "set" && file.endsWith("/finalize.ts")) return
				// The client reads flare- headers on a response, such as flare-build (bit 06). Only the server must
				// not branch on one a request sent.
				if (name === "get" && file.includes("/src/client/")) return
				const header = headerLiteral(node)
				if (header === undefined) {
					if (name === "get") context.report({ node, message: "do not branch on a flare- request header" })
					return
				}
				if (!header.toLowerCase().startsWith("flare-")) return
				context.report({ node, message: "do not branch on a flare- request header" })
			},
		}
	},
}

export default {
	meta: { name: "flare" },
	rules: { "no-flare-header-branching": rule },
}
