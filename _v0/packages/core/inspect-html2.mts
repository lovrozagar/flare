import { createServer } from "vite";
import { createCssTransformPlugin } from "./src/plugins/css-transform.ts";

const server = await createServer({
	plugins: [createCssTransformPlugin() as any],
	server: { port: 4001 },
});

const testHtml = `<!doctype html><html><head>
<style nonce="test">@layer reset {button { background-color: transparent }}</style>
</head><body></body></html>`;

const result = await server.transformIndexHtml("/", testHtml);
console.log("Result HTML:", result.slice(0, 500));
await server.close();
