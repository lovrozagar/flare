export const rule = {
	create(context) {
		return {
			CallExpression(node) {
				if (String(context.filename).includes("/server/redirect/")) return;
				const name = node.callee?.property?.name;
				const header = node.arguments?.[0]?.value;
				if (name === "set" && header === "Location") {
					context.report({ node, message: "build Location in server/redirect" });
				}
			},
		};
	},
};

export default {
	meta: { name: "flare" },
	rules: { "location-only-in-redirect": rule },
};
