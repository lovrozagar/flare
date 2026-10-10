/**
 * Bug: Link component XSS bypass via leading whitespace in href/to.
 *
 * The protocol check uses `lower.startsWith("javascript:")` without trimming
 * leading whitespace first. Browsers normalize whitespace in href attributes,
 * so `<a href=" javascript:alert(1)">` executes JavaScript when clicked.
 *
 * Vectors: space, tab, newline, carriage return, non-breaking space, form feed.
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

describe("Link whitespace XSS bypass", () => {
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

	const whitespaceVectors = [
		{ label: "leading space", value: " javascript:alert(1)" },
		{ label: "leading tab", value: "\tjavascript:alert(1)" },
		{ label: "leading newline", value: "\njavascript:alert(1)" },
		{ label: "leading carriage return", value: "\rjavascript:alert(1)" },
		{ label: "leading form feed", value: "\fjavascript:alert(1)" },
		{ label: "mixed whitespace", value: " \t\njavascript:alert(1)" },
		{ label: "leading NBSP", value: "\u00A0javascript:alert(1)" },
		{ label: "leading space data:", value: " data:text/html,<script>alert(1)</script>" },
		{ label: "leading tab blob:", value: "\tblob:https://evil.com/payload" },
	];

	for (const { label, value } of whitespaceVectors) {
		it(`sanitizes href with ${label} to #`, () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link href={value}>link</Link>
					</FlareProvider>
				),
				container,
			);
			const anchor = container.querySelector("a");
			expect(anchor).not.toBeNull();
			expect(anchor?.getAttribute("href")).toBe("#");
		});
	}

	for (const { label, value } of whitespaceVectors) {
		it(`sanitizes to prop with ${label} to #`, () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to={value as string}>link</Link>
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
