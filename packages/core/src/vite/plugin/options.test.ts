import { expect, it } from "vitest";
import { parseOptions, type FlareOptions } from "./options.ts";

const widths = [640, 750, 828, 1080, 1200, 1920];

it("assets base", () => {
	expect(parseOptions().assetsBase).toBe("/assets");
	expect(parseOptions({ assetsBase: "/assets" }).assetsBase).toBe("/assets");
	expect(parseOptions({ assetsBase: "/" }).assetsBase).toBe("/");
	expect(parseOptions({ assetsBase: "/cdn" }).assetsBase).toBe("/cdn");
	expect(() => parseOptions({ assetsBase: "assets" })).toThrow("assets");
	expect(() => parseOptions({ assetsBase: "/assets/" })).toThrow("/assets/");
	expect(() => parseOptions({ assetsBase: "/assets?x" })).toThrow("/assets?x");
	expect(() => parseOptions({ assetsBase: "/assets#x" })).toThrow("/assets#x");
});

it("image empty", () => {
	expect(parseOptions().image).toBeUndefined();
	expect(parseOptions({ image: {} }).image).toEqual({ widths, quality: 75 });
});

it("css key", () => {
	expect(() => {
		// @ts-expect-error css only accepts reset
		parseOptions({ css: { nope: true } });
	}).toThrow(/nope/);
	expect(() => {
		// @ts-expect-error reset is css.reset, not a top-level option
		parseOptions({ reset: true });
	}).toThrow(/reset/);
});

it("reset off", () => {
	expect(parseOptions().css).toBeUndefined();
	expect(parseOptions({ css: { reset: false } }).css).toEqual({ reset: false });
});

it("broadcast on", () => {
	expect(parseOptions().broadcast).toBe(true);
	expect(parseOptions({ broadcast: true }).broadcast).toBe(true);
});

it("broadcast off", () => {
	expect(parseOptions({ broadcast: false }).broadcast).toBe(false);
	expect(() => parseOptions({ broadcast: "no" } as unknown as FlareOptions)).toThrow(/broadcast/);
});

const banned = [
	"alias",
	"codegen",
	"dev",
	"ignorePrefix",
	"logLevel",
	"port",
	"purge",
	"retainPreviousAssets",
	"serviceWorker",
	"site",
	"solid",
	"sx",
];

const typed: Array<[string, () => void]> = [
	[
		"alias",
		() => {
			// @ts-expect-error alias does not exist
			parseOptions({ alias: true });
		},
	],
	[
		"codegen",
		() => {
			// @ts-expect-error codegen does not exist
			parseOptions({ codegen: true });
		},
	],
	[
		"dev",
		() => {
			// @ts-expect-error dev does not exist
			parseOptions({ dev: true });
		},
	],
	[
		"ignorePrefix",
		() => {
			// @ts-expect-error ignorePrefix does not exist
			parseOptions({ ignorePrefix: true });
		},
	],
	[
		"logLevel",
		() => {
			// @ts-expect-error logLevel does not exist
			parseOptions({ logLevel: true });
		},
	],
	[
		"port",
		() => {
			// @ts-expect-error port does not exist
			parseOptions({ port: true });
		},
	],
	[
		"purge",
		() => {
			// @ts-expect-error purge does not exist
			parseOptions({ purge: true });
		},
	],
	[
		"retainPreviousAssets",
		() => {
			// @ts-expect-error retainPreviousAssets does not exist
			parseOptions({ retainPreviousAssets: true });
		},
	],
	[
		"serviceWorker",
		() => {
			// @ts-expect-error serviceWorker does not exist
			parseOptions({ serviceWorker: true });
		},
	],
	[
		"site",
		() => {
			// @ts-expect-error site does not exist
			parseOptions({ site: true });
		},
	],
	[
		"solid",
		() => {
			// @ts-expect-error solid does not exist
			parseOptions({ solid: true });
		},
	],
	[
		"sx",
		() => {
			// @ts-expect-error sx does not exist
			parseOptions({ sx: true });
		},
	],
];

it("unknown", () => {
	for (const key of banned) expect(() => parseOptions({ [key]: true } as unknown as FlareOptions)).toThrow(key);
	for (const [key, run] of typed) expect(run).toThrow(new RegExp(key));
});
