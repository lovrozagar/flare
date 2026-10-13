import { isHttpsOrigin, isHttpsUrl, JSON_TYPE, send, type SubmitResult } from "./request.ts";

export type BingIndexingOptions = {
	apiKey: string;
	siteUrl: string;
	urls: readonly string[];
};

const ENDPOINT = "https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch";

function checked(options: BingIndexingOptions): void {
	if (options.apiKey === "") throw new Error("bingIndexing needs an apiKey");
	if (!isHttpsOrigin(options.siteUrl)) throw new Error("bingIndexing siteUrl must be an https origin");
	if (options.urls.length === 0) throw new Error("bingIndexing needs at least one url");
	for (const url of options.urls) {
		if (!isHttpsUrl(url)) throw new Error(`bingIndexing url ${url} is not an absolute https url`);
	}
}

// One Bing URL batch (dx/seo.md). The key rides only the `apikey` query param. A failed request is `{ ok: false }`.
export async function bingIndexing(options: BingIndexingOptions): Promise<SubmitResult> {
	checked(options);
	return send("Bing", `${ENDPOINT}?apikey=${encodeURIComponent(options.apiKey)}`, {
		method: "POST",
		headers: { "content-type": JSON_TYPE },
		body: JSON.stringify({ siteUrl: options.siteUrl, urlList: options.urls }),
	});
}
