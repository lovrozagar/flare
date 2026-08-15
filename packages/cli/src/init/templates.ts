import { generateFaviconSet, generatePlaceholderIco } from "./png";

export interface InitOptions {
	auth: "cookie" | "jwt" | "none";
	cache: "isr" | "mixed" | "ssg" | "ssr";
	features: string[];
	locale: string[];
	name: string;
	style: "css-modules" | "none" | "tailwind";
	type: "api" | "blog" | "custom" | "marketing" | "saas";
}

export const DEFAULT_OPTIONS: InitOptions = {
	auth: "none",
	cache: "isr",
	features: ["keepalive", "viewTransitions"],
	locale: [],
	name: "my-app",
	style: "tailwind",
	type: "custom",
};

export function packageJsonTemplate(opts: InitOptions): string {
	const deps: Record<string, string> = {
		"@lovrozagar/flare": "^0.1.0",
		"@tanstack/solid-query": "^5.90.0",
		"solid-js": "^1.9.0",
	};

	const devDeps: Record<string, string> = {
		"@types/node": "^22.0.0",
		typescript: "^7.0.0",
		vite: "^8.0.0",
		"vite-plugin-solid": "^2.11.0",
	};

	if (opts.style === "tailwind") {
		devDeps.tailwindcss = "^4.0.0";
	}

	return JSON.stringify(
		{
			dependencies: deps,
			devDependencies: devDeps,
			name: opts.name,
			private: true,
			scripts: {
				build: "vite build",
				dev: "vite dev",
				preview: "vite preview",
			},
			type: "module",
			version: "0.0.1",
		},
		null,
		"\t",
	);
}

export function tsconfigTemplate(): string {
	return JSON.stringify(
		{
			compilerOptions: {
				allowArbitraryExtensions: true,
				allowImportingTsExtensions: true,
				esModuleInterop: true,
				forceConsistentCasingInFileNames: true,
				isolatedModules: true,
				jsx: "preserve",
				jsxImportSource: "solid-js",
				module: "ESNext",
				moduleResolution: "bundler",
				noEmit: true,
				resolveJsonModule: true,
				skipLibCheck: true,
				strict: true,
				target: "ESNext",
				types: ["node"],
			},
			include: ["src/**/*", "*.ts"],
		},
		null,
		"\t",
	);
}

export function viteConfigTemplate(opts: InitOptions): string {
	const pluginOpts: string[] = [];

	if (opts.locale.length > 0) {
		pluginOpts.push("fsCodegen: true");
	}

	if (opts.cache !== "ssr") {
		pluginOpts.push("prerender: true");
	}

	if (opts.style === "tailwind") {
		pluginOpts.push("tailwind: true");
	}

	const optsStr = pluginOpts.length > 0 ? `{ ${pluginOpts.join(", ")} }` : "";

	return `import { defineConfig } from "vite"
import { flare } from "@lovrozagar/flare/plugins"

export default defineConfig({
\tplugins: [flare(${optsStr})],
})
`;
}

export function serverTemplate(opts: InitOptions): string {
	const imports: string[] = [];
	const builderChain: string[] = [];

	imports.push(`import { createServer } from "@lovrozagar/flare/server"`);
	imports.push(`import { router } from "./router"`);

	if (opts.features.includes("keepalive")) {
		builderChain.push("\t.keepalive({ interval: 30_000 })");
	}

	const chain = builderChain.length > 0 ? `\n${builderChain.join("\n")}` : "";

	return `${imports.join("\n")}

export const server = createServer(router)${chain}
`;
}

export function clientTemplate(): string {
	return `import { createClient } from "@lovrozagar/flare/client"
import { router } from "./router"

createClient(() => router)
`;
}

export function routerTemplate(opts: InitOptions): string {
	const routerOpts: string[] = [];

	/* Cache config */
	if (opts.cache === "isr" || opts.cache === "mixed") {
		routerOpts.push(`\tcache: {
\t\tclient: { prefetch: "viewport", prefetchGcTime: 60_000, staleTime: 60_000 },
\t},`);
	}

	routerOpts.push("\tlayouts,");
	routerOpts.push("\trouteTree,");

	if (opts.features.includes("viewTransitions")) {
		routerOpts.push("\tviewTransitions: true,");
	}

	return `import { createRouter } from "@lovrozagar/flare/router"
import { layouts, routeTree } from "./_gen/routes.gen"

export const router = createRouter({
${routerOpts.join("\n")}
})
`;
}

