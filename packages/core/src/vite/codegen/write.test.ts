import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { GENERATED, watchGenerated, writeGenerated } from "./write.ts";

const roots: string[] = [];

afterEach(() => {
	vi.useRealTimers();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const LAYOUT = 'export const route = createRootLayout("_root_").render(() => "root");\n';
const page = (id: string): string => `export const route = createPage(${JSON.stringify(id)}).render(() => "p");\n`;
const FN =
	'import { createServerFn } from "@lovrozagar/flare/server-fn";\nexport const echo = createServerFn().handler(() => 1);\n';

function app(files: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), "flare-codegen-"));
	roots.push(root);
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
	return root;
}

const BASE = {
	"src/routes/_root_/root.root-layout.tsx": LAYOUT,
	"src/routes/_root_/home.page.tsx": page("_root_/"),
	"src/fns/echo.ts": FN,
};

const generated = (root: string, name: string): string => readFileSync(join(root, "src/_gen", name), "utf8");

// The three files are written under src/_gen. Unchanged output is not written again: the file keeps its time.
it("unchanged", () => {
	const root = app(BASE);
	expect(writeGenerated(root)).toEqual(GENERATED.map((name) => `src/_gen/${name}`));
	expect(generated(root, "routes.gen.ts")).toContain('import("../routes/_root_/home.page.tsx")');
	expect(generated(root, "types.gen.d.ts")).toContain("FlareRegister");
	expect(generated(root, "server-fns.gen.ts")).toContain('import("../fns/echo.ts")');
	const before = statSync(join(root, "src/_gen/routes.gen.ts")).mtimeMs;
	expect(writeGenerated(root)).toEqual([]);
	expect(statSync(join(root, "src/_gen/routes.gen.ts")).mtimeMs).toBe(before);
});

// An empty route set removes the route and type files. The server function list stays, from its own sources.
it("empty", () => {
	const root = app(BASE);
	writeGenerated(root);
	rmSync(join(root, "src/routes"), { recursive: true });
	expect(writeGenerated(root)).toEqual(["src/_gen/routes.gen.ts", "src/_gen/types.gen.d.ts"]);
	expect(existsSync(join(root, "src/_gen/routes.gen.ts"))).toBe(false);
	expect(existsSync(join(root, "src/_gen/types.gen.d.ts"))).toBe(false);
	expect(existsSync(join(root, "src/_gen/server-fns.gen.ts"))).toBe(true);
	expect(writeGenerated(root)).toEqual([]);
	// Files are taken in UTF-16 code unit order, so the output does not depend on the file system's listing.
	const sorted = app({
		...BASE,
		"src/routes/_root_/b/b.page.tsx": page("_root_/b"),
		"src/routes/_root_/B/B.page.tsx": page("_root_/B"),
	});
	writeGenerated(sorted);
	const routes = generated(sorted, "routes.gen.ts");
	expect(routes.indexOf('"_root_/B"')).toBeLessThan(routes.indexOf('"_root_/b"'));
});

type Listener = (event: string, path: string) => void;

// `vite dev` rewrites the files after a short debounce when a source under src changes. A failure is reported, and
// the watch goes on. A change inside src/_gen itself is not a source.
it("watch", () => {
	vi.useFakeTimers();
	const root = app(BASE);
	writeGenerated(root);
	const listeners: Listener[] = [];
	const errors: string[] = [];
	watchGenerated(
		{
			watcher: { on: (_event: "all", listener: Listener) => void listeners.push(listener) },
			config: { logger: { error: (message: string) => void errors.push(message) } },
		},
		root,
	);
	const emit = (path: string): void => {
		for (const listener of listeners) listener("change", join(root, path));
	};
	mkdirSync(join(root, "src/routes/_root_/about"));
	writeFileSync(join(root, "src/routes/_root_/about/about.page.tsx"), page("_root_/about"));
	emit("src/routes/_root_/about/about.page.tsx");
	emit("src/routes/_root_/about/about.page.tsx");
	expect(generated(root, "routes.gen.ts")).not.toContain("_root_/about");
	vi.advanceTimersByTime(50);
	expect(generated(root, "routes.gen.ts")).toContain('"_root_/about"');
	emit("src/_gen/routes.gen.ts");
	emit("elsewhere/file.ts");
	writeFileSync(join(root, "src/routes/_root_/other.page.tsx"), page("_root_/other"));
	emit("src/routes/_root_/other.page.tsx");
	vi.advanceTimersByTime(50);
	expect(errors).toHaveLength(1);
	expect(errors[0]).toMatch(/^\[flare:codegen\] .*two pages/);
	rmSync(join(root, "src/routes/_root_/other.page.tsx"));
	emit("src/routes/_root_/other.page.tsx");
	vi.advanceTimersByTime(50);
	expect(errors).toHaveLength(1);
});
