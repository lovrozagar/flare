import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { SSRContextProvider } from "../../../src/components/ssr-context.tsx";
import { FontCSS } from "../../../src/fonts/component.tsx";
import { createRegistryFont } from "../../../src/fonts/create-registry-font.ts";

const inter = createRegistryFont({
	category: "sans-serif",
	fallbackMetrics: {
		ascentOverride: "90.44%",
		descentOverride: "22.52%",
		fallbackFont: "Arial",
		lineGapOverride: "0.00%",
		sizeAdjust: "107.12%",
	},
	family: "Inter",
	subsetEntries: [
		{
			style: "normal",
			subset: "latin",
			unicodeRange: "U+0000-00FF",
			url: "/fonts/inter/latin.woff2",
			weight: "100 900",
		},
		{
			style: "normal",
			subset: "cyrillic",
			unicodeRange: "U+0400-045F",
			url: "/fonts/inter/cyrillic.woff2",
			weight: "100 900",
		},
	],
	subsets: ["cyrillic", "latin"],
	weights: "100 900",
});

describe("FontCSS", () => {
	it("renders style tag with @font-face CSS", () => {
		const { container } = render(() => (
			<SSRContextProvider value={{ flareStateScript: "", isServer: false, nonce: "" }}>
				<FontCSS font={inter} />
			</SSRContextProvider>
		));
		const style = container.querySelector("style");
		expect(style).toBeTruthy();
		expect(style?.innerHTML).toContain("Inter");
		expect(style?.innerHTML).toContain("font-family:");
	});

	it("renders preload link by default", () => {
		const { container } = render(() => (
			<SSRContextProvider value={{ flareStateScript: "", isServer: false, nonce: "" }}>
				<FontCSS font={inter} />
			</SSRContextProvider>
		));
		const link = container.querySelector("link[rel='preload']");
		expect(link).toBeTruthy();
		expect(link?.getAttribute("href")).toBe("/fonts/inter/latin.woff2");
		expect(link?.getAttribute("as")).toBe("font");
		expect(link?.getAttribute("type")).toBe("font/woff2");
	});

	it("filters by subsets prop", () => {
		const { container } = render(() => (
			<SSRContextProvider value={{ flareStateScript: "", isServer: false, nonce: "" }}>
				<FontCSS font={inter} subsets={["latin"]} />
			</SSRContextProvider>
		));
		const style = container.querySelector("style");
		expect(style?.innerHTML).toContain("/fonts/inter/latin.woff2");
		expect(style?.innerHTML).not.toContain("/fonts/inter/cyrillic.woff2");
	});

	it("disables preload with preload={false}", () => {
		const { container } = render(() => (
			<SSRContextProvider value={{ flareStateScript: "", isServer: false, nonce: "" }}>
				<FontCSS font={inter} preload={false} />
			</SSRContextProvider>
		));
		const link = container.querySelector("link[rel='preload']");
		expect(link).toBeNull();
	});

	it("preloads specific subset", () => {
		const { container } = render(() => (
			<SSRContextProvider value={{ flareStateScript: "", isServer: false, nonce: "" }}>
				<FontCSS font={inter} preload="cyrillic" />
			</SSRContextProvider>
		));
		const link = container.querySelector("link[rel='preload']");
		expect(link?.getAttribute("href")).toBe("/fonts/inter/cyrillic.woff2");
	});
});
