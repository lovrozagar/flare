import { createServer } from "../server/lifecycle/create.ts";
import type { Router } from "../shared/router/create-router.ts";

export type TestServer = { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };

// A relative path is resolved here, since the helper listens on no port.
const ORIGIN = "http://localhost";

// `createServer({ router })` for an app's tests (dx/testing.md). A test that needs `site`, `store`, `authenticate`, or
// `locale` builds its own server, so a second argument throws instead of being half-honored.
export function createTestServer(router: Router, ...rest: readonly never[]): TestServer {
	if (rest.length > 0) {
		throw new Error(
			"createTestServer takes the router only. Call createServer for site, store, authenticate, or locale",
		);
	}
	const server = createServer({ router });
	return {
		fetch(input, init) {
			const target = input instanceof Request ? input : new URL(String(input), ORIGIN);
			return server.fetch(new Request(target, init));
		},
	};
}
