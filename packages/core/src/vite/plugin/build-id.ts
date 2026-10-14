import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { clientUrl, type Urls } from "./environments.ts";

type ManifestEntry = { file: string; css?: readonly string[] };
type Manifest = Readonly<Record<string, ManifestEntry>>;

// The first 12 hex digits of sha256 over the sorted, deduped, root-relative JS and CSS URLs of the client manifest,
// read from `file` and `css` only (B84).
export function buildIdOf(manifest: Manifest): string {
	const urls = new Set(Object.values(manifest).flatMap((entry) => [entry.file, ...(entry.css ?? [])]));
	const list = [...urls].map((file) => `/${file}`).sort();
	return createHash("sha256").update(list.join("\n")).digest("hex").slice(0, 12);
}

// `dev` when there is no client manifest, as in `vite dev`. A build whose manifest is absent fails and names the path.
export function readBuildId(path: string | undefined): string {
	if (path === undefined) return "dev";
	return buildIdOf(readManifest(path));
}

function readManifest(path: string): Manifest {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		throw new Error(`The client manifest ${path} is missing: the client build must run before the server build`);
	}
	return JSON.parse(text);
}

// `devHead` is what `transformIndexHtml` adds to an empty document, which every dev runtime's documents carry (B95 (b)).
export type BuildInfoInput = {
	command: "serve" | "build";
	entry: string;
	manifest: string;
	urls: Urls;
	devHead: string;
};

// The source of server/lifecycle/build-info.ts in the ssr and worker environments. Dev has the project-relative
// entry and the `dev` id. A build has the manifest's hashed entry and its id.
export function buildInfoSource(input: BuildInfoInput): string {
	const dev = input.command === "serve";
	const manifest = dev ? undefined : readManifest(input.manifest);
	const id = manifest === undefined ? "dev" : buildIdOf(manifest);
	const entry = clientUrl(
		manifest === undefined ? { entry: input.entry } : { entry: input.entry, manifest, urls: input.urls },
	);
	const head = dev ? input.devHead : "";
	return `export const buildId = ${JSON.stringify(id)};\nexport const clientEntry = ${JSON.stringify(entry)};\nexport const devHead = ${JSON.stringify(head)};\n`;
}
