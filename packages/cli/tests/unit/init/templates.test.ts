import { describe, expect, it } from "vitest";
import {
	clientTemplate,
	DEFAULT_OPTIONS,
	faviconSvgTemplate,
	generateInitFiles,
	type InitOptions,
	indexPageTemplate,
	localeSegmentTemplate,
	packageJsonTemplate,
	robotsTxtTemplate,
	rootLayoutTemplate,
	routerTemplate,
	securityTxtTemplate,
	serverTemplate,
	tsconfigTemplate,
	viteConfigTemplate,
	webManifestTemplate,
} from "../../../src/init/templates";

function opts(overrides: Partial<InitOptions> = {}): InitOptions {
	return { ...DEFAULT_OPTIONS, ...overrides };
}

describe("packageJsonTemplate", () => {
	it("includes flare and solid-js deps", () => {
		const result = packageJsonTemplate(opts());
		const parsed: unknown = JSON.parse(result);
		expect(parsed).toHaveProperty(["dependencies", "@lovrozagar/flare"]);
		expect(parsed).toHaveProperty("dependencies.solid-js");
		expect(parsed).toHaveProperty("dependencies.@tanstack/solid-query");
	});

	it("includes essential devDependencies", () => {
		const result = packageJsonTemplate(opts());
		const parsed: unknown = JSON.parse(result);
		expect(parsed).toHaveProperty("devDependencies.@types/node");
		expect(parsed).toHaveProperty("devDependencies.typescript");
		expect(parsed).toHaveProperty("devDependencies.vite");
		expect(parsed).toHaveProperty("devDependencies.vite-plugin-solid");
	});

	it("includes tailwind when style is tailwind", () => {
		const result = packageJsonTemplate(opts({ style: "tailwind" }));
		const parsed: unknown = JSON.parse(result);
		expect(parsed).toHaveProperty("devDependencies.tailwindcss");
	});

	it("excludes tailwind when style is none", () => {
		const result = packageJsonTemplate(opts({ style: "none" }));
		const parsed: unknown = JSON.parse(result);
		expect(parsed).not.toHaveProperty("devDependencies.tailwindcss");
	});

	it("uses provided name", () => {
		const result = packageJsonTemplate(opts({ name: "cool-app" }));
		const parsed: unknown = JSON.parse(result);
		expect(parsed).toHaveProperty("name", "cool-app");
	});

	it("includes dev and build scripts", () => {
		const result = packageJsonTemplate(opts());
		const parsed: unknown = JSON.parse(result);
		expect(parsed).toHaveProperty("scripts.dev");
		expect(parsed).toHaveProperty("scripts.build");
	});
});

describe("tsconfigTemplate", () => {
	it("produces valid JSON", () => {
		const result = tsconfigTemplate();
		expect(() => JSON.parse(result)).not.toThrow();
	});

	it("has solid-js jsx config", () => {
		const result = tsconfigTemplate();
		const parsed: unknown = JSON.parse(result);
		expect(parsed).toHaveProperty("compilerOptions.jsxImportSource", "solid-js");
		expect(parsed).toHaveProperty("compilerOptions.jsx", "preserve");
	});
});

describe("viteConfigTemplate", () => {
	it("includes flare plugin", () => {
		const result = viteConfigTemplate(opts());
		expect(result).toContain("flare(");
		expect(result).toContain("@lovrozagar/flare/plugins");
	});

	it("enables tailwind when selected", () => {
		const result = viteConfigTemplate(opts({ style: "tailwind" }));
		expect(result).toContain("tailwind: true");
	});

	it("enables prerender for non-ssr cache", () => {
		const result = viteConfigTemplate(opts({ cache: "isr" }));
		expect(result).toContain("prerender: true");
	});

	it("disables prerender for ssr-only", () => {
		const result = viteConfigTemplate(opts({ cache: "ssr" }));
		expect(result).not.toContain("prerender");
	});

	it("enables fsCodegen when locales present", () => {
		const result = viteConfigTemplate(opts({ locale: ["en", "hr"] }));
		expect(result).toContain("fsCodegen: true");
	});
});

describe("serverTemplate", () => {
	it("includes createServer", () => {
		const result = serverTemplate(opts());
		expect(result).toContain("createServer");
		expect(result).toContain("router");
	});

	it("includes keepalive builder method when feature enabled", () => {
		const result = serverTemplate(opts({ features: ["keepalive"] }));
		expect(result).toContain(".keepalive(");
	});

	it("excludes keepalive when not in features", () => {
		const result = serverTemplate(opts({ features: [] }));
		expect(result).not.toContain("keepalive");
	});
});

