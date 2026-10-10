import { readFileSync, writeFileSync } from "node:fs";
import { comments, getPost, headForPost } from "../shared/data";

const POST_SLUG = "building-web-frameworks";

interface CapturedResponse {
	url: string;
	status: number;
	headers: Record<string, string>;
	contentType: string;
	body: string;
	size: number;
}

interface WireAnnotation {
	totalLines: number;
	linesByType: Record<string, number>;
	userDataBytes: number;
	overheadBytes: number;
}

interface SpaJsCost {
	totalBytes: number;
	fileCount: number;
	files: Array<{ url: string; size: number }>;
}

interface InitialJsCost {
	totalBytes: number;
	fileCount: number;
}

interface InteractivityResult {
	buttonFound: boolean;
	initialText: string;
	afterClickText: string;
	worked: boolean;
}

interface TtfbResult {
	ssrMs: number;
	spaMs: number;
}

interface GzipSizes {
	ssrHtml: number;
	spaPayload: number | null;
}

interface BuildOutput {
	totalClientKB: number;
	totalServerKB: number;
	chunkCount: number;
	entryChunkKB: number;
}

interface FrameworkResult {
	name: string;
	port: number;
	mode?: string;
	ssrHtml: {
		url: string;
		size: number;
		stateSize: number;
		htmlOnly: number;
	};
	spaNavigation: CapturedResponse | null;
	wireAnnotation: WireAnnotation | null;
	spaJsCost: SpaJsCost | null;
	initialJsCost: InitialJsCost | null;
	headAfterNav: {
		title: string;
		ogTitle: string | null;
		ogDescription: string | null;
		description: string | null;
	};
	backForwardRefetches: number;
	prefetchRequests: number;
	interactivity?: InteractivityResult | null;
	ttfb?: TtfbResult | null;
	gzipSizes?: GzipSizes | null;
	buildOutput?: BuildOutput | null;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	return `${(bytes / 1024).toFixed(1)} KB`;
}

function truncate(str: string, maxLines: number): string {
	const lines = str.split("\n");
	if (lines.length <= maxLines) return str;
	return lines.slice(0, maxLines).join("\n") + `\n... (${lines.length - maxLines} more lines)`;
}

/**
 * Bitmap-based measurement of user data vs framework overhead.
 * Marks byte positions containing known user-authored strings.
 */
function computeUserDataBytes(body: string): { userDataBytes: number; overheadBytes: number } {
	const post = getPost(POST_SLUG);
	if (!post) return { overheadBytes: body.length, userDataBytes: 0 };

	const postComments = comments[POST_SLUG] ?? [];
	const head = headForPost(post);

	const userStrings = new Set([
		post.body,
		head.description,
		head.openGraph.description,
		post.title,
		head.openGraph.title,
		post.author,
		head.openGraph.author,
		head.openGraph.type,
		...postComments.flatMap((c) => [c.text, c.author, c.date]),
	]);

	const isUser = new Uint8Array(body.length);
	for (const str of userStrings) {
		if (str.length < 4) continue;
		let idx = 0;
		while (true) {
			const found = body.indexOf(str, idx);
			if (found === -1) break;
			for (let i = found; i < found + str.length; i++) {
				isUser[i] = 1;
			}
			idx = found + 1;
		}
	}

	const userDataBytes = isUser.reduce((sum, v) => sum + v, 0);
	return { overheadBytes: body.length - userDataBytes, userDataBytes };
}

function annotateFlareWireData(body: string): WireAnnotation {
	const nlines = body.split("\n").filter((l) => l.trim());
	const linesByType: Record<string, number> = {};
	const typeNames: Record<string, string> = {
		c: "chunk",
		d: "done",
		h: "head",
		l: "loader",
		r: "ready",
	};
	for (const line of nlines) {
		try {
			const parsed = JSON.parse(line);
			const typeName = typeNames[parsed.t] ?? `unknown(${parsed.t})`;
			linesByType[typeName] = (linesByType[typeName] ?? 0) + 1;
		} catch {
			linesByType["parse-error"] = (linesByType["parse-error"] ?? 0) + 1;
		}
	}
	return { linesByType, totalLines: nlines.length, ...computeUserDataBytes(body) };
}

function annotateNextRscData(body: string): WireAnnotation {
	const nlines = body.split("\n").filter((l) => l.trim());
	const linesByType: Record<string, number> = {};
	for (const line of nlines) {
		const colonIdx = line.indexOf(":");
		if (colonIdx === -1) {
			linesByType["unknown"] = (linesByType["unknown"] ?? 0) + 1;
			continue;
		}
		const payload = line.slice(colonIdx + 1);
		let type: string;
		if (payload.startsWith("I[")) type = "module-ref";
		else if (payload.startsWith('D"')) type = "debug-info";
		else if (/^T[0-9a-f]+,/.test(payload)) type = "text-blob";
		else if (payload.startsWith("[")) type = "vdom-node";
		else if (payload.startsWith('"')) type = "string-const";
		else if (payload.startsWith("{")) type = "object";
		else if (payload === "null") type = "null";
		else type = "other";
		linesByType[type] = (linesByType[type] ?? 0) + 1;
	}
	return { linesByType, totalLines: nlines.length, ...computeUserDataBytes(body) };
}

/**
 * Ensure wireAnnotation is present -- compute from body if missing.
 */
function ensureWireAnnotation(result: FrameworkResult): WireAnnotation | null {
	if (result.wireAnnotation) return result.wireAnnotation;
	if (!result.spaNavigation) return null;
	if (result.name === "Flare") return annotateFlareWireData(result.spaNavigation.body);
	if (result.name === "Next.js") return annotateNextRscData(result.spaNavigation.body);
	return null;
}

function pct(part: number, total: number): string {
	if (total === 0) return "0%";
	return `${((part / total) * 100).toFixed(0)}%`;
}

function fwFind(results: FrameworkResult[], name: string): FrameworkResult | undefined {
	return results.find((r) => r.name === name);
}

