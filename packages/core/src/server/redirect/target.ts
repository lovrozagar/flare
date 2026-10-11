const STATUSES = [301, 302, 303, 307, 308];

export type RedirectWire = {
	replace: boolean;
	status: number;
	document: string;
	data: { status: 200; x: { u: string; s: number; r: boolean } };
};

export function classify(value: string): string {
	if (value.charCodeAt(0) < 0x20) throw new Error("target");
	if (value.startsWith("//")) throw new Error("target");
	if (value.includes("\\")) throw new Error("target");
	return value;
}

export function redirect(input: { to?: string; href?: string; status?: number; replace?: boolean }): RedirectWire {
	const status = input.status ?? 303;
	if (!STATUSES.includes(status)) throw new Error(String(status));
	const replace = input.replace ?? true;
	const url = input.href !== undefined ? external(input.href) : routeId(input.to as string);
	return { replace, status, document: url, data: { status: 200, x: { u: url, s: status, r: replace } } };
}

function external(href: string): string {
	if (!href.startsWith("https://") && !href.startsWith("http://")) throw new Error("href");
	return href;
}

function routeId(to: string): string {
	if (to.includes("://")) throw new Error("to");
	return to;
}
