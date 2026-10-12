function isNewResponse(node) {
	return node?.type === "NewExpression" && node.callee?.name === "Response";
}

export const rule = {
	create(context) {
		return {
			ReturnStatement(node) {
				if (!isNewResponse(node.argument)) return;
				const file = String(context.filename).replaceAll("\\", "/");
				if (file.endsWith("/finalize.ts")) return;
				if (file.endsWith("/proxy.ts")) return;
				context.report({ node, message: "return new Response only from finalize" });
			},
		};
	},
};

export default {
	meta: { name: "flare" },
	rules: { "funnel-only": rule },
};