export function rootLayoutTemplate(opts: InitOptions): string {
	const hasLocale = opts.locale.length > 0;
	const virtualPath = hasLocale ? "[[locale]]/_root_" : "_root_";

	const imports: string[] = [
		`import { createRootLayout } from "@lovrozagar/flare/root-layout"`,
		`import { ResetCSS } from "@lovrozagar/flare/reset-css"`,
	];

	if (opts.features.includes("viewTransitions")) {
		imports.push(`import { ViewTransitionCSS } from "@lovrozagar/flare/view-transition-css"`);
	}

	const headComponents = ["\t\t\t\t<ResetCSS />"];
	if (opts.features.includes("viewTransitions")) {
		headComponents.push("\t\t\t\t<ViewTransitionCSS />");
	}

	const langAttr = hasLocale ? "{ctx.preloaderContext.locale}" : '"en"';
	const styleAttr = opts.style === "tailwind" ? ` tw="bg-white text-black"` : "";

	const chainParts: string[] = [];

	if (hasLocale) {
		chainParts.push(`\t.preloader((ctx) => ({ locale: ctx.location.params.locale ?? "${opts.locale[0] ?? "en"}" }))`);
	}

	chainParts.push(`\t.head(() => ({
\t\tdescription: "${opts.name} — built with Flare",
\t\tfavicons: {
\t\t\t"96x96": "/favicon-96x96.png",
\t\t\tappleTouchIcon: "/apple-touch-icon.png",
\t\t\tico: "/favicon.ico",
\t\t\tsvg: "/favicon.svg",
\t\t},
\t\tmeta: {
\t\t\tcharset: "utf-8",
\t\t\tmanifest: "/site.webmanifest",
\t\t\tviewport: "width=device-width, initial-scale=1",
\t\t},
\t\topenGraph: { siteName: "${opts.name}", type: "website" },
\t\trobots: { follow: true, index: true },
\t\ttitle: "${opts.name}",
\t\ttwitter: { card: "summary" },
\t}))`);

	chainParts.push(`\t.render((ctx) => (
\t\t<html lang=${langAttr}${styleAttr}>
\t\t\t<head>
${headComponents.join("\n")}
\t\t\t</head>
\t\t\t<body>{ctx.children}</body>
\t\t</html>
\t))`);

	chainParts.push(`\t.errorRender((ctx) => (
\t\t<div>
\t\t\t<h1>Something went wrong</h1>
\t\t\t<p>{ctx.error.message}</p>
\t\t</div>
\t))`);

	chainParts.push(`\t.notFoundRender(() => (
\t\t<div>
\t\t\t<h1>404</h1>
\t\t\t<p>Page not found</p>
\t\t</div>
\t))`);

	return `${imports.join("\n")}

export const ${hasLocale ? "rootLayout" : "route"} = createRootLayout("${virtualPath}")
${chainParts.join("\n")}
`;
}

export function localeSegmentTemplate(locales: string[]): string {
	const paramEntries = locales.map((l) => `{ locale: "${l}" }`).join(", ");

	return `import { createPathSegment } from "@lovrozagar/flare/path-segment"

export const pathSegment = createPathSegment("[[locale]]")
\t.cache({
\t\tisr: {
\t\t\tdynamicParams: false,
\t\t\tparams: () => [${paramEntries}],
\t\t},
\t})
`;
}

export function indexPageTemplate(opts: InitOptions): string {
	const hasLocale = opts.locale.length > 0;
	const virtualPath = hasLocale ? "[[locale]]/_root_/" : "_root_/";

	const cacheChain =
		opts.cache === "ssg" || opts.cache === "isr"
			? `\n\t.cache({\n\t\t${opts.cache === "ssg" ? "ssg: true" : "isr: { revalidate: 60 }"},\n\t})`
			: "";

	return `import { createPage } from "@lovrozagar/flare/page"

export const route = createPage("${virtualPath}")${cacheChain}
\t.head(() => ({
\t\tdescription: "Welcome to ${opts.name}",
\t\topenGraph: { title: "${opts.name}", type: "website" },
\t\ttitle: "${opts.name}",
\t}))
\t.render(() => (
\t\t<main>
\t\t\t<h1>Welcome to ${opts.name}</h1>
\t\t\t<p>Edit this page at src/routes/</p>
\t\t</main>
\t))
`;
}

