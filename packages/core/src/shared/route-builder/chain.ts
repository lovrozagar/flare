type Handler = () => unknown;

export type SsrCache = {
	ttl: string;
	staleTime?: string;
	tags?: readonly string[];
	defer?: "resolve" | "stream";
};

export type CacheConfig =
	| { ssr: SsrCache; isr?: never; ssg?: never }
	| { isr: true | { revalidate?: string }; ssr?: never; ssg?: never }
	| { ssg: true | { defer?: "resolve" | "stream" }; ssr?: never; isr?: never };

export type Chain = {
	cache: (config: CacheConfig) => Chain;
	authenticate: (...callerData: readonly string[]) => Chain;
	loader: (fn: Handler) => Chain;
	response: (fn: Handler) => Chain;
	render: (fn: Handler) => Chain;
};

const ORDER = { cache: 1, authenticate: 3, loader: 7, response: 7, render: 11 } as const;
type Step = keyof typeof ORDER;
const MODES = ["ssr", "isr", "ssg"] as const;

export function createChain(id: string): Chain {
	void id;
	const used = new Set<Step>();
	let at = 0;

	function advance(step: Step): void {
		if (used.has(step)) throw new Error(`${step} twice`);
		if (at > ORDER[step]) throw new Error(`order: ${step}`);
		at = ORDER[step];
		used.add(step);
	}

	const chain: Chain = {
		cache(config) {
			const modes = MODES.filter((key) => Object.hasOwn(config, key));
			if (modes.length > 1) throw new Error("one cache mode");
			advance("cache");
			return chain;
		},
		authenticate(...callerData) {
			throw new Error(`The method is authenticateOptional (${callerData.join(",")})`);
		},
		loader(fn) {
			void fn;
			advance("loader");
			return chain;
		},
		response(fn) {
			void fn;
			throw new Error("loader and response are exclusive");
		},
		render(fn) {
			void fn;
			advance("render");
			return chain;
		},
	};
	return chain;
}
