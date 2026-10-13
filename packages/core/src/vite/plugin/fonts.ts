import { resolve } from "path";
import type { Plugin } from "vite";
import { emitFonts, fontRegistry } from "../../features/fonts/vite/index.ts";

// A registry family module, from source in the workspace or compiled in the installed package (B78).
const GENERATED = /features\/fonts\/shared\/generated\/([a-z0-9-]+)\.(?:ts|js)$/;

// The families among the client build's modules, by the generated modules it loaded.
function familiesOf(ids: Iterable<string>): string[] {
	const families = new Set<string>();
	for (const id of ids) {
		const family = GENERATED.exec(id.replaceAll("\\", "/"))?.[1];
		if (family !== undefined) families.add(family);
	}
	return [...families].toSorted();
}

// `flare({ fonts: { dir } })` (dx/plugin.md fonts): the client build emits only the used families' woff2 files from
// `dir`, at their registry url. A missing file fails the build and names it.
export function fontsPlugin(dir: string): Plugin {
	return {
		name: "flare:fonts",
		applyToEnvironment: (environment) => environment.name === "client",
		async generateBundle() {
			await emitFonts({
				registry: fontRegistry,
				families: familiesOf(this.getModuleIds()),
				source: resolve(this.environment.config.root, dir),
				emit: (file) => void this.emitFile({ type: "asset", fileName: file.fileName, source: file.source }),
			});
		},
	};
}
