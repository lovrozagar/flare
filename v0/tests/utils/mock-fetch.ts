/**
 * Mock Fetch Factories
 *
 * Create mock fetch functions for testing navigation and data fetching.
 */

import { vi } from "vitest"

/** Fetch scenario configuration */
type FetchScenario = Response | (() => Response) | (() => Promise<Response>)

/** Scenarios mapped by URL pattern */
type FetchScenarios = Record<string, FetchScenario>

/** Extract URL string from fetch input */
function extractUrl(input: RequestInfo | URL): string {
	if (typeof input === "string") return input
	if (input instanceof URL) return input.pathname
	return input.url
}

/**
 * Create a simple mock fetch from URL scenarios
 *
 * @example
 * const mockFetch = createMockFetch({
 *   "/products": createNDJSONResponse([ndjson.loader("_root_/products", { products: [] }), ndjson.done()]),
 *   "/about": new Response("<html>...</html>", { headers: { "Content-Type": "text/html" } }),
 * })
 */
function createMockFetch(scenarios: FetchScenarios): typeof fetch {
	return vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
		const url = extractUrl(input)
		const pathname = url.startsWith("http") ? new URL(url).pathname : url

		const scenario = scenarios[pathname]
		if (!scenario) {
			return Promise.resolve(new Response("Not Found", { status: 404 }))
		}

		if (scenario instanceof Response) {
			return Promise.resolve(scenario.clone())
		}

		const result = scenario()
		if (result instanceof Promise) {
			return result
		}
		return Promise.resolve(result)
	}) as typeof fetch
}

/** Captured request info */
interface CapturedRequest {
	headers: Headers
	init?: RequestInit
	url: string
}

/** Mock fetch builder result */
interface MockFetchBuilderResult {
	fetch: typeof fetch
	getCallCount: () => number
	getCapturedHeaders: () => Headers[]
	getCapturedRequests: () => CapturedRequest[]
	getCapturedUrls: () => string[]
}

/** Extract URL string from fetch input (for builder) */
function extractUrlForBuilder(input: RequestInfo | URL): string {
	if (typeof input === "string") return input
	if (input instanceof URL) return input.href
	return input.url
}

/**
 * Fluent builder for mock fetch with advanced features
 *
 * @example
 * const { fetch, getCapturedHeaders, getCapturedUrls } = new MockFetchBuilder()
 *   .onUrl("/products", createNDJSONResponse([...]))
 *   .onUrlMatch(/\/products\/\d+/, (url) => createNDJSONResponse([...]))
 *   .withDelay(100)
 *   .build()
 */
class MockFetchBuilder {
	private scenarios: Map<string, FetchScenario> = new Map()
	private matchers: Array<{
		handler: (url: string) => Response | Promise<Response>
		pattern: RegExp
	}> = []
	private delay = 0
	private capturedRequests: CapturedRequest[] = []
	private defaultResponse: Response = new Response("Not Found", { status: 404 })

	/**
	 * Add a scenario for an exact URL
	 */
	onUrl(url: string, response: FetchScenario): this {
		this.scenarios.set(url, response)
		return this
	}

	/**
	 * Add a scenario for URLs matching a pattern
	 */
	onUrlMatch(pattern: RegExp, handler: (url: string) => Response | Promise<Response>): this {
		this.matchers.push({ handler, pattern })
		return this
	}

	/**
	 * Set a delay for all responses
	 */
	withDelay(ms: number): this {
		this.delay = ms
		return this
	}

	/**
	 * Set the default response for unmatched URLs
	 */
	withDefaultResponse(response: Response): this {
		this.defaultResponse = response
		return this
	}

	/**
	 * Build the mock fetch function
	 */
	build(): MockFetchBuilderResult {
		const scenarios = this.scenarios
		const matchers = this.matchers
		const delay = this.delay
		const defaultResponse = this.defaultResponse
		const capturedRequests = this.capturedRequests

		const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = extractUrlForBuilder(input)
			const pathname = url.startsWith("http") ? new URL(url).pathname : url

			/* Capture request */
			capturedRequests.push({
				headers: new Headers(init?.headers),
				init,
				url,
			})

			/* Apply delay */
			if (delay > 0) {
				await new Promise((resolve) => setTimeout(resolve, delay))
			}

			/* Check exact match */
			const scenario = scenarios.get(pathname)
			if (scenario) {
				if (scenario instanceof Response) {
					return scenario.clone()
				}
				const result = scenario()
				if (result instanceof Promise) {
					return result
				}
				return result
			}

			/* Check pattern matchers */
			for (const { handler, pattern } of matchers) {
				if (pattern.test(pathname)) {
					return handler(pathname)
				}
			}

			return defaultResponse.clone()
		}) as typeof fetch

		return {
			fetch: mockFetch,
			getCallCount: () => capturedRequests.length,
			getCapturedHeaders: () => capturedRequests.map((r) => r.headers),
			getCapturedRequests: () => [...capturedRequests],
			getCapturedUrls: () => capturedRequests.map((r) => r.url),
		}
	}
}

/**
 * Create a mock fetch that captures headers
 */
function createCapturingMockFetch(scenarios: FetchScenarios): MockFetchBuilderResult {
	const builder = new MockFetchBuilder()
	for (const [url, scenario] of Object.entries(scenarios)) {
		builder.onUrl(url, scenario)
	}
	return builder.build()
}

/**
 * Create a mock fetch with configurable delay
 */
function createDelayedMockFetch(scenarios: FetchScenarios, delayMs: number): typeof fetch {
	const builder = new MockFetchBuilder().withDelay(delayMs)
	for (const [url, scenario] of Object.entries(scenarios)) {
		builder.onUrl(url, scenario)
	}
	return builder.build().fetch
}

export type { CapturedRequest, FetchScenario, FetchScenarios, MockFetchBuilderResult }

export { createCapturingMockFetch, createDelayedMockFetch, createMockFetch, MockFetchBuilder }
