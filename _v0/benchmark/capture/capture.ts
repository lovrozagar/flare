import { chromium, type Response as PwResponse } from "@playwright/test";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { comments, getPost, headForPost } from "../shared/data";

const POST_SLUG = "building-web-frameworks";
const POST_PATH = `/posts/${POST_SLUG}`;
const MODE = process.argv[2] === "--prod" ? "prod" : "dev";

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
	mode: string;
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
	interactivity: InteractivityResult | null;
	ttfb: TtfbResult | null;
	gzipSizes: GzipSizes | null;
	buildOutput: BuildOutput | null;
}

const frameworks = [
	{ name: "Flare", port: 4001 },
	{ name: "Next.js", port: 4002 },
	{ name: "TanStack Start", port: 4003 },
];

function isAssetUrl(url: string): boolean {
	if (url.includes("/@") || url.includes("/node_modules/")) return true;
	if (url.includes("__vite") || url.includes("@vite") || url.includes("@react-refresh")) return true;
	if (url.includes("@tanstack-start/styles")) return true;
	if (url.includes("/_next/static/")) return true;
	if (url.includes("?tsr-split=")) return true;
	if (/\.(js|css|ico|png|svg|woff2?|map|tsx?)(\?|$)/.test(url)) return true;
	if (/\/src\//.test(url)) return true;
	return false;
}

function gzipSize(body: string): number {
	return gzipSync(Buffer.from(body)).length;
}

/**
 * Bitmap-based measurement of user data vs framework overhead in a wire payload.
 * Marks byte positions that contain known user-authored strings (post content,
 * comments, head metadata). Everything else is framework structure.
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

/**
 * Parse Flare NDJSON wire format.
 * Line types: l=loader, h=head, r=ready, c=chunk (deferred), d=done
 */
function annotateFlareWire(body: string): WireAnnotation {
	const lines = body.split("\n").filter((l) => l.trim());
	const linesByType: Record<string, number> = {};
	const typeNames: Record<string, string> = {
		c: "chunk",
		d: "done",
		h: "head",
		l: "loader",
		r: "ready",
	};

	for (const line of lines) {
		try {
			const parsed = JSON.parse(line);
			const typeName = typeNames[parsed.t] ?? `unknown(${parsed.t})`;
			linesByType[typeName] = (linesByType[typeName] ?? 0) + 1;
		} catch {
			linesByType["parse-error"] = (linesByType["parse-error"] ?? 0) + 1;
		}
	}

	return { linesByType, totalLines: lines.length, ...computeUserDataBytes(body) };
}

/**
 * Parse Next.js RSC Flight wire format.
 * Line format: <hex_id>:<payload>
 * Payload types: I[...]=module-ref, D"..."=debug, T<len>,<text>=text-blob,
 * [...]= vdom, "..."=string, {...}=object, null=null-resolution
 */
function annotateNextRsc(body: string): WireAnnotation {
	const lines = body.split("\n").filter((l) => l.trim());
	const linesByType: Record<string, number> = {};

	for (const line of lines) {
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

	return { linesByType, totalLines: lines.length, ...computeUserDataBytes(body) };
}

function annotateWire(name: string, body: string | undefined): WireAnnotation | null {
	if (!body) return null;
	if (name === "Flare") return annotateFlareWire(body);
	if (name === "Next.js") return annotateNextRsc(body);
	/* TanStack serverFn: simple JSON or text/stream — count lines */
	return {
		linesByType: {},
		totalLines: body.split("\n").filter((l) => l.trim()).length,
		...computeUserDataBytes(body),
	};
}

/**
 * Measure TTFB: time from fetch() start to response headers received.
 * Runs `runs` times with 1 warm-up request, returns median of measured runs.
 */
async function measureTtfb(url: string, headers?: Record<string, string>, runs = 5): Promise<number> {
	/* warm-up request */
	const warmup = await fetch(url, { headers });
	await warmup.arrayBuffer();

	const times: number[] = [];
	for (let i = 0; i < runs; i++) {
		const start = performance.now();
		const res = await fetch(url, { headers });
		await res.arrayBuffer();
		times.push(performance.now() - start);
	}
	times.sort((a, b) => a - b);
	return times[Math.floor(times.length / 2)];
}

/**
 * Measure TTFB for SSR (full page) and SPA nav (data-only) requests.
 */
async function measureFrameworkTtfb(fw: { name: string; port: number }): Promise<TtfbResult> {
	const baseUrl = `http://localhost:${fw.port}`;
	const pageUrl = `${baseUrl}${POST_PATH}`;

	/* SSR TTFB */
	const ssrMs = await measureTtfb(pageUrl);

	/* SPA nav TTFB */
	let spaMs = 0;
	if (fw.name === "Flare") {
		spaMs = await measureTtfb(pageUrl, { accept: "application/x-ndjson", "flare-data": "1" });
	} else if (fw.name === "Next.js") {
		spaMs = await measureTtfb(pageUrl, {
			"next-router-state-tree": encodeURIComponent(
				JSON.stringify([
					"",
					{
						children: ["posts", { children: [["slug", POST_SLUG, "d"], { children: ["__PAGE__", {}] }] }],
					},
				]),
			),
			"next-url": POST_PATH,
			rsc: "1",
		});
	}
	/* TanStack: no server data request on SPA nav, spaMs stays 0 */

	return { spaMs: Math.round(spaMs * 100) / 100, ssrMs: Math.round(ssrMs * 100) / 100 };
}

/**
 * Recursively sum file sizes in a directory.
 */
function sumDirSize(dir: string): { totalBytes: number; fileCount: number; entryBytes: number } {
	let totalBytes = 0;
	let fileCount = 0;
	let entryBytes = 0;

	try {
		const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isFile()) continue;
			const fullPath = join(entry.parentPath ?? entry.path, entry.name);
			const stat = statSync(fullPath);
			totalBytes += stat.size;
			fileCount++;
			/* detect entry chunks by name patterns */
			if (
				entry.name === "index.mjs" ||
				entry.name === "entry-client.js" ||
				entry.name.startsWith("main-") ||
				entry.name.startsWith("entry-") ||
				(entry.name.endsWith(".js") && entry.name.includes("index"))
			) {
				if (stat.size > entryBytes) entryBytes = stat.size;
			}
		}
	} catch {
		/* dir doesn't exist */
	}

	return { entryBytes, fileCount, totalBytes };
}

