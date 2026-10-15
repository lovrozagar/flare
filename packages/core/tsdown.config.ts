import { readFileSync } from "node:fs"
import { join } from "node:path"
import { defineConfig } from "tsdown"

// The `./vite` entry's triple-slash reference to the image module types (B88). The declaration bundler drops it, so
// the build writes the source's own line back onto that entry's declarations.
const VITE_REFERENCE = /^\/\/\/ <reference path="[^"]+" preserve="true" \/>$/m.exec(
	readFileSync("src/exports/vite.ts", "utf8"),
)?.[0]

// The packager (bits/14, B18): one compiled ESM file per source module, mirroring `src`, each with its declarations.
// Every bare import stays external: the package has peers and no dependencies (B79). The image module types are a
// declaration input, which no compiler copies, so the build copies them where `exports/vite.d.ts` references them.
export default defineConfig({
	entry: ["src/exports/*.ts", "src/features/fonts/shared/generated/*.ts", "src/vite/bin/flare.ts"],
	root: "src",
	outDir: "dist",
	unbundle: true,
	format: "esm",
	platform: "neutral",
	target: "esnext",
	fixedExtension: false,
	hash: false,
	tsconfig: "tsconfig.src.json",
	dts: true,
	deps: { neverBundle: [/^[^./]/] },
	banner: ({ fileName }) => (fileName.startsWith("exports/vite.") ? { dts: VITE_REFERENCE } : undefined),
	copy: (config) => [
		{ from: "src/features/image/vite/modules.d.ts", to: join(config.outDir, "features/image/vite"), flatten: true },
	],
	report: false,
	// flare() replaces whole modules by path at load time: build-info, the sync switch, the sheet, and the image config.
	// Inlining their constants into importers would leave nothing to replace, so every module keeps its own file.
	inputOptions: { optimization: { inlineConst: false } },
})