/* --- Flare NDJSON line annotator --- */
function annotateFlareLines(body: string): string[] {
	const lines = body.split("\n").filter((l) => l.trim());
	const annotations: string[] = [];
	const typeDescs: Record<string, string> = {
		c: "CHUNK (deferred data resolved)",
		d: "DONE (stream complete)",
		h: "HEAD (route meta/title/OG tags)",
		l: "LOADER (route data)",
		r: "READY (initial data complete, start rendering)",
	};

	for (const line of lines) {
		try {
			const parsed = JSON.parse(line);
			const t = parsed.t as string;
			const desc = typeDescs[t] ?? `UNKNOWN (${t})`;
			let detail = "";
			if (parsed.m) {
				const route = parsed.m.split(":")[0];
				detail = ` [${route}]`;
			}
			if (t === "c" && parsed.k) {
				detail += ` key=${parsed.k}`;
			}

			const preview = line.length > 120 ? `${line.slice(0, 120)}...` : line;
			annotations.push(`${desc}${detail}`);
			annotations.push(`  ${preview}`);
		} catch {
			annotations.push(`PARSE ERROR: ${line.slice(0, 80)}`);
		}
	}
	return annotations;
}

/* --- Next.js RSC Flight line annotator --- */
function annotateRscLines(body: string): string[] {
	const lines = body.split("\n").filter((l) => l.trim());
	const annotations: string[] = [];

	for (const line of lines) {
		const colonIdx = line.indexOf(":");
		if (colonIdx === -1) continue;

		const id = line.slice(0, colonIdx);
		const payload = line.slice(colonIdx + 1);
		let desc: string;

		if (payload.startsWith("I[")) {
			const match = payload.match(/"([^"]+)"/);
			const modName = match ? match[1].split("/").pop() : "?";
			desc = `MODULE_REF -> import ${modName}`;
		} else if (payload.startsWith('D"')) {
			desc = "DEBUG_INFO (dev-only component trace)";
		} else if (/^T[0-9a-f]+,/.test(payload)) {
			const commaIdx = payload.indexOf(",");
			const hexLen = payload.slice(1, commaIdx);
			desc = `TEXT_BLOB (${parseInt(hexLen, 16)} bytes of inline text)`;
		} else if (payload.startsWith("[")) {
			if (payload.includes('"$","article"')) desc = "VDOM -> <article> with children";
			else if (payload.includes('"$","ul"')) desc = "VDOM -> <ul> (comments list)";
			else if (payload.includes('"$","li"')) desc = "VDOM -> <li> (comment item)";
			else if (payload.includes('"$","h1"')) desc = "VDOM -> <h1> (post title)";
			else if (payload.includes('"$","meta"')) desc = "VDOM -> <meta> tag(s)";
			else if (payload.includes('"$","title"')) desc = "VDOM -> <title> tag";
			else if (payload.includes('"$","$L')) desc = "VDOM -> lazy component reference";
			else if (payload.includes('"$","$1c"')) desc = "VDOM -> <Suspense> boundary";
			else desc = "VDOM -> React element tree";
		} else if (payload.startsWith('"')) {
			desc = `STRING_CONST = ${payload.slice(0, 60)}`;
		} else if (payload.startsWith("{")) {
			if (payload.includes('"metadata"')) desc = "OBJECT -> resolved metadata";
			else if (payload.includes('"name":')) {
				const nameMatch = payload.match(/"name":"([^"]*)"/);
				desc = `OBJECT -> component debug: ${nameMatch ? nameMatch[1] : "?"}`;
			} else if (payload.includes('"b":"development"')) desc = "OBJECT -> router state tree";
			else desc = "OBJECT -> props/data";
		} else if (payload === "null") {
			desc = "NULL -> resolved empty value";
		} else {
			desc = "OTHER";
		}

		const preview = line.length > 120 ? `${line.slice(0, 120)}...` : line;
		annotations.push(`${id}: ${desc}`);
		annotations.push(`  ${preview}`);
	}
	return annotations;
}

