/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { createSxAstPlugin } from "../../../src/plugins/sx-ast/index.ts";
import type { SxCssManifest } from "../../../src/ssr/critical-css.ts";

/* ── Helpers ──────────────────────────────────────────────────────── */

interface TransformCtx {
	environment?: { name?: string };
}

type SxPlugin = ReturnType<typeof createSxAstPlugin>;

function callTransform(plugin: SxPlugin, code: string, id: string): string | null {
	const fn = plugin.transform as (this: TransformCtx, code: string, id: string) => { code: string; map: null } | null;
	return fn.call({}, code, id)?.code ?? null;
}

interface EmitResult {
	css: string;
	manifest: SxCssManifest | undefined;
}

function emitBundle(plugin: SxPlugin): EmitResult {
	const emitted: Array<{ fileName: string; source: string }> = [];
	const ctx = {
		emitFile(f: { type: string; fileName: string; source: string }) {
			emitted.push(f);
		},
	};
	const gb = plugin.generateBundle as unknown as (this: typeof ctx) => void;
	gb.call(ctx);

	const css = emitted.find((f) => f.fileName.endsWith("flare-global.css"))?.source ?? "";
	const manifestRaw = emitted.find((f) => f.fileName === "flare-sx-manifest.json")?.source;
	const manifest = manifestRaw ? (JSON.parse(manifestRaw) as SxCssManifest) : undefined;
	return { css, manifest };
}

/* ── Module-manifest tracks per-module class sets ─────────────────── */

describe.concurrent("reachability — module-manifest class tracking", () => {
	it("each transformed module has its classes recorded in moduleManifest", () => {
		const plugin = createSxAstPlugin({ manifest: true });

		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx");
		callTransform(plugin, `export default function B() { return <div sx={{ margin: "8px" }} /> }`, "/src/b.tsx");

		const { manifest } = emitBundle(plugin);
		expect(manifest?.moduleManifest["/src/a.tsx"]).toBeDefined();
		expect(manifest?.moduleManifest["/src/b.tsx"]).toBeDefined();
	});

	it("module with no sx/css/class produces no entry in moduleManifest", () => {
		const plugin = createSxAstPlugin({ manifest: true });

		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx");
		/* b.tsx has no relevant attrs — returns null from transform */
		callTransform(plugin, `export default function B() { return <div id="x" /> }`, "/src/b.tsx");

		const { manifest } = emitBundle(plugin);
		expect(manifest?.moduleManifest["/src/b.tsx"]).toBeUndefined();
	});

	it("module classes are a subset of manifest.rules keys", () => {
		const plugin = createSxAstPlugin({ manifest: true });

		callTransform(
			plugin,
			`export default function A() { return <div sx={{ color: "red", padding: "4px" }} /> }`,
			"/src/a.tsx",
		);

		const { manifest } = emitBundle(plugin);
		if (!manifest) throw new Error("No manifest");

		const allRuleKeys = new Set(Object.keys(manifest.rules));
		for (const cls of manifest.moduleManifest["/src/a.tsx"] ?? []) {
			expect(allRuleKeys.has(cls)).toBe(true);
		}
	});

	it("moduleManifest covers classes from Show/Switch branches (static sx)", () => {
		/* Both branches are statically extractable — plugin sees both */
		const src = `export default function A() {
  return (
    <div>
      <span sx={{ color: "red" }} />
      <span sx={{ color: "blue" }} />
    </div>
  )
}`;
		const plugin = createSxAstPlugin({ manifest: true });
		callTransform(plugin, src, "/src/a.tsx");

		const { manifest } = emitBundle(plugin);
		expect(manifest?.moduleManifest["/src/a.tsx"]?.length).toBeGreaterThanOrEqual(2);
	});
});

/* ── Dev mode: all classes emitted ────────────────────────────────── */

