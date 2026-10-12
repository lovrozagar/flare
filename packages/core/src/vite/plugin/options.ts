export type FlareOptions = {
	assetsBase?: string;
	entry?: { client?: string; server?: string };
	image?: { widths?: readonly number[]; quality?: number; exclude?: RegExp };
	prerender?: boolean | Record<string, unknown>;
	css?: { reset?: boolean };
	broadcast?: boolean;
};

export type ParsedOptions = {
	assetsBase: string;
	entry: { client: string; server: string };
	image?: { widths: readonly number[]; quality: number } | undefined;
	css: { reset: boolean };
	broadcast: boolean;
};

const KNOWN = new Set(["assetsBase", "entry", "image", "prerender", "css", "broadcast"]);
const WIDTHS = [640, 750, 828, 1080, 1200, 1920];
const ENTRY = { client: "src/client.tsx", server: "src/server.ts" };

export function parseOptions(input?: FlareOptions): ParsedOptions {
	const options = input ?? {};
	for (const key of Object.keys(options)) {
		if (!KNOWN.has(key)) throw new Error(key);
	}
	return {
		assetsBase: parseAssetsBase(options.assetsBase),
		entry: {
			client: entryPath(options.entry, "client"),
			server: entryPath(options.entry, "server"),
		},
		image: parseImage(options.image),
		css: parseCss(options.css),
		broadcast: parseBroadcast(options.broadcast),
	};
}

function parseAssetsBase(value: string | undefined): string {
	if (value === undefined) return "/assets";
	// "/" is the only legal base that ends with a slash.
	if (value === "/") return "/";
	if (!value.startsWith("/")) throw new Error(value);
	if (value.endsWith("/")) throw new Error(value);
	if (value.includes("?")) throw new Error(value);
	if (value.includes("#")) throw new Error(value);
	return value;
}

function entryPath(entry: FlareOptions["entry"], key: "client" | "server"): string {
	if (entry === undefined) return ENTRY[key];
	const value = entry[key];
	return value === undefined ? ENTRY[key] : value;
}

function parseImage(image: FlareOptions["image"]): ParsedOptions["image"] {
	if (image === undefined) return undefined;
	return { widths: WIDTHS, quality: 75 };
}

// Omission, `{}`, and `reset: false` are the same: no preflight.
function parseCss(css: FlareOptions["css"]): ParsedOptions["css"] {
	if (css === undefined) return { reset: false };
	for (const key of Object.keys(css)) {
		if (key !== "reset") throw new Error(key);
	}
	return { reset: Boolean(css.reset) };
}

function parseBroadcast(value: boolean | undefined): boolean {
	if (typeof value === "boolean") return value;
	if (value === undefined) return true;
	throw new Error("broadcast");
}
