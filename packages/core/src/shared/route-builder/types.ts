export type { CacheConfig } from "./chain.ts";

export type AuthenticateMode = true | "optional";

export type SeoImage = { url: string; alt?: string; width?: number; height?: number; type?: string };
export type HeadScript = { src?: string; children?: string; async?: boolean; extra?: Record<string, string> };
type Bag = Record<string, unknown>;

export type HeadConfig = {
	title?: string;
	description?: string;
	canonical?: string;
	keywords?: string;
	css?: string | readonly string[];
	languages?: Record<string, string>;
	jsonLd?: ReadonlyArray<Record<string, unknown>>;
	images?: readonly SeoImage[];
	favicons?: Record<string, string>;
	robots?: Bag;
	openGraph?: Bag;
	twitter?: Bag;
	meta?: Bag & { viewport?: string | false };
	custom?: {
		links?: ReadonlyArray<Record<string, string>>;
		meta?: ReadonlyArray<Record<string, string>>;
		scripts?: readonly HeadScript[];
		styles?: ReadonlyArray<{ children: string }>;
	};
};
