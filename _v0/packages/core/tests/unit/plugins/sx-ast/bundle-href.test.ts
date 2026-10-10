/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import { createSxAstPlugin } from "../../../../src/plugins/sx-ast/index.ts";

interface GenerateBundleCtx {
	emitFile: (f: { type: string; fileName: string; source: string }) => void;
}

function runGenerateBundle(plugin: ReturnType<typeof createSxAstPlugin>): Record<string, string> {
	const emitted: Record<string, string> = {};
	const emitFile = vi.fn((f: { type: string; fileName: string; source: string }) => {
		emitted[f.fileName] = f.source;
	});
	const fn = plugin.generateBundle as (this: GenerateBundleCtx, opts: unknown, bundle: unknown) => void;
	fn.call({ emitFile }, {}, {});
	return emitted;
}

describe("sx-ast bundleHref", () => {
	it("sx-bundle-href-default", () => {
		/* no assetsBase arg → must default to "/assets" */
		const plugin = createSxAstPlugin({ manifest: true });
		const emitted = runGenerateBundle(plugin);
		const manifest = JSON.parse(emitted["flare-sx-manifest.json"] ?? "{}");
		expect(manifest.bundleHref).toBe("/assets/flare-global.css");
	});

	it("sx-bundle-href-custom", () => {
		const plugin = (
			createSxAstPlugin as unknown as (opts: object, assetsBase: string) => ReturnType<typeof createSxAstPlugin>
		)({ manifest: true }, "/app/assets");
		const emitted = runGenerateBundle(plugin);
		const manifest = JSON.parse(emitted["flare-sx-manifest.json"] ?? "{}");
		expect(manifest.bundleHref).toBe("/app/assets/flare-global.css");
	});
});
