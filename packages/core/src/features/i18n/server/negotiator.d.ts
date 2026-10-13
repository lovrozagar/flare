// The one negotiator call match.ts makes. negotiator ships no types, and @types/negotiator is not a dependency (B79).
// match.ts references this file, so every project that compiles it, Flare's own, an e2e app's, and an app's through
// the shipped `src`, loads this shim and needs no @types package (BUGS.md B37).
declare module "negotiator" {
	export default class Negotiator {
		constructor(request: { headers: Record<string, string | undefined> });
		languages(): string[];
	}
}
