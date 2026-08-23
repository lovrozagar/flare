import type { FlareTracer } from "../tracing/types.ts";

export interface TracingConfig {
	provider?: FlareTracer;
	timing?: boolean;
}

export interface CspDirectives {
	"base-uri"?: string[];
	"connect-src"?: string[];
	"default-src"?: string[];
	"font-src"?: string[];
	"form-action"?: string[];
	"frame-ancestors"?: string[];
	"frame-src"?: string[];
	"img-src"?: string[];
	"media-src"?: string[];
	"object-src"?: string[];
	"script-src"?: string[];
	"style-src"?: string[];
	"style-src-attr"?: string[];
	"style-src-elem"?: string[];
	"block-all-mixed-content"?: boolean;
	"upgrade-insecure-requests"?: boolean;
	"worker-src"?: string[];
}