describe("clientTemplate", () => {
	it("includes createClient call", () => {
		const result = clientTemplate();
		expect(result).toContain("createClient");
		expect(result).toContain("router");
	});
});

describe("routerTemplate", () => {
	it("includes createRouter", () => {
		const result = routerTemplate(opts());
		expect(result).toContain("createRouter");
		expect(result).toContain("routeTree");
		expect(result).toContain("layouts");
	});

	it("includes cache config for isr", () => {
		const result = routerTemplate(opts({ cache: "isr" }));
		expect(result).toContain("prefetch");
		expect(result).toContain("staleTime");
	});

	it("excludes cache config for ssr", () => {
		const result = routerTemplate(opts({ cache: "ssr" }));
		expect(result).not.toContain("prefetch");
	});

	it("includes viewTransitions when feature enabled", () => {
		const result = routerTemplate(opts({ features: ["viewTransitions"] }));
		expect(result).toContain("viewTransitions: true");
	});
});

describe("rootLayoutTemplate", () => {
	it("creates root layout without locale", () => {
		const result = rootLayoutTemplate(opts({ locale: [] }));
		expect(result).toContain('createRootLayout("_root_")');
		expect(result).toContain("ResetCSS");
		expect(result).toContain("errorRender");
		expect(result).toContain("notFoundRender");
	});

	it("includes baseline SEO in head", () => {
		const result = rootLayoutTemplate(opts());
		expect(result).toContain("description:");
		expect(result).toContain("favicons:");
		expect(result).toContain("favicon.ico");
		expect(result).toContain("favicon.svg");
		expect(result).toContain("favicon-96x96.png");
		expect(result).toContain("apple-touch-icon.png");
		expect(result).toContain("openGraph:");
		expect(result).toContain("robots:");
		expect(result).toContain("twitter:");
		expect(result).toContain("manifest:");
		expect(result).toContain("site.webmanifest");
	});

	it("creates root layout with locale", () => {
		const result = rootLayoutTemplate(opts({ locale: ["en", "hr"] }));
		expect(result).toContain('createRootLayout("[[locale]]/_root_")');
		expect(result).toContain("preloader");
		expect(result).toContain("ctx.location.params.locale");
	});

	it("includes ViewTransitionCSS when feature enabled", () => {
		const result = rootLayoutTemplate(opts({ features: ["viewTransitions"] }));
		expect(result).toContain("ViewTransitionCSS");
	});

	it("excludes ViewTransitionCSS when not in features", () => {
		const result = rootLayoutTemplate(opts({ features: [] }));
		expect(result).not.toContain("ViewTransitionCSS");
	});

	it("includes tw attribute for tailwind", () => {
		const result = rootLayoutTemplate(opts({ style: "tailwind" }));
		expect(result).toContain("tw=");
	});
});

describe("localeSegmentTemplate", () => {
	it("creates path segment with locale params", () => {
		const result = localeSegmentTemplate(["en", "hr", "fr"]);
		expect(result).toContain("createPathSegment");
		expect(result).toContain('locale: "en"');
		expect(result).toContain('locale: "hr"');
		expect(result).toContain('locale: "fr"');
		expect(result).toContain("dynamicParams: false");
	});
});

describe("indexPageTemplate", () => {
	it("creates index page without locale", () => {
		const result = indexPageTemplate(opts({ locale: [] }));
		expect(result).toContain('createPage("_root_/")');
		expect(result).toContain(".head");
		expect(result).toContain(".render");
		expect(result).toContain("description:");
		expect(result).toContain("openGraph:");
	});

	it("creates index page with locale", () => {
		const result = indexPageTemplate(opts({ locale: ["en"] }));
		expect(result).toContain('createPage("[[locale]]/_root_/")');
	});

	it("includes ssg cache for ssg mode", () => {
		const result = indexPageTemplate(opts({ cache: "ssg" }));
		expect(result).toContain("ssg: true");
	});

	it("includes isr cache for isr mode", () => {
		const result = indexPageTemplate(opts({ cache: "isr" }));
		expect(result).toContain("isr:");
		expect(result).toContain("revalidate: 60");
	});

	it("no cache for ssr mode", () => {
		const result = indexPageTemplate(opts({ cache: "ssr" }));
		expect(result).not.toContain(".cache");
	});
});

describe("robotsTxtTemplate", () => {
	it("includes user-agent, allow, and sitemap", () => {
		const result = robotsTxtTemplate(opts());
		expect(result).toContain("User-agent: *");
		expect(result).toContain("Allow: /");
		expect(result).toContain("Sitemap:");
	});

	it("adds crawl-delay for ssr-only", () => {
		const result = robotsTxtTemplate(opts({ cache: "ssr" }));
		expect(result).toContain("Crawl-delay: 1");
	});

	it("no crawl-delay for isr/ssg", () => {
		const result = robotsTxtTemplate(opts({ cache: "isr" }));
		expect(result).not.toContain("Crawl-delay");
	});
});

