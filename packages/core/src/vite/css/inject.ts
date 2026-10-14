import { resolve } from "node:path";
import type { Plugin } from "vite";
import { parseCss } from "../../shared/css/parse.ts";
import { stylesheetOf, type BuiltStylesheet } from "./bundle.ts";
import { RESET } from "./reset.ts";
import { ownModule } from "../plugin/own-module.ts";
import { realPath } from "../plugin/real-path.ts";

// Typed as a string, so no declaration file carries a `virtual:` id (bits/14 `no src path in dts`). It resolves to
// itself, with no NUL prefix, because Vite's client keys the dev style by this id and a dev document writes it into a
// `data-vite-dev-id` attribute, which cannot hold a NUL (B104). A query, such as `?direct`, is kept.
export const RESET_ID: string = "virtual:flare/reset.css";

// The module the server reads the built stylesheet from. The package ships its source, so this is the file Vite loads.
const SHEET = ownModule("../../shared/css/sheet.ts", import.meta.url);

const SERVER_ENVIRONMENTS = new Set(["ssr", "worker"]);

export type CssOptions = { reset: boolean; clientEntry: string; assetsBase: string };

// The one stylesheet (B15). The client environment builds without CSS code splitting, and with `reset` its entry
// imports the preflight first, so the preflight is in the hashed file and in dev. The client build's stylesheet is
// checked by the parser, then the server environments load `shared/css/sheet.ts` as its text and URL. The client keeps
// the empty module, so its JavaScript never holds the CSS.
export function inject(options: CssOptions): Plugin[] {
	// The client build's stylesheet once it is built: `null` before, `undefined` when the app has no CSS.
	let built: BuiltStylesheet | undefined | null = null;
	const main: Plugin = {
		name: "flare:css",
		configEnvironment(name) {
			return name === "client" ? { build: { cssCodeSplit: false } } : undefined;
		},
		resolveId(id) {
			return id.replace(/\?.*$/s, "") === RESET_ID ? id : null;
		},
		load(id) {
			if (id.replace(/\?.*$/s, "") === RESET_ID) return RESET;
			const { name, config } = this.environment;
			if (id !== SHEET || config.command !== "build" || !SERVER_ENVIRONMENTS.has(name)) return null;
			if (built === null) this.error("The client build must run before the server build reads its stylesheet");
			return `export const builtSheet = ${JSON.stringify(built?.source ?? "")};\nexport const builtHref = ${JSON.stringify(built?.href ?? "")};\n`;
		},
		transform(code, id) {
			const { name, config } = this.environment;
			if (!options.reset || name !== "client") return null;
			const path = id.replace(/\?.*$/s, "");
			const entry = resolve(config.root, options.clientEntry);
			// Vite gives the id as a real path, and a root reached through a symlink is not one (BUGS.md B51).
			if (path !== entry && path !== realPath(entry)) return null;
			return `import ${JSON.stringify(RESET_ID)};\n${code}`;
		},
	};
	// Vite emits the CSS asset in its own `generateBundle`, so the capture runs after it.
	const capture: Plugin = {
		name: "flare:css-capture",
		enforce: "post",
		generateBundle(_output, bundle) {
			if (this.environment.name !== "client") return;
			const sheet = stylesheetOf(bundle, { base: this.environment.config.base, assetsBase: options.assetsBase });
			if (sheet !== undefined) checked(sheet, (message) => this.error(message));
			built = sheet;
		},
	};
	return [main, capture];
}

// A request never parses a sheet the build did not accept.
function checked(sheet: BuiltStylesheet, fail: (message: string) => never): void {
	try {
		parseCss(sheet.source);
	} catch (error) {
		fail(`${sheet.fileName}: ${String(error)}`);
	}
}