export function robotsTxtTemplate(opts: InitOptions): string {
	const lines = ["User-agent: *", "Allow: /"];

	if (opts.cache === "ssr") {
		lines.push("", "# Dynamic pages — no aggressive crawling");
		lines.push("Crawl-delay: 1");
	}

	lines.push("", `Sitemap: https://${opts.name}.com/sitemap.xml`);
	return `${lines.join("\n")}\n`;
}

export function webManifestTemplate(opts: InitOptions): string {
	return JSON.stringify(
		{
			background_color: "#ffffff",
			display: "standalone",
			icons: [
				{ sizes: "192x192", src: "/web-app-manifest-192x192.png", type: "image/png" },
				{ sizes: "512x512", src: "/web-app-manifest-512x512.png", type: "image/png" },
			],
			name: opts.name,
			short_name: opts.name,
			start_url: "/",
			theme_color: "#000000",
		},
		null,
		"\t",
	);
}

export function faviconSvgTemplate(): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
\t<rect width="100" height="100" rx="20" fill="#000"/>
\t<text x="50" y="72" font-size="60" text-anchor="middle" fill="#fff" font-family="system-ui, sans-serif">⚡</text>
</svg>
`;
}

export function securityTxtTemplate(opts: InitOptions): string {
	const year = new Date().getFullYear() + 1;
	return `Contact: security@${opts.name}.com
Expires: ${year}-01-01T00:00:00.000Z
Preferred-Languages: en
`;
}

export function wranglerTemplate(): string {
	return "{}\n";
}

export interface GeneratedFile {
	binary?: Buffer;
	content: string;
	path: string;
}

export function generateInitFiles(opts: InitOptions): GeneratedFile[] {
	const files: GeneratedFile[] = [];
	const hasLocale = opts.locale.length > 0;

	/* Root config files */
	files.push({ content: packageJsonTemplate(opts), path: "package.json" });
	files.push({ content: tsconfigTemplate(), path: "tsconfig.json" });
	files.push({ content: viteConfigTemplate(opts), path: "vite.config.ts" });
	files.push({ content: wranglerTemplate(), path: "wrangler.jsonc" });

	/* SEO & PWA baseline */
	files.push({ content: robotsTxtTemplate(opts), path: "public/robots.txt" });
	files.push({ content: webManifestTemplate(opts), path: "public/site.webmanifest" });
	files.push({ content: faviconSvgTemplate(), path: "public/favicon.svg" });
	files.push({ content: securityTxtTemplate(opts), path: "public/.well-known/security.txt" });

	/* Placeholder favicon set */
	files.push({ binary: generatePlaceholderIco(), content: "", path: "public/favicon.ico" });
	const pngSet = generateFaviconSet();
	for (const [name, buf] of Object.entries(pngSet)) {
		files.push({ binary: buf, content: "", path: `public/${name}` });
	}

	/* Core source files */
	files.push({ content: serverTemplate(opts), path: "src/server.ts" });
	files.push({ content: clientTemplate(), path: "src/client.tsx" });
	files.push({ content: routerTemplate(opts), path: "src/router.ts" });

	/* Route files */
	if (hasLocale) {
		files.push({
			content: localeSegmentTemplate(opts.locale),
			path: "src/routes/[[locale]]/locale.tsx",
		});
		files.push({
			content: rootLayoutTemplate(opts),
			path: "src/routes/[[locale]]/_root_/root-layout.tsx",
		});
		files.push({
			content: indexPageTemplate(opts),
			path: "src/routes/[[locale]]/_root_/index/index-page.tsx",
		});
	} else {
		files.push({
			content: rootLayoutTemplate(opts),
			path: "src/routes/_root_/root-layout.tsx",
		});
		files.push({
			content: indexPageTemplate(opts),
			path: "src/routes/_root_/index/index-page.tsx",
		});
	}

	return files;
}
