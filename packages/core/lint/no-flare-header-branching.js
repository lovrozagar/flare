function headerValue(node) {
	const value = node.arguments?.[0]?.value;
	return typeof value === "string" ? value : "";
}

export const rule = {
	create(context) {
		return {
			CallExpression(node) {
				const name = node.callee?.property?.name;
				if (name !== "get" && name !== "set") return;
				const header = headerValue(node);
				if (!header.startsWith("flare-")) return;
				const file = String(context.filename).replaceAll("\\", "/");
				if (name === "set" && file.endsWith("/finalize.ts")) return;
				context.report({ node, message: "do not branch on a flare- request header" });
			},
		};
	},
};

export default {
	meta: { name: "flare" },
	rules: { "no-flare-header-branching": rule },
};
