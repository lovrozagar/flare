export interface VitePlugin {
	buildStart?: () => Promise<void> | void;
	closeBundle?: () => Promise<void> | void;
	config?: (
		userConfig: unknown,
		env: { command?: string; mode?: string },
	) => Record<string, unknown> | undefined | void;
	configResolved?: (config: { command?: string; mode?: string }) => Promise<void> | void;
	configurePreviewServer?: (server: unknown) => (() => void) | undefined;
	configureServer?: (server: unknown) => (() => void) | undefined;
	enforce?: "post" | "pre";
	load?: (
		id: string,
	) =>
		| Promise<string | { code: string; moduleType?: string } | null>
		| string
		| { code: string; moduleType?: string }
		| null;
	name: string;
	resolveId?: (id: string, importer?: unknown, options?: unknown) => string | null;
	transform?: (
		code: string,
		id: string,
	) => Promise<{ code: string; map?: null } | null> | { code: string; map?: null } | null;
	transformIndexHtml?: (
		html: string,
		ctx: unknown,
	) =>
		| {
				attrs?: Record<string, string | boolean | undefined>;
				children?: string;
				injectTo?: "body" | "body-prepend" | "head" | "head-prepend";
				tag: string;
		  }[]
		| undefined;
}

export interface ResolvedEntries {
	client: string;
	server: string;
}
