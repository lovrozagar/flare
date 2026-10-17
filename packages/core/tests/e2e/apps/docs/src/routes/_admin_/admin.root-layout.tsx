import { createRootLayout, Stylesheet, ThemeProvider, ThemeScript } from "@lovrozagar/flare"
import "../../styles.css"

// A second document. Moving between it and the main root is a full document load. The admin pages may not be
// framed, and every response says who it is for.
export const route = createRootLayout("_admin_")
	.head(() => ({ title: "Admin — Flare docs", robots: { index: false, follow: false } }))
	.headers(() => ({ "x-docs-area": "admin" }))
	.security({ "X-Frame-Options": "DENY" })
	.render((props) => (
		<html lang="en">
			<head>
				<ThemeScript />
				<Stylesheet />
			</head>
			<body class="min-h-screen">
				<ThemeProvider>
					<header class="border-b border-stone-200 px-5 py-3 text-sm dark:border-ink-800">
						<a href="/" class="font-semibold">
							← Flare docs
						</a>{" "}
						<span class="ms-2 rounded bg-flame-500/15 px-2 py-0.5 text-flame-700">admin</span>
					</header>
					<div id="admin-app" class="mx-auto max-w-3xl px-5 py-10">
						{props.children}
					</div>
				</ThemeProvider>
			</body>
		</html>
	))
	.unauthenticatedRender(() => (
		<div id="admin-401" class="rounded-xl border border-stone-200 p-8 text-center dark:border-ink-800">
			<h1 class="text-xl font-semibold">Please sign in</h1>
			<a id="admin-login" href="/login" class="mt-4 inline-block text-flame-600 underline">
				Go to sign in
			</a>
		</div>
	))
	.unauthorizedRender(() => (
		<div id="admin-403" class="rounded-xl border border-red-200 p-8 text-center">
			<h1 class="text-xl font-semibold">Admins only</h1>
			<p class="mt-2 text-sm text-stone-500">Your account can read the docs but not manage them.</p>
		</div>
	))
