function isNewResponse(node) {
	return node?.type === "NewExpression" && node.callee?.name === "Response"
}

export const rule = {
	create(context) {
		return {
			ReturnStatement(node) {
				if (!isNewResponse(node.argument)) return
				const file = String(context.filename).replaceAll("\\", "/")
				if (file.endsWith("/finalize.ts")) return
				if (file.endsWith("/proxy.ts")) return
				// The dev host answers outside the pipeline: a server entry that fails to load (B34).
				if (file.endsWith("/vite/dev/handler.ts")) return
				// A dev document re-wrapped with the dev tags, after the pipeline answered (B95 (b)).
				if (file.endsWith("/server/render/dev-document.ts")) return
				// A dev-only endpoint answers on the dev server, outside the pipeline: the guard's 403, and its answer
				// without a CORS star (B75).
				if (file.endsWith("/vite/dev/guard.ts")) return
				// The image dev endpoint is one of those (bits/13).
				if (file.endsWith("/features/image/vite/dev-endpoint.ts")) return
				// The client rebuilds a server function's returned redirect from the 200 that carried it (BUGS.md 389).
				if (file.endsWith("/client/server-fn/call.ts")) return
				context.report({ node, message: "return new Response only from finalize" })
			},
		}
	},
}

export default {
	meta: { name: "flare" },
	rules: { "funnel-only": rule },
}