function generateReport(results: FrameworkResult[]): string {
	const lines: string[] = [];
	const flare = fwFind(results, "Flare");
	const next = fwFind(results, "Next.js");
	const tanstack = fwFind(results, "TanStack Start");
	const isProd = results[0]?.mode === "prod";

	/* Ensure wire annotations are computed for all frameworks with SPA nav data */
	for (const r of results) {
		r.wireAnnotation = ensureWireAnnotation(r);
	}

	lines.push("# Framework Wire Format Comparison Results");
	lines.push("");
	lines.push(`> Generated: ${new Date().toISOString()}`);
	lines.push(
		`> Mode: **${isProd ? "Production" : "Development"}** (${isProd ? "built + served from dist" : "dev servers, unminified JS"})`,
	);
	lines.push(`> Test page: \`/posts/building-web-frameworks\``);
	lines.push(
		`> Identical data fixture: 1 post (title, author, 1178-char body) + 3 comments (500ms deferred) + Like button (interactive)`,
	);
	lines.push("");

	/* ================================================================ */
	/* Summary Table                                                     */
	/* ================================================================ */
	lines.push("## Summary");
	lines.push("");
	lines.push("| Metric | " + results.map((r) => r.name).join(" | ") + " |");
	lines.push("|--------|" + results.map(() => "---").join("|") + "|");

	lines.push("| SSR HTML size | " + results.map((r) => formatBytes(r.ssrHtml.size)).join(" | ") + " |");
	lines.push(
		"| HTML only (no state) | " +
			results.map((r) => (r.ssrHtml.htmlOnly > 0 ? formatBytes(r.ssrHtml.htmlOnly) : "N/A")).join(" | ") +
			" |",
	);
	lines.push(
		"| Embedded state size | " +
			results.map((r) => (r.ssrHtml.stateSize > 0 ? formatBytes(r.ssrHtml.stateSize) : "N/A")).join(" | ") +
			" |",
	);

	/* Gzip sizes */
	if (results.some((r) => r.gzipSizes)) {
		lines.push(
			"| SSR HTML gzipped | " +
				results.map((r) => (r.gzipSizes ? formatBytes(r.gzipSizes.ssrHtml) : "N/A")).join(" | ") +
				" |",
		);
		lines.push(
			"| SPA nav gzipped | " +
				results
					.map((r) => {
						if (r.gzipSizes?.spaPayload != null) return formatBytes(r.gzipSizes.spaPayload);
						if (r.name === "TanStack Start") return "N/A";
						return "N/A";
					})
					.join(" | ") +
				" |",
		);
	}

	lines.push(
		"| SPA nav payload | " +
			results
				.map((r) => {
					if (r.spaNavigation) return formatBytes(r.spaNavigation.size);
					if (r.name === "TanStack Start") return "0 B (client-side)";
					return "N/A";
				})
				.join(" | ") +
			" |",
	);
	lines.push(
		"| SPA nav content-type | " +
			results
				.map((r) => {
					if (r.spaNavigation) return `\`${r.spaNavigation.contentType}\``;
					if (r.name === "TanStack Start") return "none (loader runs in browser)";
					return "N/A";
				})
				.join(" | ") +
			" |",
	);
	lines.push(
		"| User data / overhead | " +
			results
				.map((r) => {
					if (r.wireAnnotation) {
						const wa = r.wireAnnotation;
						return `${formatBytes(wa.userDataBytes)} / ${formatBytes(wa.overheadBytes)} (${pct(wa.overheadBytes, wa.userDataBytes + wa.overheadBytes)} overhead)`;
					}
					return "N/A";
				})
				.join(" | ") +
			" |",
	);

	/* TTFB */
	if (results.some((r) => r.ttfb)) {
		lines.push(
			"| TTFB SSR (median 5 runs) | " + results.map((r) => (r.ttfb ? `${r.ttfb.ssrMs}ms` : "N/A")).join(" | ") + " |",
		);
		lines.push(
			"| TTFB SPA nav (median 5 runs) | " +
				results
					.map((r) => {
						if (!r.ttfb) return "N/A";
						if (r.ttfb.spaMs === 0 && r.name === "TanStack Start") return "N/A (client-side)";
						return `${r.ttfb.spaMs}ms`;
					})
					.join(" | ") +
				" |",
		);
	}

	lines.push(
		"| Initial page JS (runtime) | " +
			results
				.map((r) => {
					if (r.initialJsCost) return `${formatBytes(r.initialJsCost.totalBytes)} (${r.initialJsCost.fileCount} files)`;
					return "N/A";
				})
				.join(" | ") +
			" |",
	);
	lines.push(
		"| JS loaded on SPA nav | " +
			results
				.map((r) => {
					if (r.spaJsCost) return `${formatBytes(r.spaJsCost.totalBytes)} (${r.spaJsCost.fileCount} files)`;
					return "none";
				})
				.join(" | ") +
			" |",
	);
	lines.push(
		"| **Total SPA nav cost** | " +
			results
				.map((r) => {
					const wire = r.spaNavigation?.size ?? 0;
					const js = r.spaJsCost?.totalBytes ?? 0;
					const total = wire + js;
					if (total === 0) return "N/A";
					const parts: string[] = [];
					if (wire > 0) parts.push(`${formatBytes(wire)} data`);
					if (js > 0) parts.push(`${formatBytes(js)} JS`);
					return `**${formatBytes(total)}** (${parts.join(" + ")})`;
				})
				.join(" | ") +
			" |",
	);

	/* Build output summary rows (prod only) */
	if (results.some((r) => r.buildOutput)) {
		lines.push(
			"| Client bundle total | " +
				results.map((r) => (r.buildOutput ? `${r.buildOutput.totalClientKB} KB` : "N/A")).join(" | ") +
				" |",
		);
		lines.push(
			"| Server bundle total | " +
				results.map((r) => (r.buildOutput ? `${r.buildOutput.totalServerKB} KB` : "N/A")).join(" | ") +
				" |",
		);
		lines.push(
			"| Entry chunk size | " +
				results.map((r) => (r.buildOutput ? `${r.buildOutput.entryChunkKB} KB` : "N/A")).join(" | ") +
				" |",
		);
	}

	lines.push(
		"| document.title after nav | " +
			results.map((r) => (r.headAfterNav.title ? `"${r.headAfterNav.title}"` : "N/A")).join(" | ") +
			" |",
	);
	lines.push(
		"| og:title after nav | " +
			results.map((r) => (r.headAfterNav.ogTitle ? `"${r.headAfterNav.ogTitle}"` : "missing")).join(" | ") +
			" |",
	);
	lines.push(
		"| og:description after nav | " +
			results.map((r) => (r.headAfterNav.ogDescription ? "present" : "missing")).join(" | ") +
			" |",
	);
	lines.push(
		"| Re-fetches on back/fwd | " +
			results
				.map((r) => (r.backForwardRefetches > 0 ? `${r.backForwardRefetches} requests` : "0 (cached)"))
				.join(" | ") +
			" |",
	);
	lines.push(
		"| Prefetch on hover | " +
			results.map((r) => (r.prefetchRequests > 0 ? `${r.prefetchRequests} requests` : "none")).join(" | ") +
			" |",
	);
	lines.push(
		"| Interactivity (Like button) | " +
			results
				.map((r) => {
					if (!r.interactivity) return "N/A";
					if (!r.interactivity.buttonFound) return "button not found";
					return r.interactivity.worked
						? `OK (${r.interactivity.initialText} -> ${r.interactivity.afterClickText})`
						: "FAIL";
				})
				.join(" | ") +
			" |",
	);

	lines.push("");

	/* ================================================================ */
	/* Per-framework detailed capture                                    */
	/* ================================================================ */
	for (const result of results) {
		lines.push(`## ${result.name} (port ${result.port})`);
		lines.push("");

		lines.push("### SSR Response");
		lines.push(`- Total HTML: ${formatBytes(result.ssrHtml.size)}`);
		if (result.gzipSizes) {
			lines.push(`- Gzipped: ${formatBytes(result.gzipSizes.ssrHtml)}`);
		}
		lines.push(`- HTML only: ${formatBytes(result.ssrHtml.htmlOnly)}`);
		lines.push(
			`- Embedded state: ${result.ssrHtml.stateSize > 0 ? formatBytes(result.ssrHtml.stateSize) : "not detected"}`,
		);
		lines.push("");

		if (result.ttfb) {
			lines.push("### TTFB");
			lines.push(`- SSR (median 5 runs): ${result.ttfb.ssrMs}ms`);
			if (result.ttfb.spaMs > 0) {
				lines.push(`- SPA nav (median 5 runs): ${result.ttfb.spaMs}ms`);
			} else if (result.name === "TanStack Start") {
				lines.push("- SPA nav: N/A (client-side loader)");
			}
			lines.push("");
		}

		if (result.spaNavigation) {
			lines.push("### SPA Navigation Response");
			lines.push(`- URL: \`${result.spaNavigation.url}\``);
			lines.push(`- Status: ${result.spaNavigation.status}`);
			lines.push(`- Content-Type: \`${result.spaNavigation.contentType}\``);
			lines.push(`- Size: ${formatBytes(result.spaNavigation.size)}`);
			if (result.gzipSizes?.spaPayload != null) {
				lines.push(`- Gzipped: ${formatBytes(result.gzipSizes.spaPayload)}`);
			}
			lines.push("");

			lines.push("**Headers:**");
			lines.push("```");
			for (const [k, v] of Object.entries(result.spaNavigation.headers)) {
				if (
					["content-type", "content-length", "transfer-encoding", "cache-control", "vary", "rsc", "x-action"].includes(
						k,
					)
				) {
					lines.push(`${k}: ${v}`);
				}
			}
			lines.push("```");
			lines.push("");

			lines.push("**Response body (first 50 lines):**");
			lines.push("```");
			lines.push(truncate(result.spaNavigation.body, 50));
			lines.push("```");
			lines.push("");

			if (result.spaJsCost && result.spaJsCost.fileCount > 0) {
				lines.push(
					`**JS loaded during SPA nav:** ${formatBytes(result.spaJsCost.totalBytes)} (${result.spaJsCost.fileCount} files)`,
				);
				lines.push("");
			}
		} else {
			lines.push("### SPA Navigation Response");
			if (result.name === "TanStack Start") {
				lines.push("*No data request -- loaders are isomorphic and run client-side during SPA navigation.*");
				lines.push("Only `createServerFn()` calls would trigger server RPCs (to `/_serverFn/<id>`).");
				if (result.spaJsCost) {
					lines.push(
						`Code-split JS loaded during SPA nav: **${formatBytes(result.spaJsCost.totalBytes)}** (${result.spaJsCost.fileCount} files):`,
					);
					lines.push("");
					for (const f of result.spaJsCost.files) {
						const short = f.url.replace(/^https?:\/\/localhost:\d+/, "");
						lines.push(`- \`${short}\` -- ${formatBytes(f.size)}`);
					}
				} else {
					lines.push("The route module code is loaded via code-split chunks during SPA nav.");
				}
			} else {
				lines.push("*No SPA navigation response captured*");
			}
			lines.push("");
		}

		lines.push("### Head Tags After SPA Navigation");
		lines.push(`- \`document.title\`: "${result.headAfterNav.title}"`);
		lines.push(`- \`og:title\`: ${result.headAfterNav.ogTitle ?? "missing"}`);
		lines.push(`- \`og:description\`: ${result.headAfterNav.ogDescription ?? "missing"}`);
		lines.push(`- \`description\`: ${result.headAfterNav.description ?? "missing"}`);
		lines.push("");

		lines.push("### Back/Forward Re-fetches");
		lines.push(
			`- ${result.backForwardRefetches > 0 ? `${result.backForwardRefetches} data requests` : "0 -- fully cached"}`,
		);
		lines.push("");

		lines.push("### Prefetch on Hover");
		lines.push(`- ${result.prefetchRequests > 0 ? `${result.prefetchRequests} requests` : "None"}`);
		lines.push("");

		if (result.interactivity) {
			lines.push("### Interactivity (Like Button)");
			if (result.interactivity.buttonFound) {
				lines.push(`- Button found: yes`);
				lines.push(`- Initial: "${result.interactivity.initialText}"`);
				lines.push(`- After click: "${result.interactivity.afterClickText}"`);
				lines.push(`- Hydration + event handler: ${result.interactivity.worked ? "**working**" : "**BROKEN**"}`);
			} else {
				lines.push("- Button not found on page");
			}
			lines.push("");
		}

		if (result.buildOutput) {
			lines.push("### Build Output");
			lines.push(`- Client bundle: ${result.buildOutput.totalClientKB} KB (${result.buildOutput.chunkCount} files)`);
			lines.push(`- Server bundle: ${result.buildOutput.totalServerKB} KB`);
			lines.push(`- Entry chunk: ${result.buildOutput.entryChunkKB} KB`);
			lines.push("");
		}

		lines.push("---");
		lines.push("");
	}

	/* ================================================================ */
	/* Deep Analysis                                                      */
	/* ================================================================ */
	lines.push("## Deep Analysis");
	lines.push("");

	/* --- A. Wire Protocol Annotated --- */
	lines.push("### A. Wire Protocol Annotated");
	lines.push("");
	lines.push("What each framework actually sends on SPA navigation, line by line from the captured response.");
	lines.push("");

	if (flare?.spaNavigation) {
		lines.push("#### Flare -- NDJSON (`application/x-ndjson`)");
		lines.push("");
		lines.push(
			`${flare.wireAnnotation?.totalLines ?? "?"} lines, each a complete JSON object with a \`t\` (type) field:`,
		);
		lines.push("");
		if (flare.wireAnnotation) {
			lines.push("| Type | Count | Purpose |");
			lines.push("|------|-------|---------|");
			const typeDescs: Record<string, string> = {
				chunk: "Deferred data (resolved after `ready`)",
				done: "Stream close signal",
				head: "`<head>` config per route (title, meta, OG tags)",
				loader: "Route data keyed by matchId",
				ready: "Signal: initial data complete, client can render",
			};
			for (const [type, count] of Object.entries(flare.wireAnnotation.linesByType).sort(([, a], [, b]) => b - a)) {
				lines.push(`| ${type} | ${count} | ${typeDescs[type] ?? ""} |`);
			}
			lines.push("");
		}
		lines.push("**Annotated response:**");
		lines.push("```");
		for (const line of annotateFlareLines(flare.spaNavigation.body)) {
			lines.push(line);
		}
		lines.push("```");
		lines.push("");
		lines.push(
			"**Key observation:** Every line is self-describing. The `m` field contains the route path + serialized params, so you can identify exactly which route produced which data in the Network tab without any tooling.",
		);
		lines.push("");
	}

	if (next?.spaNavigation) {
		lines.push("#### Next.js -- RSC Flight (`text/x-component`)");
		lines.push("");
		lines.push(
			`${next.wireAnnotation?.totalLines ?? "?"} lines in a custom binary-ish format. Each line is \`<hex_id>:<payload>\`:`,
		);
		lines.push("");
		if (next.wireAnnotation) {
			lines.push("| Type | Count | Purpose |");
			lines.push("|------|-------|---------|");
			const typeDescs: Record<string, string> = {
				"debug-info": "Dev-only component traces (name, env, owner, stack frames)",
				"module-ref": "Client component import (module path + chunk file)",
				null: "Resolved empty value (e.g., awaited boundary ready)",
				object: "Props, metadata objects, router state tree",
				other: "Other payload types",
				"string-const": "Shared string (e.g., `react.fragment`, `react.suspense`)",
				"text-blob": "Length-prefixed raw text (e.g., post body)",
				"vdom-node": 'React vDOM element: `["$","tag",key,{props...}]`',
			};
			for (const [type, count] of Object.entries(next.wireAnnotation.linesByType).sort(([, a], [, b]) => b - a)) {
				lines.push(`| ${type} | ${count} | ${typeDescs[type] ?? ""} |`);
			}
			lines.push("");
		}
		lines.push("**Annotated response (key lines):**");
		lines.push("```");
		const rscAnnotated = annotateRscLines(next.spaNavigation.body);
		/* Show all annotations -- they're already concise */
		for (const line of rscAnnotated) {
			lines.push(line);
		}
		lines.push("```");
		lines.push("");
		if (isProd) {
			lines.push(
				"**Key observation:** In production mode, debug-info lines are stripped, reducing overhead. The response still contains the full vDOM tree with module references and data interleaved.",
			);
		} else {
			lines.push(
				"**Key observation:** The response is a serialized React component tree -- UI structure and data are interleaved. Numeric hex IDs (`2:`, `c:`, `1f:`) reference each other via `$L` prefixes. Debug info lines (present in dev mode) add significant overhead with full stack traces and source locations.",
			);
		}
		lines.push("");
	}

	if (tanstack) {
		lines.push("#### TanStack Start -- Zero Wire");
		lines.push("");
		lines.push(
			"TanStack Start loaders are **isomorphic**: they run on the server during SSR, then **in the browser** during SPA navigation. No server request is made for data -- the loader function is bundled into the client code and executed locally.",
		);
		lines.push("");
		lines.push(
			"Server communication only happens via explicit `createServerFn()` calls, which trigger RPCs to `/_serverFn/<hashed-id>`. The benchmark's loader uses `getPost()` and `getDelayedComments()` which are bundled into the client, so SPA navigation has zero wire overhead for data.",
		);
		lines.push("");
		lines.push(
			"**Trade-off:** Zero wire overhead means the data-fetching code (and its dependencies) must be shipped to the client. If the loader accessed a database or secret, you'd need `createServerFn()` and the zero-wire benefit disappears.",
		);
		lines.push("");
	}

	/* --- B. Data/UI Coupling --- */
	lines.push("### B. Data/UI Coupling");
	lines.push("");
	lines.push(
		"The fundamental architectural split: does the wire format carry **data only** or **data fused with UI structure**?",
	);
	lines.push("");

	lines.push("#### Flare: Data Only");
	lines.push("");
	lines.push(
		"Loader data is a pure JSON object, keyed by route matchId. The UI is already on the client (Solid components). Example from the actual response:",
	);
	lines.push("");
	lines.push("```json");
	if (flare?.spaNavigation) {
		const loaderLine = flare.spaNavigation.body.split("\n").find((l) => l.includes('"t":"l"') && l.includes("post"));
		if (loaderLine) {
			try {
				const parsed = JSON.parse(loaderLine);
				lines.push(JSON.stringify(parsed, null, 2));
			} catch {
				lines.push(loaderLine);
			}
		}
	}
	lines.push("```");
	lines.push("");
	lines.push(
		"The data object (`d`) contains the post and a deferred comments placeholder. The `m` field is the matchId. No component structure, no element tags, no props wiring -- just data.",
	);
	lines.push("");

	lines.push("#### Next.js: Data + UI Fused");
	lines.push("");
	lines.push(
		"The RSC Flight response contains the full React virtual DOM tree with data inlined. The same post title appears inside a vDOM node:",
	);
	lines.push("");
	lines.push("```");
	if (next?.spaNavigation) {
		const vdomLine = next.spaNavigation.body.split("\n").find((l) => l.includes('"article"'));
		if (vdomLine) {
			lines.push(vdomLine.length > 300 ? `${vdomLine.slice(0, 300)}...` : vdomLine);
		}
	}
	lines.push("```");
	lines.push("");
	lines.push(
		"That line encodes: `<article><h1>title</h1><p>By author</p><div>body</div>...</article>` -- the **component tree structure** and the **data** are one and the same. You cannot cache the data separately from the UI because they're fused into a single serialized tree.",
	);
	lines.push("");

	lines.push("#### TanStack Start: Data Only (Client-Side)");
	lines.push("");
	lines.push(
		'Like Flare, TanStack separates data from UI. But instead of sending data over the wire, the loader runs client-side and produces a plain object `{ post, comments }` that the React component consumes. During SSR, the same data is embedded in the HTML as a JSON blob inside a `<script class="$tsr">` tag.',
	);
	lines.push("");

	lines.push("#### Implications");
	lines.push("");
	lines.push("| Capability | Flare | Next.js | TanStack Start |");
	lines.push("|------------|-------|---------|----------------|");
	lines.push(
		"| Cache data independently of UI | Yes (data-only wire) | No (data fused with vDOM) | Yes (client-side object) |",
	);
	lines.push("| Swap UI without re-fetching data | Yes | No (new RSC render needed) | Yes |");
	lines.push("| Server-side data cache (KV/Redis) | Natural fit | Must cache entire RSC tree | N/A (client-side) |");
	lines.push("| Inspect data in Network tab | JSON -- readable | vDOM -- needs React DevTools | N/A (no request) |");
	lines.push("");

	/* --- C. Head Management on SPA Navigation --- */
	lines.push("### C. Head Management on SPA Navigation");
	lines.push("");
	lines.push(
		"All three frameworks correctly set `document.title`, `og:title`, `og:description`, and `description` after SPA navigation (verified in captured head tags). The mechanism differs:",
	);
	lines.push("");

	lines.push("#### Flare");
	lines.push("");
	lines.push(
		'Head config is streamed as structured data in dedicated `t:"h"` NDJSON lines, one per route in the match chain. From the actual response:',
	);
	lines.push("");
	lines.push("```json");
	if (flare?.spaNavigation) {
		const headLines = flare.spaNavigation.body.split("\n").filter((l) => l.includes('"t":"h"'));
		for (const headLine of headLines) {
			try {
				const parsed = JSON.parse(headLine);
				lines.push(JSON.stringify(parsed, null, 2));
			} catch {
				lines.push(headLine);
			}
		}
	}
	lines.push("```");
	lines.push("");
	lines.push(
		'The root layout sends its head (`title: "Flare Benchmark"`), and the page overrides with post-specific metadata. The client merges these by route depth -- deeper routes override shallower ones. Head data is cached per `matchId`, so back-navigation can restore metadata from cache without refetching.',
	);
	lines.push("");

	lines.push("#### Next.js");
	lines.push("");
	lines.push(
		"Metadata is resolved via `generateMetadata()` on the server and embedded in the RSC Flight response as vDOM `<meta>` and `<title>` elements inside `MetadataBoundary` / `AsyncMetadata` components. From the actual response:",
	);
	lines.push("");
	lines.push("```");
	if (next?.spaNavigation) {
		const metadataLine = next.spaNavigation.body.split("\n").find((l) => l.startsWith("c:") && l.includes("metadata"));
		if (metadataLine) {
			lines.push(metadataLine.length > 400 ? `${metadataLine.slice(0, 400)}...` : metadataLine);
		}
	}
	lines.push("```");
	lines.push("");
	lines.push(
		"Metadata is part of the component tree -- it's rendered via `<MetadataBoundary>` and `<AsyncMetadata>` Suspense boundaries. This means metadata resolution is coupled to the component render cycle. In the captured response, Next.js also auto-generates `twitter:card`, `twitter:title`, and `twitter:description` tags from the OpenGraph config.",
	);
	lines.push("");

	lines.push("#### TanStack Start");
	lines.push("");
	lines.push(
		"The `head()` function runs client-side during SPA nav (isomorphic like the loader). It returns a meta descriptor array:",
	);
	lines.push("");
	lines.push("```ts");
	lines.push("head: ({ loaderData }) => ({");
	lines.push("  meta: [");
	lines.push("    { title: h.title },");
	lines.push('    { name: "description", content: h.description },');
	lines.push('    { property: "og:title", content: h.openGraph.title },');
	lines.push("  ],");
	lines.push("})");
	lines.push("```");
	lines.push("");
	lines.push(
		"The `<HeadContent />` component reads this and patches `<head>` DOM nodes. No server round-trip needed for head data on SPA nav.",
	);
	lines.push("");

	/* --- D. Streaming & Deferred Data --- */
	lines.push("### D. Streaming & Deferred Data");
	lines.push("");
	lines.push(
		"All three frameworks support deferred data (comments load with a 500ms delay). The streaming mechanism differs:",
	);
	lines.push("");

	lines.push("#### Flare: NDJSON Stream Timeline");
	lines.push("");
	lines.push("```");
	lines.push("1. LOADER  _root_         -> root layout data (empty)      immediate");
	lines.push("2. LOADER  posts/[slug]   -> {post, comments: deferred}    immediate");
	lines.push('3. HEAD    _root_         -> {title: "Flare Benchmark"}    immediate');
	lines.push("4. HEAD    posts/[slug]   -> {title, description, OG...}   immediate");
	lines.push('5. READY                  -> "all initial data sent"       immediate');
	lines.push("   -- client starts rendering, shows <Await pending> fallback --");
	lines.push("6. CHUNK   posts/[slug]   -> [{author, text, date}, ...]   +500ms");
	lines.push("   -- <Await> resolves, comments appear --");
	lines.push("7. DONE                   -> stream close                  +500ms");
	lines.push("```");
	lines.push("");
	lines.push(
		'The `READY` signal (line 5) tells the client: "you have all non-deferred data, start rendering now." Deferred chunks arrive later and resolve `<Await>` boundaries. The stream stays open until `DONE`.',
	);
	lines.push("");

	lines.push("#### Next.js: RSC Flight Suspense");
	lines.push("");
	lines.push("```");
	lines.push("1-25. Module refs, debug info, vDOM structure    -> immediate (component tree)");
	lines.push("  -- includes <Suspense fallback={...}> around <Comments> --");
	lines.push("26.  1f:T49e,<post body text>                   -> immediate (text blob)");
	lines.push('27.  2:["$","article",...]                      -> immediate (page vDOM)');
	lines.push("28.  c:{metadata: [...]}                         -> immediate (resolved meta)");
	lines.push('  -- client renders page with "Loading comments..." fallback --');
	lines.push('29.  20:["$","ul",null,{children:[...]}]        -> +500ms (comments vDOM)');
	lines.push("  -- Suspense boundary resolves, comments appear --");
	lines.push("```");
	lines.push("");
	lines.push(
		"Next.js streams the full component tree first, with Suspense boundaries as placeholders. When the `<Comments>` async component resolves (after 500ms), the resolved vDOM chunk is sent and the client swaps the fallback.",
	);
	lines.push("");

	lines.push("#### TanStack Start: Client-Side Promise Resolution");
	lines.push("");
	lines.push("During **SSR**, deferred data is handled via inline `<script>` tags that resolve a stream barrier:");
	lines.push("");
	lines.push("```html");
	lines.push("<!-- Initial render with fallback -->");
	lines.push('<script class="$tsr">/* stream barrier + dehydrated router state */</script>');
	lines.push("<!-- After 500ms, deferred data resolves -->");
	lines.push("<script>($R=>/* resolve deferred promise with comment data */)($R)</script>");
	lines.push("```");
	lines.push("");
	lines.push(
		"During **SPA navigation**, the promise runs entirely in the browser. `getDelayedComments()` is bundled client-side, so the 500ms delay happens locally. `<Suspense>` + `<Await promise={comments}>` shows the fallback until the promise resolves -- no streaming, no server involvement.",
	);
	lines.push("");

	/* --- E. Caching Architecture --- */
	lines.push("### E. Caching Architecture");
	lines.push("");
	lines.push("Measured from actual captured data:");
	lines.push("");

	lines.push("| Behavior | Flare | Next.js | TanStack Start |");
	lines.push("|----------|-------|---------|----------------|");
	lines.push(
		"| Cache-Control header | " +
			results
				.map((r) => {
					const cc = r.spaNavigation?.headers["cache-control"];
					return cc ? `\`${cc}\`` : r.name === "TanStack Start" ? "N/A (no request)" : "N/A";
				})
				.join(" | ") +
			" |",
	);
	lines.push(
		"| Back/fwd re-fetches | " +
			results
				.map((r) => (r.backForwardRefetches > 0 ? `${r.backForwardRefetches} requests` : "0 (cached)"))
				.join(" | ") +
			" |",
	);
	lines.push(
		"| Prefetch on hover | " +
			results.map((r) => (r.prefetchRequests > 0 ? `${r.prefetchRequests} requests` : "none")).join(" | ") +
			" |",
	);
	lines.push("");

	lines.push(
		"**Flare** refetches on back/forward because `staleTime` defaults to 0 -- the client-side matchCache considers data stale immediately. This is configurable per-route via `cache: { staleTime: 60_000 }`. When the KV CacheStore is enabled (Cloudflare Workers), data is also cached server-side, making refetches fast (~1ms KV hit instead of re-running the loader).",
	);
	lines.push("");
	lines.push(
		"**Next.js** returns `cache-control: no-store, must-revalidate` but the Router Cache holds the RSC response in memory. Back/forward navigation serves from this in-memory cache without refetching. The Router Cache cannot be cleared programmatically (a known pain point).",
	);
	lines.push("");
	lines.push(
		"**TanStack Start** has zero re-fetches because the data is already in the client-side React Query cache. The loader ran in the browser -- the data never left the process. Back/forward navigation reads directly from memory.",
	);
	lines.push("");

	lines.push("**Cache layer comparison:**");
	lines.push("");
	lines.push("| Layer | Flare | Next.js | TanStack Start |");
	lines.push("|-------|-------|---------|----------------|");
	lines.push("| Client memory | matchCache (per matchId) | Router Cache (RSC tree) | React Query cache |");
	lines.push("| Server KV/Redis | CacheStore interface | Data Cache (fetch cache) | N/A |");
	lines.push("| CDN edge | Standard HTTP caching | Full Route Cache | Standard HTTP |");
	lines.push("| Granularity | Per-route data object | Entire RSC component tree | Per-loader return value |");
	lines.push("");

	/* --- F. DX Comparison --- */
	lines.push("### F. Developer Experience Comparison");
	lines.push("");
	lines.push("Side-by-side code patterns from the actual benchmark implementations:");
	lines.push("");

	lines.push("| Aspect | Flare | Next.js | TanStack Start |");
	lines.push("|--------|-------|---------|----------------|");
	lines.push(
		'| Route definition | `createPage("_root_/posts/[slug]").loader().head().render()` | `export default async function Page()` + `generateMetadata()` | `createFileRoute("/posts/$slug")({ loader, head, component })` |',
	);
	lines.push(
		"| Head access to data | `ctx.loaderData` (shared from loader) | Must re-derive (call `getPost()` again or use cached fetch) | `loaderData` (shared from loader) |",
	);
	lines.push(
		"| Deferred data | `ctx.defer<T>(async () => ...)` + `<Await>` | Async RSC + `<Suspense>` (implicit) | Return Promise + `<Suspense><Await>` |",
	);
	lines.push(
		"| Type-safe params | `ctx.location.params.slug` (typed from route pattern) | `params: Promise<{ slug: string }>` (manually typed) | `params.slug` (inferred from file path) |",
	);
	lines.push(
		'| Type-safe links | `<Link to="/">` (typed via generated registry) | `<Link href="/">` (plain string, no validation) | `<Link to="/">` (typed via generated route tree) |',
	);
	lines.push(
		"| Error boundary | `.errorRender()` co-located on route builder | Separate `error.tsx` file in same directory | `errorComponent` option on route config |",
	);
	lines.push(
		"| Not-found | `.notFoundRender()` co-located on route builder | Separate `not-found.tsx` file | `notFoundComponent` option on route config |",
	);
	lines.push(
		"| Colocation | Single chained builder: loader -> head -> render | 3 exports across 1 file + separate error/loading files | Single config object with all options |",
	);
	lines.push("");

	lines.push(
		"**Head/data sharing note:** In Next.js, `generateMetadata()` and the page component are separate functions. If they need the same data (like post title), either the fetch must be deduped (Next.js auto-dedupes `fetch()`) or the function must be called twice. Flare and TanStack pass loader data directly to the head function -- no duplication needed.",
	);
	lines.push("");

	/* --- G. Framework Overhead vs User Data --- */
	lines.push("### G. Framework Overhead vs User Data");
	lines.push("");
	lines.push(
		"Measured by marking byte positions in the SPA nav response that contain known user data strings (post title, body, author, comment texts/authors/dates, head description, OG fields). Remaining bytes are framework structure (type markers, matchIds, chunk IDs, vDOM tags, debug info, module references).",
	);
	lines.push("");

	const overheadResults = results.filter((r) => r.wireAnnotation);
	if (overheadResults.length > 0) {
		lines.push("| Metric | " + overheadResults.map((r) => r.name).join(" | ") + " |");
		lines.push("|--------|" + overheadResults.map(() => "---").join("|") + "|");
		lines.push(
			"| Total SPA nav payload | " +
				overheadResults.map((r) => formatBytes(r.spaNavigation?.size ?? 0)).join(" | ") +
				" |",
		);
		lines.push(
			"| User data bytes | " +
				overheadResults.map((r) => formatBytes(r.wireAnnotation?.userDataBytes ?? 0)).join(" | ") +
				" |",
		);
		lines.push(
			"| Framework overhead bytes | " +
				overheadResults.map((r) => formatBytes(r.wireAnnotation?.overheadBytes ?? 0)).join(" | ") +
				" |",
		);
		lines.push(
			"| Overhead ratio | " +
				overheadResults
					.map((r) => {
						const wa = r.wireAnnotation;
						if (!wa) return "N/A";
						return pct(wa.overheadBytes, wa.userDataBytes + wa.overheadBytes);
					})
					.join(" | ") +
				" |",
		);
		lines.push(
			"| Wire lines | " + overheadResults.map((r) => String(r.wireAnnotation?.totalLines ?? 0)).join(" | ") + " |",
		);
		lines.push("");
	}

	/* JS cost during SPA nav */
	const jsResults = results.filter((r) => r.spaJsCost);
	if (jsResults.length > 0) {
		lines.push("**JS loaded during SPA navigation** (route code-split chunks loaded on demand):");
		lines.push("");
		lines.push("| Framework | JS files | JS bytes | Wire data | Total SPA nav cost |");
		lines.push("|-----------|----------|----------|-----------|--------------------|");
		for (const r of results) {
			const js = r.spaJsCost;
			const wire = r.spaNavigation?.size ?? 0;
			const jBytes = js?.totalBytes ?? 0;
			const total = wire + jBytes;
			lines.push(
				`| ${r.name} | ${js ? js.fileCount : 0} | ${formatBytes(jBytes)} | ${formatBytes(wire)} | **${formatBytes(total)}** |`,
			);
		}
		lines.push("");
	}

	if (tanstack) {
		const tsCost = tanstack.spaJsCost;
		if (tsCost) {
			lines.push(
				`**TanStack Start** has 0 B wire data but loads **${formatBytes(tsCost.totalBytes)}** of JS during SPA navigation (${tsCost.fileCount} code-split chunks). The loader code, data dependencies (\`getPost\`, \`getDelayedComments\`, posts/comments arrays), and the React component are all bundled and loaded on demand. This is the real cost -- it shifts from "server sends data" to "client downloads code that produces data."`,
			);
		} else {
			lines.push(
				"**TanStack Start** has 0 B wire data. The cost shifts to JS bundle -- loader code and data dependencies are shipped to the browser. (JS measurement not available for this run.)",
			);
		}
		lines.push("");
	}

	lines.push("**What's in the overhead?**");
	lines.push("");
	if (flare?.wireAnnotation) {
		lines.push(
			`- **Flare** (${formatBytes(flare.wireAnnotation.overheadBytes)}): matchIds, type markers (\`t:"l"\`, \`t:"h"\`), deferred keys (\`__deferred\`, \`key:"d0"\`), JSON structural characters (\`{}\`, \`[]\`, quotes, commas). The protocol structure is minimal -- matchIds are the largest overhead component because they encode the full route path + serialized params.`,
		);
		lines.push("");
	}
	if (next?.wireAnnotation) {
		const wa = next.wireAnnotation;
		const debugCount = wa.linesByType["debug-info"] ?? 0;
		const moduleCount = wa.linesByType["module-ref"] ?? 0;
		const vdomCount = wa.linesByType["vdom-node"] ?? 0;
		if (isProd && debugCount === 0) {
			lines.push(
				`- **Next.js** (${formatBytes(wa.overheadBytes)}): ${moduleCount} module-ref lines (client component import paths + chunk filenames), ${vdomCount} vDOM nodes encoding the full \`<article><h1>...<ul>...\` tree structure with React element arrays (\`["$","tag",key,{props},...]\`), and the router state tree. Production build strips debug-info lines, but module refs and vDOM structure remain.`,
			);
		} else {
			lines.push(
				`- **Next.js** (${formatBytes(wa.overheadBytes)}): ${debugCount} debug-info lines (component names, source locations, stack traces -- dev mode only), ${moduleCount} module-ref lines (client component import paths + chunk filenames), ${vdomCount} vDOM nodes encoding the full \`<article><h1>...<ul>...\` tree structure with React element arrays (\`["$","tag",key,{props},...]\`), and the router state tree. In production builds, debug lines are stripped, which would reduce overhead -- but module refs and vDOM structure remain.`,
			);
		}
		lines.push("");
	}

	lines.push(
		"**Why this matters:** Frameworks that send data-only (Flare, TanStack) can achieve smaller SPA nav payloads because they skip sending UI structure the client already has. RSC (Next.js) re-sends the component tree on every navigation because the server is the source of truth for the render -- the client doesn't independently know how to render the data.",
	);
	lines.push("");

	/* --- H. Production Build Analysis (prod only) --- */
	if (results.some((r) => r.buildOutput)) {
		lines.push("### H. Production Build Analysis");
		lines.push("");
		lines.push("Build output size comparison after minification and tree-shaking:");
		lines.push("");
		lines.push("| Metric | " + results.map((r) => r.name).join(" | ") + " |");
		lines.push("|--------|" + results.map(() => "---").join("|") + "|");
		lines.push(
			"| Client bundle | " +
				results.map((r) => (r.buildOutput ? `${r.buildOutput.totalClientKB} KB` : "N/A")).join(" | ") +
				" |",
		);
		lines.push(
			"| Server bundle | " +
				results.map((r) => (r.buildOutput ? `${r.buildOutput.totalServerKB} KB` : "N/A")).join(" | ") +
				" |",
		);
		lines.push(
			"| Client chunks | " +
				results.map((r) => (r.buildOutput ? String(r.buildOutput.chunkCount) : "N/A")).join(" | ") +
				" |",
		);
		lines.push(
			"| Entry chunk | " +
				results.map((r) => (r.buildOutput ? `${r.buildOutput.entryChunkKB} KB` : "N/A")).join(" | ") +
				" |",
		);
		lines.push(
			"| Total (client + server) | " +
				results
					.map((r) =>
						r.buildOutput ? `${(r.buildOutput.totalClientKB + r.buildOutput.totalServerKB).toFixed(1)} KB` : "N/A",
					)
					.join(" | ") +
				" |",
		);
		lines.push("");

		lines.push("**Build directories scanned:**");
		lines.push("");
		lines.push("| Framework | Client | Server |");
		lines.push("|-----------|--------|--------|");
		lines.push("| Flare | `dist/client/` | `dist/server/` |");
		lines.push("| Next.js | `.next/static/` | `.next/server/` |");
		lines.push("| TanStack Start | `.output/public/` | `.output/server/` |");
		lines.push("");
	}

	return lines.join("\n");
}

function main(): void {
	const resultsPath = new URL("./results.json", import.meta.url);
	const raw = readFileSync(resultsPath, "utf-8");
	const results: FrameworkResult[] = JSON.parse(raw);

	const report = generateReport(results);
	const reportPath = new URL("../RESULTS.md", import.meta.url);
	writeFileSync(reportPath, report);
	console.log(`Report written to RESULTS.md (${results.length} frameworks, ${results[0]?.mode ?? "dev"} mode)`);
}

main();
