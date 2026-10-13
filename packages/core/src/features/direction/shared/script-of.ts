import type { Dir } from "../../../shared/router/index.ts";

// A tag's direction from its script, through `Intl.Locale` (dx/features.md Direction). There is no language list. An
// omitted or empty tag, a tag `Intl.Locale` rejects, a throwing `getTextInfo`, and a direction other than ltr or rtl
// give `defaultDir`. `und` parses, so it is ltr.
export function dirOf(locale: string | undefined, defaultDir: Dir): Dir {
	if (locale === undefined || locale === "") return defaultDir;
	try {
		const direction = new Intl.Locale(locale).getTextInfo().direction;
		return direction === "ltr" || direction === "rtl" ? direction : defaultDir;
	} catch {
		return defaultDir;
	}
}
