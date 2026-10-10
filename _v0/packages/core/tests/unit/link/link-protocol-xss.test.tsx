/**
 * S3: Link component must sanitize dangerous protocols case-insensitively.
 * Current code uses startsWith("javascript:") which is case-sensitive.
 * "JavaScript:", "JAVASCRIPT:", "jAvAsCrIpT:" all bypass the check.
 */
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts";
import { Link } from "../../../src/link/index.tsx";
import { FlareProvider } from "../../../src/outlet/index.tsx";
import type { FlareProviderProps } from "../../../src/outlet/types.ts";
import type { TreeNode } from "../../../src/router-primitives/types.ts";

vi.mock("../../../src/navigation", () => ({
	applyRewriteOutput: vi.fn((href: string) => href),
	hardNavigate: vi.fn(),
	isExternal: vi.fn(() => false),
	navigate: vi.fn(() => Promise.resolve()),
	prefetch: vi.fn(() => Promise.resolve()),
	resetNavigationState: vi.fn(),
	setupNavigation: vi.fn(),
}));

function makeFakeTree(): TreeNode {
	return { s: {} };
}

function makeProviderProps(overrides?: Partial<FlareProviderProps>): FlareProviderProps {
	return {
		children: null as unknown as import("solid-js").JSX.Element,
		layouts: {},
		matchCache: createMatchCache(),
		matches: [],
		params: {},
		prefetchCache: createPrefetchCache(),
		resolvers: new Map(),
		routeTree: makeFakeTree(),
		...overrides,
	};
}

describe("Link dangerous protocol sanitization (case-insensitive)", () => {
	let container: HTMLDivElement;
	let dispose: (() => void) | undefined;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		if (dispose) dispose();
		container.remove();
	});

	const dangerousProtocols = [
		/* javascript: variants */
		"javascript:alert(1)",
		"JavaScript:alert(1)",
		"JAVASCRIPT:alert(1)",
		"jAvAsCrIpT:alert(1)",
		/* data: variants */
		"data:text/html,<script>alert(1)</script>",
		"Data:text/html,evil",
		"DATA:text/html,evil",
		/* blob: variants */
		"blob:https://evil.com/payload",
		"Blob:https://evil.com/payload",
		"BLOB:x",
	];

	for (const proto of dangerousProtocols) {
		it(`sanitizes "${proto.slice(0, 30)}..." to #`, () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to={proto}>link</Link>
					</FlareProvider>
				),
				container,
			);
			const anchor = container.querySelector("a");
			expect(anchor).not.toBeNull();
			expect(anchor?.getAttribute("href")).toBe("#");
		});
	}
});
