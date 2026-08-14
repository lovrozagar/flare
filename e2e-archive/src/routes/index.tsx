import { Link } from "flare/link"
import { createPage } from "flare/page"

export const route = createPage("_root_/")
	.loader(() => ({
		message: "Hello from Flare",
		timestamp: Date.now(),
	}))
	.head(() => ({ title: "Home" }))
	.render((props) => (
		<main data-testid="home">
			<h1>{props.loaderData.message}</h1>
			<p data-testid="timestamp">{props.loaderData.timestamp}</p>
			<nav data-testid="nav-links">
				<h2>Pages</h2>
				<ul>
					<li>
						<Link to="/about">About</Link>
					</li>
					<li>
						<Link to="/blog">Blog</Link>
					</li>
					<li>
						<Link params={{ slug: "hello-world" }} to="/blog/[slug]">
							Blog Post
						</Link>
					</li>
					<li>
						<Link params={{ id: "42" }} to="/users/[id]">
							User 42
						</Link>
					</li>
					<li>
						<Link params={{ id: "99" }} to="/users/[id]">
							User 99
						</Link>
					</li>
					<li>
						<Link to="/dashboard">Dashboard</Link>
					</li>
					<li>
						<Link to="/dashboard/settings">Dashboard Settings</Link>
					</li>
					<li>
						<Link to="/head-demo">Head Demo</Link>
					</li>
					<li>
						<Link to="/og-images">OG Images</Link>
					</li>
					<li>
						<Link to="/head-scripts">Head Scripts</Link>
					</li>
					<li>
						<Link to="/props-demo">Props Demo</Link>
					</li>
					<li>
						<Link to="/props-nested">Props Nested</Link>
					</li>
					<li>
						<Link to="/slow">Slow Page</Link>
					</li>
					<li>
						<Link search={{ page: "1", q: "test" }} to="/search-demo">
							Search Demo
						</Link>
					</li>
					<li>
						<Link to="/large-data">Large Data</Link>
					</li>
					<li>
						<Link to="/xss-test">XSS Test</Link>
					</li>
					<li>
						<Link to="/empty-loader">Empty Loader</Link>
					</li>
					<li>
						<Link to="/null-loader">Null Loader</Link>
					</li>
					<li>
						<Link to="/head-full">Head Full</Link>
					</li>
					<li>
						<Link to="/head-minimal">Head Minimal</Link>
					</li>
					<li>
						<Link to="/image-test">Image Test</Link>
					</li>
					<li>
						<Link to="/static-image-test">Static Image Test</Link>
					</li>
					<li>
						<Link to="/styles-demo">Styles Demo</Link>
					</li>
				</ul>
				<h2>Error Pages</h2>
				<ul>
					<li>
						<Link to="/broken">Broken (Error)</Link>
					</li>
					<li>
						<Link to="/error-string">Error String</Link>
					</li>
					<li>
						<Link to="/slow-error">Slow Error</Link>
					</li>
					<li>
						<Link to="/throw-not-found">Throw NotFound</Link>
					</li>
					<li>
						<Link to="/throw-unauthorized">Throw Unauthorized</Link>
					</li>
					<li>
						<Link to="/throw-unauthenticated">Throw Unauthenticated</Link>
					</li>
					<li>
						<Link to="/preloader-throw">Preloader Throw</Link>
					</li>
					<li>
						<Link to="/layout-catches-child">Layout Catches Child (Safe)</Link>
					</li>
					<li>
						<Link to="/layout-catches-child/broken-child">Layout Catches Broken Child</Link>
					</li>
				</ul>
				<h2>Redirects</h2>
				<ul>
					<li>
						<Link to="/redirect-source">Redirect Source → Target</Link>
					</li>
					<li>
						<Link to="/redirect-target">Redirect Target</Link>
					</li>
					<li>
						<Link to="/chain-a">Chain Redirect (a → b → final)</Link>
					</li>
					<li>
						<Link to="/chain-final">Chain Final</Link>
					</li>
					<li>
						<Link to="/preloader-redirect">Preloader Redirect</Link>
					</li>
					<li>
						<Link to="/redirect-auth">Redirect Auth</Link>
					</li>
					<li>
						<Link search={{ baz: "qux", foo: "bar" }} to="/redirect-with-params">
							Redirect With Params
						</Link>
					</li>
				</ul>
				<h2>External Redirects</h2>
				<ul>
					<li>
						<Link to="/redirect-external">External Redirect (302)</Link>
					</li>
					<li>
						<Link to="/redirect-external-307">External Redirect (307)</Link>
					</li>
				</ul>
				<h2>Auth & Authorize</h2>
				<ul>
					<li>
						<Link to="/authorize-pass">Authorize Pass (needs admin)</Link>
					</li>
					<li>
						<Link to="/authorize-fail">Authorize Fail (always 403)</Link>
					</li>
					<li>
						<Link to="/caller-data">Caller Data</Link>
					</li>
				</ul>
				<h2>Headers</h2>
				<ul>
					<li>
						<Link to="/custom-headers">Custom Headers</Link>
					</li>
					<li>
						<Link to="/headers-chain/headers-child">Headers Chain</Link>
					</li>
					<li>
						<Link to="/cache-headers-test">Cache Headers Test</Link>
					</li>
					<li>
						<Link to="/cookie-test">Cookie Test</Link>
					</li>
				</ul>
				<h2>Hooks</h2>
				<ul>
					<li>
						<Link to="/hooks-test">Hooks Test</Link>
					</li>
				</ul>
				<h2>Link & Nav</h2>
				<ul>
					<li>
						<Link to="/link-advanced">Link Advanced</Link>
					</li>
					<li>
						<Link to="/link-test">Link Test</Link>
					</li>
					<li>
						<Link to="/link-features">Link Features</Link>
					</li>
					<li>
						<Link to="/download-test">Download Test</Link>
					</li>
					<li>
						<Link to="/shallow-test">Shallow Test</Link>
					</li>
					<li>
						<Link to="/shallow-validated">Shallow Validated</Link>
					</li>
					<li>
						<Link to="/blocker-test">Blocker Test</Link>
					</li>
					<li>
						<Link to="/navigate-demo">Navigate Demo</Link>
					</li>
					<li>
						<Link to="/disabled-toggle">Disabled Toggle</Link>
					</li>
				</ul>
				<h2>Prefetch</h2>
				<ul>
					<li>
						<Link data-testid="prefetch-intent-link" prefetch="intent" to="/prefetch-target">
							Prefetch Intent
						</Link>
					</li>
					<li>
						<Link data-testid="prefetch-viewport-link" prefetch="viewport" to="/prefetch-target">
							Prefetch Viewport
						</Link>
					</li>
					<li>
						<Link data-testid="prefetch-none-link" to="/about">
							No Prefetch
						</Link>
					</li>
					<li>
						<Link data-testid="prefetch-defer-link" prefetch="intent" to="/prefetch-defer">
							Prefetch Defer
						</Link>
					</li>
				</ul>
				<h2>Deferred</h2>
				<ul>
					<li>
						<Link to="/deferred-multi">Deferred Multi</Link>
					</li>
					<li>
						<Link to="/deferred-error">Deferred Error</Link>
					</li>
				</ul>
				<h2>Scroll</h2>
				<ul>
					<li>
						<Link to="/scroll-tall">Scroll Tall</Link>
					</li>
				</ul>
				<h2>Builder Chain</h2>
				<ul>
					<li>
						<Link to="/chain-override">Chain Override</Link>
					</li>
					<li>
						<Link to="/chain-auth-inherit">Chain Auth Inherit</Link>
					</li>
					<li>
						<Link params={{ id: "42" }} to="/validated/[id]">
							Validated Param (42)
						</Link>
					</li>
					<li>
						<Link params={{ id: "abc" }} to="/validated/[id]">
							Validated Param (abc)
						</Link>
					</li>
					<li>
						<Link search={{ q: "foo" }} to="/search-effects">
							Search Effects
						</Link>
					</li>
				</ul>
				<h2>Params & Catch-All</h2>
				<ul>
					<li>
						<Link params={{ segments: ["a", "b", "c"] }} to="/catch-all/[...segments]">
							Catch All (a/b/c)
						</Link>
					</li>
					<li>
						<Link params={{ segments: ["single"] }} to="/catch-all/[...segments]">
							Catch All (single)
						</Link>
					</li>
					<li>
						<Link to="/head-3-level/head-page">Head 3-Level</Link>
					</li>
					<li>
						<Link params={{ locale: undefined }} to="/optional-locale/[[...locale]]">
							Optional Locale (default)
						</Link>
					</li>
					<li>
						<Link params={{ locale: ["en"] }} to="/optional-locale/[[...locale]]">
							Optional Locale (en)
						</Link>
					</li>
					<li>
						<Link params={{ locale: ["de"] }} to="/optional-locale/[[...locale]]">
							Optional Locale (de)
						</Link>
					</li>
				</ul>
				<h2>Products</h2>
				<ul>
					<li>
						<Link to="/products">Products Index</Link>
					</li>
					<li>
						<Link params={{ id: "1" }} to="/products/[id]">
							Product 1
						</Link>
					</li>
				</ul>
				<h2>Cache & ISR</h2>
				<ul>
					<li>
						<Link to="/cache-test">Cache Test</Link>
					</li>
					<li>
						<Link to="/isr-test">ISR Test</Link>
					</li>
					<li>
						<Link to="/isr-defer">ISR Defer</Link>
					</li>
					<li>
						<Link to="/isr-defer-error">ISR Defer Error</Link>
					</li>
					<li>
						<Link to="/isr-multi-defer">ISR Multi Defer</Link>
					</li>
					<li>
						<Link to="/isr-fallback-false">ISR Fallback False</Link>
					</li>
					<li>
						<Link to="/isr-kv-combo">ISR KV Combo</Link>
					</li>
					<li>
						<Link to="/kv-cache-test">KV Cache Test</Link>
					</li>
					<li>
						<Link params={{ slug: "hello" }} to="/kv-param-test/[slug]">
							KV Param Test
						</Link>
					</li>
					<li>
						<Link to="/static-cache-test">Static Cache Test</Link>
					</li>
					<li>
						<Link to="/static-pure">Static Pure</Link>
					</li>
					<li>
						<Link to="/ssr-cdn-combo">SSR CDN Combo</Link>
					</li>
				</ul>
				<h2>Cached Layout</h2>
				<ul>
					<li>
						<Link to="/cached-layout">Cached Layout Index</Link>
					</li>
					<li>
						<Link to="/cached-layout/isr-child">Cached Layout ISR Child</Link>
					</li>
				</ul>
				<h2>Deep Cache</h2>
				<ul>
					<li>
						<Link to="/deep-cache">Deep Cache Index</Link>
					</li>
					<li>
						<Link to="/deep-cache/store-page">Deep Cache Store Page</Link>
					</li>
					<li>
						<Link to="/deep-cache/uncached">Deep Cache Uncached</Link>
					</li>
				</ul>
				<h2>Dynamic Tags</h2>
				<ul>
					<li>
						<Link params={{ id: "tag-1" }} to="/dynamic-tags/[id]">
							Dynamic Tag 1
						</Link>
					</li>
				</ul>
				<h2>Shared Tag</h2>
				<ul>
					<li>
						<Link to="/shared-tag">Shared Tag Index</Link>
					</li>
				</ul>
				<h2>Server Functions</h2>
				<ul>
					<li>
						<Link to="/server-fn-advanced">Server Fn Advanced</Link>
					</li>
					<li>
						<Link to="/env-fn-test">Env Fn Test</Link>
					</li>
					<li>
						<Link to="/server-context-test">Server Context Test</Link>
					</li>
					<li>
						<Link to="/server-log-test">Server Log Test</Link>
					</li>
				</ul>
				<h2>Lazy</h2>
				<ul>
					<li>
						<Link to="/lazy-test">Lazy Test</Link>
					</li>
					<li>
						<Link to="/lazy-error-test">Lazy Error Test</Link>
					</li>
				</ul>
				<h2>Forms</h2>
				<ul>
					<li>
						<Link to="/form-demo">Form Demo</Link>
					</li>
				</ul>
				<h2>Rewrite</h2>
				<ul>
					<li>
						<Link to="/rewrite-target">Rewrite Target</Link>
					</li>
				</ul>
				<h2>Query Client</h2>
				<ul>
					<li>
						<Link to="/query-basic">Query Basic</Link>
					</li>
					<li>
						<Link to="/query-hydration">Query Hydration</Link>
					</li>
					<li>
						<Link to="/query-multi">Query Multi</Link>
					</li>
					<li>
						<Link to="/query-flare-state">Query FlareState</Link>
					</li>
					<li>
						<Link to="/query-piggyback">Query Piggyback</Link>
					</li>
					<li>
						<Link to="/query-error">Query Error</Link>
					</li>
					<li>
						<Link params={{ id: "42" }} to="/query-dynamic/[id]">
							Query Dynamic (42)
						</Link>
					</li>
					<li>
						<Link params={{ id: "abc" }} to="/query-dynamic/[id]">
							Query Dynamic (abc)
						</Link>
					</li>
					<li>
						<Link to="/query-null">Query Null</Link>
					</li>
					<li>
						<Link to="/query-large">Query Large (200 items)</Link>
					</li>
					<li>
						<Link to="/query-invalidation">Query Invalidation</Link>
					</li>
					<li>
						<Link to="/query-deferred">Query Deferred</Link>
					</li>
				</ul>
				<h2>Broadcast</h2>
				<ul>
					<li>
						<Link to="/broadcast-test">Broadcast Test</Link>
					</li>
					<li>
						<Link to="/broadcast-signal-multi">Broadcast Signal Multi</Link>
					</li>
				</ul>
				<h2>Accessibility</h2>
				<ul>
					<li>
						<Link to="/a11y-test">A11y Test</Link>
					</li>
					<li>
						<Link to="/a11y-form-test">A11y Form Test</Link>
					</li>
					<li>
						<Link to="/a11y-nav-test">A11y Nav Test</Link>
					</li>
				</ul>
				<h2>Performance Benchmarks</h2>
				<ul>
					<li>
						<Link to="/perf-bench">Perf Bench</Link>
					</li>
					<li>
						<Link to="/perf-stress">Perf Stress (1000 rows)</Link>
					</li>
				</ul>
				<h2>Styling</h2>
				<ul>
					<li>
						<Link to="/styling-tw">Styling TW</Link>
					</li>
					<li>
						<Link to="/styling-css-prop">Styling CSS Prop</Link>
					</li>
					<li>
						<Link to="/styling-vars">Styling Vars</Link>
					</li>
					<li>
						<Link to="/styling-head-css">Styling Head CSS</Link>
					</li>
					<li>
						<Link to="/styling-child-a">Styling Shared CSS (A)</Link>
					</li>
					<li>
						<Link to="/styling-child-b">Styling Shared CSS (B)</Link>
					</li>
					<li>
						<Link to="/styling-combo">Styling Combo</Link>
					</li>
					<li>
						<Link to="/styling-css-native">Styling CSS Native</Link>
					</li>
					<li>
						<Link to="/styling-tw-native">Styling TW Native</Link>
					</li>
					<li>
						<Link to="/styling-full-css">Styling Full CSS</Link>
					</li>
					<li>
						<Link to="/styling-mix">Styling Mix</Link>
					</li>
					<li>
						<Link to="/styling-lazy">Styling Lazy</Link>
					</li>
					<li>
						<Link to="/styling-interactive">Styling Interactive</Link>
					</li>
					<li>
						<Link to="/styling-dynamic">Styling Dynamic</Link>
					</li>
					<li>
						<Link to="/styling-isolation">Styling Isolation</Link>
					</li>
					<li>
						<Link to="/styling-responsive">Styling Responsive</Link>
					</li>
					<li>
						<Link to="/styling-state-switch">Styling State Switch</Link>
					</li>
					<li>
						<Link to="/styling-nav-stress">Styling Nav Stress</Link>
					</li>
					<li>
						<Link to="/styling-tw-static">Styling TW Static</Link>
					</li>
					<li>
						<Link to="/styling-deferred">Styling Deferred</Link>
					</li>
					<li>
						<Link to="/styling-stress">Styling Stress</Link>
					</li>
					<li>
						<Link to="/styling-cascade">Styling Cascade</Link>
					</li>
				</ul>
			</nav>
		</main>
	))
