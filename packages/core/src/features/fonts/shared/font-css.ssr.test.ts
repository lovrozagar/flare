import { createComponent } from "solid-js";
import { renderToString } from "@solidjs/web";
import { expect, it } from "vitest";
import { withRequest } from "../../../shared/csp/index.ts";
import { createFont } from "./create-font.ts";
import { FontCSS } from "./font-css.tsx";

// FontCSS on Solid's server build. The client rows are font-css.test.tsx.
const font = createFont({ family: 'Brand "</style>', src: "/fonts/brand.woff2", category: "serif" });

function serverHtml(requestNonce: string): string {
	return withRequest({ path: "/", nonce: requestNonce }, () =>
		renderToString(() => createComponent(FontCSS, { font })),
	);
}

it("nonce", () => {
	const html = serverHtml("r1");
	expect(html).toMatch(/^<style[^>]* nonce="r1">@font-face\{font-family:"Brand \\22 \\3C \/style\\3E ";/);
	expect(html.match(/<\/style>/gi)).toHaveLength(1);
	expect(html).toMatch(/<link[^>]* rel="preload" as="font" type="font\/woff2" crossorigin href="\/fonts\/brand.woff2"/);
	expect(serverHtml("")).not.toContain("nonce");
});
