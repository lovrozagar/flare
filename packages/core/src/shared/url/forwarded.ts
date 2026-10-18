// How many proxy hops in front of the server an adapter trusts (dx/adapters.md `trustProxy`): an integer from 0 to
// 5, 0 when omitted. `options` holds only that key and the adapter's own `keys`; `bodyLimit` is createServer's, so
// another key throws.
export function trustedHops(
	adapter: string,
	options: { trustProxy?: number },
	keys: readonly string[] = ["trustProxy"],
): number {
	for (const key of Object.keys(options)) {
		if (!keys.includes(key)) throw new Error(`${adapter} takes only ${new Intl.ListFormat("en-US").format(keys)}`)
	}
	const hops = options.trustProxy ?? 0
	if (!Number.isInteger(hops) || hops < 0 || hops > 5) throw new Error("trustProxy is an integer from 0 to 5")
	return hops
}

// A trusted hop says the client spoke https. With no trusted hop, `X-Forwarded-Proto` is anyone's to send.
export function forwardedHttps(hops: number, proto: string | null | undefined): boolean {
	// A proxy chain lists one scheme per hop; the first is the client's, read in any case, as Express reads it (plan 21
	// 8.9).
	return hops > 0 && /^\s*https\s*(?:,|$)/i.test(proto ?? "")
}

// A Host header is a host and an optional port: a name, an IPv4 address, or a bracketed IPv6 one. Anything else, a path,
// a query, a fragment, userinfo, or a space, would change the URL the router reads, so an adapter answers 400
// (BUGS.md 150). An absent Host is the adapter's default.
const HOST = /^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9._-]+)(?::\d{1,5})?$/

export function validHost(host: string | null | undefined): boolean {
	return host === null || host === undefined || HOST.test(host)
}