/**
 * Analyze build output directories for each framework (prod only).
 */
function analyzeBuildOutput(fwName: string): BuildOutput | null {
	if (MODE !== "prod") return null;

	const root = join(import.meta.dirname, "..");
	let clientDir: string;
	let serverDir: string;

	if (fwName === "Flare") {
		clientDir = join(root, "flare", "dist", "client");
		serverDir = join(root, "flare", "dist", "server");
	} else if (fwName === "Next.js") {
		clientDir = join(root, "nextjs", ".next", "static");
		serverDir = join(root, "nextjs", ".next", "server");
	} else if (fwName === "TanStack Start") {
		clientDir = join(root, "tanstack", ".output", "public");
		serverDir = join(root, "tanstack", ".output", "server");
	} else {
		return null;
	}

	const client = sumDirSize(clientDir);
	const server = sumDirSize(serverDir);

	return {
		chunkCount: client.fileCount,
		entryChunkKB: Math.round((client.entryBytes / 1024) * 10) / 10,
		totalClientKB: Math.round((client.totalBytes / 1024) * 10) / 10,
		totalServerKB: Math.round((server.totalBytes / 1024) * 10) / 10,
	};
}

/**
 * Capture SPA navigation response via direct HTTP request.
 * Each framework expects different headers to serve data-only responses.
 */
async function captureSpaHttp(fw: { name: string; port: number }): Promise<CapturedResponse | null> {
	const baseUrl = `http://localhost:${fw.port}`;
	const url = `${baseUrl}${POST_PATH}`;

	if (fw.name === "Flare") {
		/* Flare: flare-data header triggers NDJSON response */
		const res = await fetch(url, {
			headers: { accept: "application/x-ndjson", "flare-data": "1" },
		});
		const body = await res.text();
		const headers: Record<string, string> = {};
		res.headers.forEach((v, k) => {
			headers[k] = v;
		});
		return {
			body,
			contentType: headers["content-type"] ?? "",
			headers,
			size: body.length,
			status: res.status,
			url,
		};
	}

	if (fw.name === "Next.js") {
		/* Next.js: RSC header triggers Flight response */
		const res = await fetch(url, {
			headers: {
				"next-router-state-tree": encodeURIComponent(
					JSON.stringify([
						"",
						{
							children: ["posts", { children: [["slug", POST_SLUG, "d"], { children: ["__PAGE__", {}] }] }],
						},
					]),
				),
				"next-url": POST_PATH,
				rsc: "1",
			},
		});
		const body = await res.text();
		const headers: Record<string, string> = {};
		res.headers.forEach((v, k) => {
			headers[k] = v;
		});
		return {
			body,
			contentType: headers["content-type"] ?? "",
			headers,
			size: body.length,
			status: res.status,
			url,
		};
	}

	/* TanStack: serverFn responses are captured via browser SPA nav instead */
	return null;
}

