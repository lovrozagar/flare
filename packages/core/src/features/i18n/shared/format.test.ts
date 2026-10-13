// @vitest-environment jsdom
import { createComponent } from "solid-js";
import { renderToString } from "@solidjs/web";
import { expect, it } from "vitest";
import { LocationContext, RouterContext } from "../../../shared/router/context.ts";
import { createRouter } from "../../../shared/router/create-router.ts";
import { formatMessage } from "./format.ts";
import { LocaleProvider } from "./provider.tsx";

// The root location, as LocationContext gives it.
const rootLocation = (): { pathname: string; search: string; hash: string } => ({
	pathname: "/",
	search: "",
	hash: "",
});

const config = { locales: ["en", "hr", "de", "ar"], defaultLocale: "en" };

it("placeholder left", () => {
	expect(formatMessage("Hi {name}", {}, "en")).toBe("Hi {name}");
	expect(formatMessage("Hi {name}", { name: null }, "en")).toBe("Hi {name}");
	expect(formatMessage("Hi {name}", { name: undefined }, "en")).toBe("Hi {name}");
	expect(formatMessage("Hi {name} and {other}", undefined, "en")).toBe("Hi {name} and {other}");
	expect(formatMessage("Hi {name}", { name: "Ana" }, "en")).toBe("Hi Ana");
	// An unclosed brace is text.
	expect(formatMessage("Hi {name", { name: "Ana" }, "en")).toBe("Hi {name");
});

it("number", () => {
	expect(formatMessage("{n}", { n: 1234.5 }, "de")).toBe(new Intl.NumberFormat("de").format(1234.5));
	expect(formatMessage("{n, number}", { n: 1234.5 }, "de")).toBe("1.234,5");
	// A type Flare does not know leaves the token as written.
	expect(formatMessage("{n, date}", { n: 1 }, "en")).toBe("{n, date}");
	expect(formatMessage("{n, date, short}", { n: 1 }, "en")).toBe("{n, date, short}");
});

it("plural locale", () => {
	const message = "{n, plural, zero {z} one {o} two {t} few {f} many {m} other {x}}";
	expect([0, 1, 2, 3, 11, 100].map((n) => formatMessage(message, { n }, "ar"))).toEqual(["z", "o", "t", "f", "m", "x"]);
	expect(formatMessage(message, { n: 3 }, "en")).toBe("x");
});

it("locale omitted", () => {
	const html = renderToString(() =>
		createComponent(RouterContext, {
			value: createRouter({ layouts: {}, routeTree: [] }),
			get children() {
				return createComponent(LocationContext, {
					value: rootLocation,
					get children() {
						return createComponent(LocaleProvider, {
							config,
							initial: "de",
							get children() {
								return formatMessage("{n}", { n: 1234.5 });
							},
						});
					},
				});
			},
		}),
	);
	expect(html).toBe("1.234,5");
});

it("locale outside", () => {
	expect(() => formatMessage("Hi")).toThrow("formatMessage needs a locale outside LocaleProvider");
});

it("bad tag", () => {
	expect(() => formatMessage("Hi", {}, "en_US")).toThrow(RangeError);
});

it("ordinal", () => {
	const message = "{n, selectordinal, =2 {second} one {#st} two {#nd} few {#rd} other {#th}}";
	expect([1, 2, 3, 4, 22].map((n) => formatMessage(message, { n }, "en"))).toEqual([
		"1st",
		"second",
		"3rd",
		"4th",
		"22nd",
	]);
});

it("exact", () => {
	const message = "{n, plural, =1 {just # thing} other {# things {who}}}";
	expect(formatMessage(message, { n: 1 }, "en")).toBe("just 1 thing");
	expect(formatMessage(message, { n: 1000, who: "here" }, "en")).toBe("1,000 things here");
	// A missing or non-number value leaves the token as written.
	expect(formatMessage(message, {}, "en")).toBe(message);
	expect(formatMessage(message, { n: "1" }, "en")).toBe(message);
	const select = "{g, select, a {A} other {O}}";
	expect(formatMessage(select, { g: "a" }, "en")).toBe("A");
	expect(formatMessage(select, { g: "b" }, "en")).toBe("O");
	expect(formatMessage(select, {}, "en")).toBe(select);
	// A branch list that does not parse is text.
	expect(formatMessage("{g, select, a {A}", { g: "a" }, "en")).toBe("{g, select, a {A}");
	expect(formatMessage("{g, select, a A}", { g: "a" }, "en")).toBe("{g, select, a A}");
	expect(formatMessage("{g, select, a b {A} other {B}}", { g: "a" }, "en")).toBe("{g, select, a b {A} other {B}}");
	expect(formatMessage("{g, select, {A} other {B}}", { g: "a" }, "en")).toBe("{g, select, {A} other {B}}");
	// Without `other`, a value no branch names leaves the token too. createTranslations refuses such a message.
	expect(formatMessage("{n, plural, one {x}}", { n: 5 }, "en")).toBe("{n, plural, one {x}}");
});

// Digits follow the runtime's CLDR data for the tag, and Flare pins no numbering system. A `-u-nu-` tag decides them
// on every runtime: CLDR 46 moved plain `ar` to Latin digits, so `ar` alone differs across ICU versions (BUGS.md B29).
it("numbering from tag", () => {
	const message = "{n, plural, one {# release} other {# releases}}";
	expect(formatMessage(message, { n: 14 }, "ar-u-nu-arab")).toBe("١٤ releases");
	expect(formatMessage(message, { n: 14 }, "ar-u-nu-latn")).toBe("14 releases");
});
