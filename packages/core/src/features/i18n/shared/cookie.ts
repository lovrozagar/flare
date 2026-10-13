// The locale cookie's default name, on the server's i18n() and on the router's locale config.
export const LOCALE_COOKIE = "flare.locale";

const YEAR = 60 * 60 * 24 * 365;

// The one cookie string the server's redirects and private answers, and the client's setLocale, write. Its
// attributes are not options: `Path=/`, `SameSite=Lax`, a year, `Secure` on https, and no `Domain`
// (dx/features.md i18n).
export function localeCookie(name: string, tag: string, secure: boolean): string {
	return `${name}=${tag}; Path=/; SameSite=Lax; Max-Age=${YEAR}${secure ? "; Secure" : ""}`;
}
