/**
 * Browser side of a server fn call: one HTTP request to `/_flare/server-fn/{id}/{name}`.
 * Client-safe — must not import server-context or anything that reaches node:*.
 */

import { serverFnPath } from "../protocol.ts";
import { serverFnGetUrl } from "./get-input.ts";
import { throwServerFnHttpError } from "./http-error.ts";
import { fetchServerFn } from "./transport.ts";

export interface ServerFnTarget {
	id?: string;
	method?: string;
	name: string;
}

export interface ServerFnEnvelope<TOutput> {
	data: TOutput;
	queries?: Array<{ data: unknown; key: unknown[] }>;
	revalidatedTags?: string[];
}

export async function callServerFnOverHttp<TOutput>(
	target: ServerFnTarget,
	input: unknown,
): Promise<ServerFnEnvelope<TOutput>> {
	const url = serverFnPath(target.id ?? target.name, target.name);
	const res =
		target.method === "get"
			? await fetchServerFn(serverFnGetUrl(url, input))
			: await fetchServerFn(url, {
					body: input !== undefined ? JSON.stringify(input) : undefined,
					headers: { "content-type": "application/json" },
					method: "POST",
				});

	if (!res.ok) {
		const body: unknown = await res.json().catch(() => null);
		throwServerFnHttpError(body, res.status, target.name);
	}
	return (await res.json()) as ServerFnEnvelope<TOutput>;
}