describe("webManifestTemplate", () => {
	it("produces valid JSON with PWA fields", () => {
		const result = webManifestTemplate(opts({ name: "cool-app" }));
		const parsed: unknown = JSON.parse(result);
		expect(parsed).toHaveProperty("name", "cool-app");
		expect(parsed).toHaveProperty("short_name", "cool-app");
		expect(parsed).toHaveProperty("start_url", "/");
		expect(parsed).toHaveProperty("display", "standalone");
		expect(parsed).toHaveProperty("icons");
	});
});

describe("faviconSvgTemplate", () => {
	it("produces valid SVG", () => {
		const result = faviconSvgTemplate();
		expect(result).toContain("<svg");
		expect(result).toContain("</svg>");
		expect(result).toContain("viewBox");
	});
});

describe("securityTxtTemplate", () => {
	it("includes contact and expiry", () => {
		const result = securityTxtTemplate(opts({ name: "cool-app" }));
		expect(result).toContain("Contact: security@cool-app.com");
		expect(result).toContain("Expires:");
		expect(result).toContain("Preferred-Languages: en");
	});
});

describe("generateInitFiles", () => {
	it("generates minimum files without locale", () => {
		const files = generateInitFiles(opts({ locale: [] }));
		const paths = files.map((f) => f.path);
		expect(paths).toContain("package.json");
		expect(paths).toContain("tsconfig.json");
		expect(paths).toContain("vite.config.ts");
		expect(paths).toContain("wrangler.jsonc");
		expect(paths).toContain("public/robots.txt");
		expect(paths).toContain("public/site.webmanifest");
		expect(paths).toContain("public/favicon.svg");
		expect(paths).toContain("public/.well-known/security.txt");
		expect(paths).toContain("public/favicon.ico");
		expect(paths).toContain("public/favicon-96x96.png");
		expect(paths).toContain("public/apple-touch-icon.png");
		expect(paths).toContain("public/web-app-manifest-192x192.png");
		expect(paths).toContain("public/web-app-manifest-512x512.png");
		expect(paths).toContain("src/server.ts");
		expect(paths).toContain("src/client.tsx");
		expect(paths).toContain("src/router.ts");
		expect(paths).toContain("src/routes/_root_/root-layout.tsx");
		expect(paths).toContain("src/routes/_root_/index/index-page.tsx");
		expect(paths).not.toContain("src/routes/[[locale]]/locale.tsx");
	});

	it("binary favicon files are valid buffers", () => {
		const files = generateInitFiles(opts());
		const binaryFiles = files.filter((f) => f.binary);
		expect(binaryFiles.length).toBe(5);
		for (const file of binaryFiles) {
			expect(Buffer.isBuffer(file.binary)).toBe(true);
			expect(file.binary?.length).toBeGreaterThan(0);
		}
	});

	it("PNG files start with PNG signature", () => {
		const files = generateInitFiles(opts());
		const pngFiles = files.filter((f) => f.path.endsWith(".png"));
		for (const file of pngFiles) {
			expect(file.binary?.[0]).toBe(137);
			expect(file.binary?.[1]).toBe(80); /* P */
			expect(file.binary?.[2]).toBe(78); /* N */
			expect(file.binary?.[3]).toBe(71); /* G */
		}
	});

	it("ICO file starts with ICO signature", () => {
		const files = generateInitFiles(opts());
		const ico = files.find((f) => f.path.endsWith(".ico"));
		expect(ico?.binary?.[0]).toBe(0);
		expect(ico?.binary?.[1]).toBe(0);
		expect(ico?.binary?.[2]).toBe(1); /* type: icon */
		expect(ico?.binary?.[3]).toBe(0);
	});

	it("generates locale files when locales provided", () => {
		const files = generateInitFiles(opts({ locale: ["en", "hr"] }));
		const paths = files.map((f) => f.path);
		expect(paths).toContain("src/routes/[[locale]]/locale.tsx");
		expect(paths).toContain("src/routes/[[locale]]/_root_/root-layout.tsx");
		expect(paths).toContain("src/routes/[[locale]]/_root_/index/index-page.tsx");
		expect(paths).not.toContain("src/routes/_root_/root-layout.tsx");
	});

	it("all files have non-empty content or binary data", () => {
		const files = generateInitFiles(opts());
		for (const file of files) {
			const hasContent = file.content.length > 0 || (file.binary !== undefined && file.binary.length > 0);
			expect(hasContent).toBe(true);
		}
	});
});
