export const rule = {
	create(context) {
		return {
			CallExpression(node) {
				const object = node.callee?.object
				const name = node.callee?.property?.name
				if (object?.name !== "pathname") return
				if (name !== "startsWith" && name !== "endsWith") return
				context.report({ node, message: "use hasPathPrefix" })
			},
		}
	},
}

export default {
	meta: { name: "flare" },
	rules: { "path-prefix": rule },
}