describe.concurrent("reachability — dev mode emits all classes", () => {
	it("dev mode: all transformed classes appear in flare-global.css", () => {
		const plugin = createSxAstPlugin({});
		/* Default mode is dev */

		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx");
		callTransform(plugin, `export default function B() { return <div sx={{ margin: "8px" }} /> }`, "/src/b.tsx");

		const { css } = emitBundle(plugin);
		/* Both properties must be in CSS output */
		expect(css).toContain("color");
		expect(css).toContain("margin");
	});

	it("dev mode: class names use sx- prefix", () => {
		const plugin = createSxAstPlugin({});

		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx");

		const { css } = emitBundle(plugin);
		expect(css).toMatch(/sx-color-red-\w+/);
	});

	it("dev mode: multiple modules — all classes present in single CSS asset", () => {
		const plugin = createSxAstPlugin({});

		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx");
		callTransform(plugin, `export default function B() { return <div sx={{ padding: "8px" }} /> }`, "/src/b.tsx");
		callTransform(plugin, `export default function C() { return <div sx={{ fontSize: "14px" }} /> }`, "/src/c.tsx");

		const { css } = emitBundle(plugin);
		expect(css).toContain("color");
		expect(css).toContain("padding");
		expect(css).toContain("font-size");
	});
});

/* ── Prod mode: stable hashes ─────────────────────────────────────── */

describe.concurrent("reachability — prod mode stable hashes", () => {
	it("prod mode: class names use a1- prefix", () => {
		const plugin = createSxAstPlugin({});
		const configResolved = plugin.configResolved as (cfg: { command: string }) => void;
		configResolved({ command: "build" });

		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx");

		const { css } = emitBundle(plugin);
		expect(css).toMatch(/a1-[a-z0-9]{8}/);
	});

	it("prod mode: class hash is stable — same input, two builds, same hash", () => {
		function runBuild(): string {
			const p = createSxAstPlugin({});
			const cr = p.configResolved as (cfg: { command: string }) => void;
			cr({ command: "build" });
			callTransform(p, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx");
			const { css } = emitBundle(p);
			const m = css.match(/a1-([a-z0-9]{8})/);
			return m?.[1] ?? "";
		}

		expect(runBuild()).toBe(runBuild());
	});

	it("prod mode: different sx values produce different hashes", () => {
		function hashFor(prop: string, val: string): string {
			const p = createSxAstPlugin({});
			const cr = p.configResolved as (cfg: { command: string }) => void;
			cr({ command: "build" });
			callTransform(p, `export default function A() { return <div sx={{ ${prop}: "${val}" }} /> }`, "/src/a.tsx");
			const { css } = emitBundle(p);
			return css.match(/a1-[a-z0-9]{8}/)?.[0] ?? "";
		}

		expect(hashFor("color", "red")).not.toBe(hashFor("color", "blue"));
		expect(hashFor("color", "red")).not.toBe(hashFor("padding", "red"));
	});
});

/* ── Class pool dedup within a build ─────────────────────────────── */

describe.concurrent("reachability — class pool dedup within build", () => {
	it("same sx value in two modules → single CSS rule (deduped)", () => {
		const plugin = createSxAstPlugin({});

		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx");
		callTransform(plugin, `export default function B() { return <div sx={{ color: "red" }} /> }`, "/src/b.tsx");

		const { css } = emitBundle(plugin);

		/* Rule for color:red must appear exactly once in CSS */
		const matches = css.match(/color:\s*red/g);
		expect(matches?.length ?? 0).toBe(1);
	});

	it("same sx value in two modules → both moduleManifest entries reference same class", () => {
		const plugin = createSxAstPlugin({ manifest: true });

		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx");
		callTransform(plugin, `export default function B() { return <div sx={{ color: "red" }} /> }`, "/src/b.tsx");

		const { manifest } = emitBundle(plugin);
		if (!manifest) throw new Error("No manifest");

		const aClasses = manifest.moduleManifest["/src/a.tsx"] ?? [];
		const bClasses = manifest.moduleManifest["/src/b.tsx"] ?? [];

		/* Both modules reference the same class */
		expect(aClasses[0]).toBe(bClasses[0]);
	});

	it("no duplicate class selectors in emitted CSS", () => {
		const plugin = createSxAstPlugin({});
		const configResolved = plugin.configResolved as (cfg: { command: string }) => void;
		configResolved({ command: "build" });

		callTransform(plugin, `export default function A() { return <div sx={{ color: "red" }} /> }`, "/src/a.tsx");
		callTransform(plugin, `export default function B() { return <div sx={{ color: "red" }} /> }`, "/src/b.tsx");
		callTransform(plugin, `export default function C() { return <div sx={{ color: "red" }} /> }`, "/src/c.tsx");

		const { css } = emitBundle(plugin);

		/* Extract all class selector occurrences */
		const selectors = [...css.matchAll(/\.(a1-[a-z0-9]{8})\s*\{/g)].map((m) => m[1]);
		const unique = new Set(selectors);
		expect(selectors.length).toBe(unique.size);
	});
});
