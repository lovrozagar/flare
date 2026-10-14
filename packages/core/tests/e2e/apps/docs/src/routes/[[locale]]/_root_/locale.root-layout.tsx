import { serverCtx } from "@lovrozagar/flare/server";
import {
	createRootLayout,
	DirectionProvider,
	DirectionScript,
	FontCSS,
	nonce,
	Stylesheet,
	ThemeProvider,
	ThemeScript,
	ViewTransitionCSS,
} from "@lovrozagar/flare";
import { LocaleProvider, LocaleScript } from "@lovrozagar/flare/i18n";
import { QueryClientProvider } from "@tanstack/solid-query";
import { Footer } from "../../../components/footer.tsx";
import { Header } from "../../../components/header.tsx";
import { ProgressBar } from "../../../components/progress-bar.tsx";
import { SearchModal } from "../../../components/search-modal.tsx";
import { inter, mono } from "../../../fonts.ts";
import { getQueryClient } from "../../../query.ts";
import { localeConfig } from "../../../locale-config.ts";
import { serverRuntime } from "../../../runtime.ts";
import "../../../styles.css";

const SITE = "https://flare.test";

// The document for every main page. The optional `[[locale]]` param is the tag: `initial` for the locale and
// `locale` for the direction. The scripts run before paint under the request nonce.
export const route = createRootLayout("[[locale]]/_root_")
	// A revisit inside 30 s reuses the layout's client copy, so a fully fresh navigation sends no request (dx/cache.md).
	.cache({ client: { staleTime: "30s" } })
	.preloader(() => ({ version: "1.0", site: "Flare" }))
	.loader(() => ({ requestId: serverCtx().requestId, runtime: serverRuntime() }))
	.head(() => ({
		title: "Flare docs",
		description: "Flare is a server-driven Solid framework. These docs run every feature they describe.",
		canonical: `${SITE}/`,
		keywords: "flare, solid, ssr, framework",
		languages: { en: `${SITE}/`, hr: `${SITE}/hr`, ar: `${SITE}/ar` },
		jsonLd: [{ "@context": "https://schema.org", "@type": "WebSite", name: "Flare docs", url: `${SITE}/` }],
		favicons: {
			ico: "/favicon.ico",
			svg: "/icon.svg",
			appleTouchIcon: "/apple-touch-icon.png",
			"96x96": "/icons/icon-96.png",
			"192x192": "/icons/icon-192.png",
			"512x512": "/icons/icon-512.png",
		},
		robots: { index: true, follow: true, "max-image-preview": "large" },
		openGraph: {
			title: "Flare docs",
			siteName: "Flare",
			url: `${SITE}/`,
			locale: "en",
			alternateLocale: ["hr", "ar"],
			images: [{ url: `${SITE}/icons/icon-512.png`, width: 512, height: 512, alt: "Flare" }],
		},
		twitter: { card: "summary_large_image", site: "@flare", title: "Flare docs" },
		meta: {
			charset: "utf-8",
			viewport: "width=device-width, initial-scale=1",
			applicationName: "Flare docs",
			author: "Flare",
			generator: "Flare",
			manifest: "/manifest.webmanifest",
			appleMobileWebAppCapable: "yes",
			mobileWebAppCapable: "yes",
		},
		custom: {
			meta: [{ name: "theme-color", content: "#0b0b10" }],
			scripts: [{ children: "window.__docsHeadScript = true;" }],
			styles: [{ children: ":root { --docs-head-style: 1; }" }],
		},
	}))
	.render((props) => (
		<LocaleProvider config={localeConfig} initial={props.params.locale}>
			<html>
				<head>
					<ThemeScript />
					<DirectionScript locale={props.params.locale} />
					<LocaleScript />
					<FontCSS font={inter} />
					<FontCSS font={mono} />
					<ViewTransitionCSS duration={200} />
					<Stylesheet />
					<script nonce={nonce() || undefined}>{"document.documentElement.dataset.inline = 'nonced';"}</script>
				</head>
				<body class="min-h-screen">
					<QueryClientProvider client={getQueryClient()}>
						<ThemeProvider>
							<DirectionProvider locale={props.params.locale}>
								<ProgressBar />
								<Header />
								<div id="app">{props.children}</div>
								<SearchModal />
								<Footer
									requestId={props.loaderData.requestId}
									runtime={props.loaderData.runtime}
									version={props.preloaderContext.version}
								/>
							</DirectionProvider>
						</ThemeProvider>
					</QueryClientProvider>
				</body>
			</html>
		</LocaleProvider>
	))
	.errorRender((props) => (
		<main class="mx-auto max-w-2xl px-5 py-20">
			<h1 id="root-error" class="text-2xl font-semibold">
				Something broke
			</h1>
			<p class="mt-2 text-stone-500">{props.error.message}</p>
		</main>
	))
	.notFoundRender(() => (
		<main class="mx-auto max-w-2xl px-5 py-20">
			<h1 id="root-not-found" class="text-2xl font-semibold">
				Page not found
			</h1>
		</main>
	));