/**
 * Capture TanStack serverFn response during browser SPA nav.
 * The serverFn URL is a hashed ID that we can't know in advance,
 * so we intercept /_serverFn/ requests during the actual navigation.
 */
async function captureTanstackServerFn(
	browser: Awaited<ReturnType<typeof chromium.launch>>,
	baseUrl: string,
): Promise<CapturedResponse | null> {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();

	await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
	await page.waitForTimeout(1000);

	let captured: CapturedResponse | null = null;
	const handler = async (response: PwResponse) => {
		const url = response.url();
		if (url.includes("/_serverFn/") && !captured) {
			const body = await response.text().catch(() => "");
			const headers: Record<string, string> = {};
			response.headers();
			for (const [k, v] of Object.entries(response.headers())) {
				headers[k] = v;
			}
			captured = {
				body,
				contentType: headers["content-type"] ?? "",
				headers,
				size: body.length,
				status: response.status(),
				url,
			};
		}
	};
	page.on("response", handler);

	const link = page.locator(`a[href*="${POST_SLUG}"]`).first();
	await link.click();
	await page.waitForURL(`**/${POST_SLUG}*`, { timeout: 10000 }).catch(() => {});
	await page.waitForTimeout(3000);

	page.off("response", handler);
	await ctx.close();
	return captured;
}

/**
 * Measure total JS loaded on initial page load (homepage).
 * Captures framework runtime (React/Solid) + shared modules.
 */
async function captureInitialJs(
	browser: Awaited<ReturnType<typeof chromium.launch>>,
	baseUrl: string,
	fwName: string,
): Promise<InitialJsCost> {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();

	let totalBytes = 0;
	let fileCount = 0;
	const handler = async (response: PwResponse) => {
		const ct = response.headers()["content-type"] ?? "";
		const isJs = ct.includes("javascript") || ct.includes("module");
		if (isJs) {
			const body = await response.body().catch(() => null);
			if (body) {
				totalBytes += body.length;
				fileCount++;
			}
		}
	};
	page.on("response", handler);

	await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
	if (fwName === "Flare") {
		await page.waitForSelector("[data-flare-hydrated]", { timeout: 10000 }).catch(() => {});
	}
	await page.waitForTimeout(2000);

	page.off("response", handler);
	await ctx.close();
	return { fileCount, totalBytes };
}

