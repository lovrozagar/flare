/**
 * Every browser→server-fn request goes through here: it carries the page's build id, and a
 * server on another build refuses to run the function (409 + its build id). Then the page
 * reloads so code and server match again, and the call rejects instead of looking successful.
 * Client-safe — must not import server-context or anything that reaches node:*.
 */

import { getBuildId } from "../build-id.ts";
import { BuildMismatchError } from "../errors/index.ts";
import { recoverWithDocumentLoad } from "../navigation/recover.ts";
import { HEADER_BUILD } from "../protocol.ts";

export async function fetchServerFn(url: string, init?: RequestInit): Promise<Response> {
	const clientBuild = getBuildId();
	const headers = new Headers(init?.headers);
	if (clientBuild) headers.set(HEADER_BUILD, clientBuild);
	const res = await fetch(url, { ...init, headers });

	const serverBuild = res.headers.get(HEADER_BUILD);
	if (res.status === 409 && clientBuild && serverBuild && serverBuild !== clientBuild) {
		if (typeof window !== "undefined") recoverWithDocumentLoad(window.location.href, true);
		throw new BuildMismatchError(serverBuild);
	}
	return res;
}
