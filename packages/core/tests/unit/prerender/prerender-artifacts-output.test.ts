/** @vitest-environment node */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type PrerenderManifestEntry, writePrerenderArtifacts } from "../../../src/prerender/index.ts";

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { force: true, recursive: true });
});

function clientDir(): string {
	const d = mkdtempSync(join(tmpdir(), "flare-ssg-out-"));
	dirs.push(d);
	return d;
}

const ENTRIES: PrerenderManifestEntry[] = [
	{
		headers: {
			authorization: "Bearer secret",
			"content-type": "text/html; charset=utf-8",
			"set-cookie": "session=abc",
			"surrogate-key": "pages",
			"www-authenticate": "Basic",
		},
		html: "<html>about</html>",
		mode: "static",
		ndjson: '{"t":"d"}\n',
		pathname: "/about",
	},
	{ headers: {}, html: "<html>home</html>", mode: "isr", ndjson: "", pathname: "/", revalidate: 60 },
];

describe("writePrerenderArtifacts", () => {
	it("writes artifacts inside the client output under <assetsBase>/_flare-static/<buildId>/", () => {
		const dir = clientDir();
		const out = writePrerenderArtifacts({
			assetsBase: "/assets/landing",
			buildId: "b1",
			clientDir: dir,
			entries: ENTRIES,
		});

		const base = join(dir, "assets/landing/_flare-static/b1");
		expect(out).toBe(base);
		/* One JSON file per page: a single fetch, and no host rewrites `.html` requests. */
		const about = JSON.parse(readFileSync(join(base, "about.json"), "utf-8"));
		expect(about.html).toBe("<html>about</html>");
		expect(about.ndjson).toBe('{"t":"d"}\n');
		expect(existsSync(join(base, "index.json"))).toBe(true);
		expect(existsSync(join(base, "about.html"))).toBe(false);
	});

	it("writes a manifest naming the build and its routes", () => {
		const dir = clientDir();
		writePrerenderArtifacts({ assetsBase: "/assets", buildId: "b1", clientDir: dir, entries: ENTRIES });

		const manifest = JSON.parse(readFileSync(join(dir, "assets/_flare-static/b1/manifest.json"), "utf-8"));
		expect(manifest.buildId).toBe("b1");
		expect(manifest.routes.map((r: { pathname: string }) => r.pathname).sort()).toEqual(["/", "/about"]);
	});

	it("never writes cookies or credentials into the publicly readable headers file", () => {
		const dir = clientDir();
		writePrerenderArtifacts({ assetsBase: "/assets", buildId: "b1", clientDir: dir, entries: ENTRIES });

		const { headers } = JSON.parse(readFileSync(join(dir, "assets/_flare-static/b1/about.json"), "utf-8"));
		expect(headers).toEqual({ "content-type": "text/html; charset=utf-8", "surrogate-key": "pages" });
	});
});
