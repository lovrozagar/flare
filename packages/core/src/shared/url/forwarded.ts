// How many proxy hops in front of the server an adapter trusts (dx/adapters.md `trustProxy`): an integer from 0 to
// 5, 0 when omitted. `options` holds only that key; `bodyLimit` is createServer's, so another key throws.
export function trustedHops(adapter: string, options: { trustProxy?: number }): number {
	for (const key of Object.keys(options)) {
		if (key !== "trustProxy") throw new Error(`${adapter} takes only trustProxy`)
	}
	const hops = options.trustProxy ?? 0
	if (!Number.isInteger(hops) || hops < 0 || hops > 5) throw new Error("trustProxy is an integer from 0 to 5")
	return hops
}

// A trusted hop says the client spoke https. With no trusted hop, `X-Forwarded-Proto` is anyone's to send.
export function forwardedHttps(hops: number, proto: string | null | undefined): boolean {
	return hops > 0 && proto === "https"
}
