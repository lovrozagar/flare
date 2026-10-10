const REASONS = new Set([
	"per-process-constant: build id",
	"per-process-constant: the in-flight render map in server/cache/inflight.ts",
]);

export const rule = {
	create(context) {
		return {
			VariableDeclaration(node) {
				if (context.filename.includes(".test.")) return;
				if (node.parent?.type !== "Program") return;
				if (node.kind !== "let") return;
				const allowed = context.sourceCode.getCommentsBefore(node).some((comment) => REASONS.has(comment.value.trim()));
				if (allowed) return;
				context.report({ node, message: "module-scope let needs a per-process-constant comment" });
			},
		};
	},
};

export default {
	meta: { name: "flare" },
	rules: { "no-module-state": rule },
};
