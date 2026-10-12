import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { parseCss } from "../../shared/css/parse.ts";
import { stylesheetOf, type BuiltStylesheet } from "./bundle.ts";
import { RESET } from "./reset.ts";

export const RESET_ID = "virtual:flare/reset.css";
const RESOLVED_RESET = `\0${RESET_ID}`;

// The module the server reads the built stylesheet from. The package ships its source, so this is the file Vite loads.
const SHEET = fileURLToPath(new URL("../../shared/css/sheet.ts", import.meta.url));

const SERVER_ENVIRONMENTS = new Set(["ssr", "worker"]);

export type CssOptions = { reset: boolean; clientEntry: string };

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
			return id === RESET_ID ? RESOLVED_RESET : null;
		},
		load(id) {
			if (id === RESOLVED_RESET) return RESET;
			const { name, config } = this.environment;
			if (id !== SHEET || config.command !== "build" || !SERVER_ENVIRONMENTS.has(name)) return null;
			if (built === null) this.error("The client build must run before the server build reads its stylesheet");
			return `export const builtSheet = ${JSON.stringify(built?.source ?? "")};\nexport const builtHref = ${JSON.stringify(built?.href ?? "")};\n`;
		},
		transform(code, id) {
			const { name, config } = this.environment;
			if (!options.reset || name !== "client") return null;
			if (id.replace(/\?.*$/s, "") !== resolve(config.root, options.clientEntry)) return null;
			return `import ${JSON.stringify(RESET_ID)};\n${code}`;
		},
	};
	// Vite emits the CSS asset in its own `generateBundle`, so the capture runs after it.
	const capture: Plugin = {
		name: "flare:css-capture",
		enforce: "post",
		generateBundle(_output, bundle) {
			if (this.environment.name !== "client") return;
			const sheet = stylesheetOf(bundle, this.environment.config.base);
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
