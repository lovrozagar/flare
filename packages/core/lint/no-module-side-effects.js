export const rule = {
	create(context) {
		return {
			ExpressionStatement(node) {
				if (context.filename.includes(".test.")) return;
				if (node.parent?.type !== "Program") return;
				if (node.expression?.type !== "CallExpression") return;
				const pure = context.sourceCode.getCommentsBefore(node).some((comment) => comment.value.includes("@__PURE__"));
				if (pure) return;
				context.report({ node, message: "top-level call needs /* @__PURE__ */" });
			},
		};
	},
};

export default {
	meta: { name: "flare" },
	rules: { "no-module-side-effects": rule },
};
