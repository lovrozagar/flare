// The one negotiator call match.ts makes. negotiator ships no types, and @types/negotiator is not a dependency (B79).
// This file reaches only Flare's own compile, through the tsconfig include. No source references it, and no emitted
// declaration names negotiator, so an app never resolves these types.
declare module "negotiator" {
	export default class Negotiator {
		constructor(request: { headers: Record<string, string | undefined> });
		languages(): string[];
	}
}
