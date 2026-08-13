export const COMMENT_DELAY_MS = 500

export interface Post {
	slug: string
	title: string
	author: string
	body: string
}

export interface Comment {
	author: string
	text: string
	date: string
}

export const posts: Post[] = [
	{
		author: "Sarah Chen",
		body: "Building a web framework from scratch teaches you more about the web platform than years of using existing tools. You start by understanding how HTTP request routing works at the lowest level, mapping URL patterns to handler functions. Then you layer on server-side rendering, which means generating HTML strings from component trees. The real complexity emerges when you add client-side hydration — the process of attaching event listeners and state to server-rendered markup without re-rendering the entire page. Streaming SSR adds another dimension, allowing you to send HTML chunks as data becomes available rather than waiting for everything. This is where frameworks diverge most: some send complete HTML with embedded state, others stream structured data formats that the client interprets. Error boundaries, code splitting, and prefetching each add their own wire protocol requirements. The framework must coordinate between server and client, maintaining a shared understanding of route structure, data dependencies, and component hierarchy. Every framework makes different tradeoffs in this design space, and understanding those tradeoffs requires building one yourself.",
		slug: "building-web-frameworks",
		title: "Building Web Frameworks from Scratch",
	},
	{
		author: "Marcus Johnson",
		body: "Traditional server-side rendering waits for all data to load before sending any HTML to the browser. This means your time-to-first-byte is gated by your slowest data source. Streaming SSR flips this model by sending the HTML shell immediately, then streaming in content as data resolves. The browser can start parsing and rendering the initial HTML while waiting for slower parts. React introduced this with renderToPipeableStream, where Suspense boundaries mark the streaming points. When a suspended component resolves, React sends a small script that replaces the fallback content with the real HTML. Solid takes a similar approach but with finer-grained reactivity. The wire format matters enormously here — each framework encodes its streaming updates differently. Some use inline script tags that call a global function, others use separate data channels like NDJSON streams or Server-Sent Events. The choice affects debuggability, cacheability, and whether intermediary proxies can buffer responses correctly. Frameworks that separate data from markup in their streaming format tend to have smaller payloads for SPA navigations, since they only need to send the data delta rather than full HTML.",
		slug: "streaming-ssr",
		title: "The Case for Streaming SSR",
	},
	{
		author: "Elena Rodriguez",
		body: "Type-safe routing eliminates an entire class of bugs by ensuring that route parameters, search params, and loader data are statically typed throughout your application. When you define a route like /posts/[slug], the framework generates types that flow from the URL pattern through the loader function to the component props. This means typos in parameter names are caught at compile time rather than runtime. TanStack Router pioneered this approach in the React ecosystem, generating a route tree type that validates navigation targets and their required parameters. The challenge is making this work across the client-server boundary — the loader runs on the server, but the component needs to know what shape of data to expect. Code generation bridges this gap by scanning route files and producing typed module declarations. The developer experience improvement is dramatic: autocomplete for route paths, type errors when passing wrong parameters to Link components, and guaranteed type safety for loader return values. The tradeoff is build-time complexity and the need for a code generation step, but modern frameworks hide this behind Vite plugins that run automatically during development.",
		slug: "type-safe-routing",
		title: "Type-Safe Routing in Modern Frameworks",
	},
]

export const comments: Record<string, Comment[]> = {
	"building-web-frameworks": [
		{
			author: "Alex Kim",
			date: "2025-03-15",
			text: "This mirrors my experience building our internal framework at work. The hydration step is where most complexity lives.",
		},
		{
			author: "Jordan Blake",
			date: "2025-03-16",
			text: "Have you looked at how Qwik handles this differently with resumability instead of hydration?",
		},
		{
			author: "Morgan Lee",
			date: "2025-03-17",
			text: "Great write-up. Would love a follow-up on how you handle streaming with error boundaries.",
		},
	],
	"streaming-ssr": [
		{
			author: "Taylor Swift",
			date: "2025-04-01",
			text: "The NDJSON approach seems much more debuggable than inline scripts. You can actually read the network tab.",
		},
		{
			author: "Sam Rivera",
			date: "2025-04-02",
			text: "We switched from traditional SSR to streaming and our TTFB dropped from 800ms to 120ms.",
		},
		{
			author: "Casey Chen",
			date: "2025-04-03",
			text: "What about CDN caching? Streaming responses are harder to cache at the edge.",
		},
	],
	"type-safe-routing": [
		{
			author: "Robin Park",
			date: "2025-05-10",
			text: "TanStack Router's type inference is magical. Once you try it, going back to string-based routing feels wrong.",
		},
		{
			author: "Drew Martinez",
			date: "2025-05-11",
			text: "The code generation step adds ~200ms to our dev server startup. Worth it for the DX improvement.",
		},
		{
			author: "Avery Nguyen",
			date: "2025-05-12",
			text: "How does this interact with dynamic routes that are only known at runtime?",
		},
	],
}

export function getPost(slug: string): Post | undefined {
	return posts.find((p) => p.slug === slug)
}

export async function getDelayedComments(slug: string): Promise<Comment[]> {
	await new Promise((r) => setTimeout(r, COMMENT_DELAY_MS))
	return comments[slug] ?? []
}

/**
 * Initial like counts — same for all frameworks.
 * Interactivity test: client-side counter that increments on click.
 */
export const initialLikes: Record<string, number> = {
	"building-web-frameworks": 42,
	"streaming-ssr": 18,
	"type-safe-routing": 73,
}

export function headForPost(post: Post): {
	title: string
	description: string
	openGraph: { title: string; description: string; type: string; author: string }
} {
	const description = `${post.body.slice(0, 155)}...`
	return {
		description,
		openGraph: {
			author: post.author,
			description,
			title: post.title,
			type: "article",
		},
		title: post.title,
	}
}
