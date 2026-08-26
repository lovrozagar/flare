const DEFAULT_COOKIE_NAME = "flare.locale";
const COOKIE_NAME_RE = /^[\w.-]+$/;

export function formatLocaleCookie(
	locale: string,
	cookieName: string = DEFAULT_COOKIE_NAME,
	opts?: { https?: boolean; maxAge?: number; secure?: boolean },
): string {
	const name = COOKIE_NAME_RE.test(cookieName) ? cookieName : DEFAULT_COOKIE_NAME;
	const safe = locale.replace(/[\r\n;\0]/g, "");
	const maxAge = opts?.maxAge ?? 31_536_000;
	const useSecure = opts?.secure ?? opts?.https ?? false;
	const secureFlag = useSecure ? "; Secure" : "";
	return `${name}=${safe}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secureFlag}`;
}