async function captureFramework(
	browser: Awaited<ReturnType<typeof chromium.launch>>,
	fw: { name: string; port: number },
): Promise<FrameworkResult> {
	const baseUrl = `http://localhost:${fw.port}`;
	const context = await browser.newContext();
	const page = await context.newPage();

	const result: FrameworkResult = {
		backForwardRefetches: 0,
		buildOutput: null,
		gzipSizes: null,
		headAfterNav: { description: null, ogDescription: null, ogTitle: null, title: "" },
		initialJsCost: null,
		interactivity: null,
		mode: MODE,
		name: fw.name,
		port: fw.port,
		prefetchRequests: 0,
		spaJsCost: null,
		spaNavigation: null,
		ssrHtml: { htmlOnly: 0, size: 0, stateSize: 0, url: "" },
		ttfb: null,
		wireAnnotation: null,
	};

	/* --- 1. SSR HTML capture --- */
	console.log(`[${fw.name}] SSR HTML for ${POST_PATH}`);
	const ssrResponse = await page.goto(`${baseUrl}${POST_PATH}`, { waitUntil: "networkidle" });
	let ssrHtmlBody = "";
	if (ssrResponse) {
		ssrHtmlBody = await ssrResponse.text();
		result.ssrHtml.url = ssrResponse.url();
		result.ssrHtml.size = ssrHtmlBody.length;

		let stateSize = 0;

		/* Flare: self.flare={...} */
		const flareState = ssrHtmlBody.match(/<script[^>]*>self\.flare\s*=\s*[\s\S]*?<\/script>/);
		if (flareState) stateSize += flareState[0].length;

		/* Next.js: self.__next_f.push([...]) */
		const nextMatches = ssrHtmlBody.match(/<script>self\.__next_f\.push\([\s\S]*?\)<\/script>/g);
		if (nextMatches) stateSize += nextMatches.reduce((sum, m) => sum + m.length, 0);

		/* TanStack: stream barrier + deferred scripts */
		const tsrBarrier = ssrHtmlBody.match(/<script class="\$tsr"[\s\S]*?<\/script>/);
		if (tsrBarrier) stateSize += tsrBarrier[0].length;
		const tsrDeferred = ssrHtmlBody.match(/<script>\(\$R=>[\s\S]*?<\/script>/g);
		if (tsrDeferred) stateSize += tsrDeferred.reduce((sum, m) => sum + m.length, 0);

		result.ssrHtml.stateSize = stateSize;
		result.ssrHtml.htmlOnly = ssrHtmlBody.length - stateSize;
	}

	/* --- 2. SPA navigation data response via HTTP --- */
	console.log(`[${fw.name}] SPA navigation wire format`);
	result.spaNavigation = await captureSpaHttp(fw);

	/* TanStack: capture serverFn response via browser SPA nav */
	if (fw.name === "TanStack Start" && !result.spaNavigation) {
		console.log(`[${fw.name}] Capturing serverFn response via browser SPA nav`);
		result.spaNavigation = await captureTanstackServerFn(browser, baseUrl);
	}

	if (result.spaNavigation) {
		console.log(`[${fw.name}] -> ${result.spaNavigation.size}B ${result.spaNavigation.contentType}`);
		result.wireAnnotation = annotateWire(fw.name, result.spaNavigation.body);
		if (result.wireAnnotation) {
			console.log(
				`[${fw.name}] Wire: ${result.wireAnnotation.totalLines} lines, ${result.wireAnnotation.userDataBytes}B data / ${result.wireAnnotation.overheadBytes}B overhead`,
			);
		}
	}

	/* --- 3. TTFB measurement --- */
	console.log(`[${fw.name}] TTFB (median of 5 runs, 1 warm-up)`);
	result.ttfb = await measureFrameworkTtfb(fw);
	console.log(`[${fw.name}] TTFB: SSR=${result.ttfb.ssrMs}ms, SPA=${result.ttfb.spaMs}ms`);

	/* --- 4. Gzip sizes --- */
	console.log(`[${fw.name}] Gzip compressed sizes`);
	result.gzipSizes = {
		spaPayload: result.spaNavigation ? gzipSize(result.spaNavigation.body) : null,
		ssrHtml: ssrHtmlBody ? gzipSize(ssrHtmlBody) : 0,
	};
	console.log(`[${fw.name}] Gzip: SSR=${result.gzipSizes.ssrHtml}B, SPA=${result.gzipSizes.spaPayload ?? "N/A"}B`);

	/* --- 5. Build output analysis (prod only) --- */
	result.buildOutput = analyzeBuildOutput(fw.name);
	if (result.buildOutput) {
		console.log(
			`[${fw.name}] Build: client=${result.buildOutput.totalClientKB}KB, server=${result.buildOutput.totalServerKB}KB, chunks=${result.buildOutput.chunkCount}`,
		);
	}

	/* --- 6. Initial page JS (framework runtime) --- */
	console.log(`[${fw.name}] Initial page JS (framework runtime)`);
	result.initialJsCost = await captureInitialJs(browser, baseUrl, fw.name);
	console.log(`[${fw.name}] Initial JS: ${result.initialJsCost.fileCount} files, ${result.initialJsCost.totalBytes}B`);

	/* --- 7. SPA nav JS cost: fresh context that only visited / --- */
	console.log(`[${fw.name}] SPA nav JS cost (fresh context)`);
	{
		const jsCtx = await browser.newContext();
		const jsPage = await jsCtx.newPage();

		await jsPage.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
		if (fw.name === "Flare") {
			await jsPage.waitForSelector("[data-flare-hydrated]", { timeout: 10000 }).catch(() => {});
		}
		await jsPage.waitForTimeout(1000);

		const jsFiles: Array<{ url: string; size: number }> = [];
		const jsHandler = async (response: PwResponse) => {
			const url = response.url();
			const ct = response.headers()["content-type"] ?? "";
			const isJs = ct.includes("javascript") || ct.includes("module") || /\.(js|mjs|tsx?)(\?|$)/.test(url);
			if (isJs && !url.includes("@vite/client") && !url.includes("__vite")) {
				const body = await response.body().catch(() => null);
				if (body) jsFiles.push({ size: body.length, url });
			}
		};
		jsPage.on("response", jsHandler);

		const jsLink = jsPage.locator(`a[href*="${POST_SLUG}"]`).first();
		await jsLink.click();
		await jsPage.waitForURL(`**/${POST_SLUG}*`, { timeout: 10000 }).catch(() => {});
		await jsPage.waitForTimeout(2000);

		jsPage.off("response", jsHandler);
		if (jsFiles.length > 0) {
			const totalBytes = jsFiles.reduce((sum, f) => sum + f.size, 0);
			result.spaJsCost = { fileCount: jsFiles.length, files: jsFiles, totalBytes };
			console.log(`[${fw.name}] SPA nav JS: ${jsFiles.length} files, ${totalBytes}B`);
		} else {
			console.log(`[${fw.name}] SPA nav JS: 0 files`);
		}
		await jsCtx.close();
	}

	/* --- 8. Head tags after SPA nav --- */
	console.log(`[${fw.name}] Head tags after SPA nav`);
	await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

	if (fw.name === "Flare") {
		await page.waitForSelector("[data-flare-hydrated]", { timeout: 10000 }).catch(() => {});
	}
	await page.waitForTimeout(2000);

	const postLink = page.locator(`a[href*="${POST_SLUG}"]`).first();
	await postLink.click();
	await page.waitForURL(`**/${POST_SLUG}*`, { timeout: 10000 }).catch(() => {});
	await page.waitForTimeout(2000);

	result.headAfterNav.title = await page.title();
	result.headAfterNav.ogTitle = await page.getAttribute('meta[property="og:title"]', "content");
	result.headAfterNav.ogDescription = await page.getAttribute('meta[property="og:description"]', "content");
	result.headAfterNav.description = await page.getAttribute('meta[name="description"]', "content");

	/* --- 9. Interactivity test: click Like button --- */
	console.log(`[${fw.name}] Interactivity test (Like button)`);
	{
		const likeBtn = page.locator('[data-testid="like-button"]');
		const btnExists = (await likeBtn.count()) > 0;
		if (btnExists) {
			/* Wait for hydration -- button must be clickable */
			await likeBtn.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
			const initialText = (await likeBtn.textContent()) ?? "";
			await likeBtn.click();
			await page.waitForTimeout(200);
			const afterClickText = (await likeBtn.textContent()) ?? "";

			/* Extract numbers to verify increment */
			const initialMatch = initialText.match(/\((\d+)\)/);
			const afterMatch = afterClickText.match(/\((\d+)\)/);
			const initialNum = initialMatch ? parseInt(initialMatch[1], 10) : -1;
			const afterNum = afterMatch ? parseInt(afterMatch[1], 10) : -1;

			result.interactivity = {
				afterClickText,
				buttonFound: true,
				initialText,
				worked: afterNum === initialNum + 1,
			};
			console.log(
				`[${fw.name}] Like button: "${initialText}" -> "${afterClickText}" (${result.interactivity.worked ? "OK" : "FAIL"})`,
			);
		} else {
			result.interactivity = {
				afterClickText: "",
				buttonFound: false,
				initialText: "",
				worked: false,
			};
			console.log(`[${fw.name}] Like button not found`);
		}
	}

	/* --- 10. Back/forward refetch detection --- */
	console.log(`[${fw.name}] Back/forward refetch detection`);
	let refetchCount = 0;
	const refetchHandler = (response: PwResponse) => {
		if (!isAssetUrl(response.url())) refetchCount++;
	};
	page.on("response", refetchHandler);

	await page.goBack({ waitUntil: "networkidle" });
	await page.waitForTimeout(500);
	await page.goForward({ waitUntil: "networkidle" });
	await page.waitForTimeout(1000);

	page.off("response", refetchHandler);
	result.backForwardRefetches = refetchCount;

	/* --- 11. Prefetch detection --- */
	console.log(`[${fw.name}] Prefetch on hover`);
	await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
	await page.waitForTimeout(1000);

	let prefetchCount = 0;
	const prefetchHandler = (response: PwResponse) => {
		if (!isAssetUrl(response.url())) prefetchCount++;
	};
	page.on("response", prefetchHandler);

	const hoverLink = page.locator(`a[href*="${POST_SLUG}"]`).first();
	await hoverLink.hover();
	await page.waitForTimeout(3000);

	page.off("response", prefetchHandler);
	result.prefetchRequests = prefetchCount;

	await context.close();
	return result;
}

async function main(): Promise<void> {
	console.log(`Starting framework comparison capture (${MODE} mode)...\n`);

	const browser = await chromium.launch();
	const results: FrameworkResult[] = [];

	for (const fw of frameworks) {
		try {
			const check = await fetch(`http://localhost:${fw.port}/`).catch(() => null);
			if (!check || !check.ok) {
				console.log(`[${fw.name}] Server not responding on port ${fw.port}, skipping`);
				continue;
			}
			const result = await captureFramework(browser, fw);
			results.push(result);
			console.log(`[${fw.name}] Done\n`);
		} catch (err) {
			console.error(`[${fw.name}] Error:`, err);
		}
	}

	await browser.close();

	writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(results, null, 2));
	console.log(`Captured ${results.length} frameworks -> capture/results.json`);
}

main();
