/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import { createImagePlugin } from "../../../src/plugins/image-plugin.ts";

interface LoadCtx {
	emitFile?: (f: { fileName: string; source: Buffer; type: "asset" }) => void;
	environment?: { config?: { mode?: string } };
}

/* Drives the plugin's load hook against a real PNG on disk */
async function runLoad(
	plugin: ReturnType<typeof createImagePlugin>,
	imagePath: string,
): Promise<{ emitted: Array<{ fileName: string }>; moduleCode: string }> {
	const emitted: Array<{ fileName: string }> = [];
	const emitFile = vi.fn((f: { fileName: string; source: Buffer; type: "asset" }) => {
		emitted.push({ fileName: f.fileName });
	});

	const fn = plugin.load as (this: LoadCtx, id: string) => Promise<{ code: string; moduleType: string } | null>;

	/* load hook expects the internal "\0flare-image:" prefix — resolveId adds it */
	const result = await fn.call(
		{
			emitFile,
			environment: { config: { mode: "production" } },
		},
		`\0flare-image:${imagePath}`,
	);

	return {
		emitted,
		moduleCode: result?.code ?? "",
	};
}

/* Minimal 1x1 red PNG — stable bytes, no sharp dependency needed for the loader */
const TEST_PNG = new URL("../../fixtures/assets-base/src/logo.png", import.meta.url).pathname;

describe("image plugin assetsBase", () => {
	it("image-plugin-variants-default", async () => {
		/* default createImagePlugin — variant URLs must be /assets/<filename> */
		const plugin = createImagePlugin({ image: { widths: [64] } });
		const { moduleCode, emitted } = await runLoad(plugin, TEST_PNG);
		const data = JSON.parse(moduleCode.replace(/^export default /, "")) as {
			variants: Record<string, string>;
		};
		const variantUrls = Object.values(data.variants);
		expect(variantUrls.length).toBeGreaterThan(0);
		for (const url of variantUrls) {
			expect(url).toMatch(/^\/assets\//);
		}
		/* on-disk emits should also use assets/ prefix */
		for (const f of emitted) {
			expect(f.fileName).toMatch(/^assets\//);
		}
	});

	it("image-plugin-variants-custom", async () => {
		const createImagePluginExtended = createImagePlugin as unknown as (
			config: { image?: { widths?: number[] } } | undefined,
			assetsBase: string,
			assetsDir: string,
		) => ReturnType<typeof createImagePlugin>;

		const plugin = createImagePluginExtended({ image: { widths: [64] } }, "/app/assets", "app/assets");
		const { moduleCode, emitted } = await runLoad(plugin, TEST_PNG);
		const data = JSON.parse(moduleCode.replace(/^export default /, "")) as {
			variants: Record<string, string>;
		};
		const variantUrls = Object.values(data.variants);
		expect(variantUrls.length).toBeGreaterThan(0);
		for (const url of variantUrls) {
			expect(url).toMatch(/^\/app\/assets\//);
		}
		for (const f of emitted) {
			expect(f.fileName).toMatch(/^app\/assets\//);
		}
	});
});
