export const rule = {
	create(context) {
		return {
			Program(node) {
				for (const comment of context.sourceCode.getAllComments()) {
					if (!comment.value.includes("v8 ignore")) continue;
					context.report({ node, message: "v8 ignore comments are forbidden" });
				}
			},
		};
	},
};

export default {
	meta: { name: "flare" },
	rules: { "no-v8-ignore": rule },
};
