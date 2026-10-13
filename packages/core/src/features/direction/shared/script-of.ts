import type { Dir } from "../../../shared/router/index.ts";

// The Unicode right-to-left scripts, by ISO 15924 code (dx/features.md Direction). A script, not a language list.
const RTL_SCRIPTS: ReadonlySet<string> = new Set([
	"Adlm",
	"Arab",
	"Armi",
	"Avst",
	"Chrs",
	"Cprt",
	"Elym",
	"Hatr",
	"Hebr",
	"Hung",
	"Khar",
	"Lydi",
	"Mand",
	"Mani",
	"Mend",
	"Merc",
	"Mero",
	"Narb",
	"Nbat",
	"Nkoo",
	"Orkh",
	"Ougr",
	"Palm",
	"Phli",
	"Phlp",
	"Phnx",
	"Prti",
	"Rohg",
	"Samr",
	"Sarb",
	"Sogd",
	"Sogo",
	"Syrc",
	"Thaa",
	"Yezi",
]);

// A tag's direction from its likely script. `maximize()` is in every target runtime, so the server and every browser
// agree. `getTextInfo` is not, Firefox 151 lacks it, so it is not called. An omitted or empty tag, or a tag
// `Intl.Locale` rejects, gives `defaultDir`. `und` maximizes to Latin, so it is ltr.
export function dirOf(locale: string | undefined, defaultDir: Dir): Dir {
	if (locale === undefined || locale === "") return defaultDir;
	try {
		const script = new Intl.Locale(locale).maximize().script;
		return script !== undefined && RTL_SCRIPTS.has(script) ? "rtl" : "ltr";
	} catch {
		return defaultDir;
	}
}
