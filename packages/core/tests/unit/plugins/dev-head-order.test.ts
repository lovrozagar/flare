/** @vitest-environment node */
/*
 * Solid hydrates <head> by walking its children in the order it rendered them. Static elements
 * (meta, title) before components (ThemeScript) must keep that order in the served HTML, and
 * anything injected ahead of them (Vite's /@vite/client) must move after them.
 */
import { afterEach, describe, expect, it } from "vitest";
import { type DevApp, startDevApp } from "../../dev-app.ts";

const apps: DevApp[] = [];

afterEach(async () => {
	for (const app of apps.splice(0)) await app.close();
});

const ROOT_LAYOUT = `import { createRootLayout } from "@lovrozagar/flare/root-layout";
import { ThemeScript } from "@lovrozagar/flare/theme";

export const route = createRootLayout("_root_").render((props) => (
	<html lang="en">
		<head>
			<meta charset="utf-8" />
			<title>Head order</title>
			<ThemeScript />
		</head>
		<body>{props.children}</body>
	</html>
));
`;

function headInner(html: string): string {
	const open = /<head[^>]*>/.exec(html);
	if (!open) throw new Error("no <head> in response");
	return html.slice(open.index + open[0].length, html.indexOf("</head>"));
}

describe("dev SSR <head> order", () => {
	it("serves Solid's head children first, in render order, with Vite's client after them", async () => {
		const app = await startDevApp({ files: { "src/routes/_root_.tsx": ROOT_LAYOUT } });
		apps.push(app);
		const head = headInner(await app.get("/"));
		expect(head.startsWith('<meta charset="utf-8"><title>Head order</title><!--$--><script')).toBe(true);
		expect(head.indexOf("/@vite/client")).toBeGreaterThan(head.indexOf("<!--/-->"));
	}, 120_000);
});
