import { createServer } from "vite";

// Fixed plugin: exclude html-proxy virtual CSS from layer stripping
const LAYER_RE = /@layer\s+(?:[\w-]+\s*)?\{/g;

function stripLayerWrappers(css: string): string {
	let result = css;
	while (true) {
		LAYER_RE.lastIndex = 0;
		const match = LAYER_RE.exec(result);
		if (!match) break;
		const openIdx = match.index;
		const afterOpen = openIdx + match[0].length;
		let depth = 1;
		let closeIdx = -1;
		for (let i = afterOpen; i < result.length; i++) {
			if (result[i] === "{") depth++;
			else if (result[i] === "}") {
				depth--;
				if (depth === 0) {
					closeIdx = i;
					break;
				}
			}
		}
		if (closeIdx === -1) break;
		const inner = result.slice(afterOpen, closeIdx);
		result = result.slice(0, openIdx) + inner + result.slice(closeIdx + 1);
	}
	return result;
}

const fixedPlugin = {
	name: "test:css-transform-fixed",
	transform(code: string, id: string) {
		if (!id.endsWith(".css")) return null;
		// NEW: skip Vite's virtual html-proxy CSS (inline <style> elements in SSR HTML)
		if (id.includes("?html-proxy") || id.includes("?direct")) return null;
		let transformed = code;
		transformed = stripLayerWrappers(transformed);
		if (transformed === code) return null;
		return { code: transformed, map: null };
	},
};

const server = await createServer({
	plugins: [fixedPlugin as any],
	server: { port: 4002 },
});

const testHtml = `<!doctype html><html><head>
<style nonce="test">@layer reset {button { background-color: transparent }}</style>
</head><body></body></html>`;

const result = await server.transformIndexHtml("/", testHtml);
console.log("With fix — @layer reset preserved:", result.includes("@layer reset"));
await server.close();
