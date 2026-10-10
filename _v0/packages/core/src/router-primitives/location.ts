import type { SearchParams } from "../url/index.ts";
import { parseSearchParams } from "../url/index.ts";
import type { Location } from "./types.ts";

export function buildLocation<
	TParams extends Record<string, string | string[]>,
	TSearch = SearchParams,
	THash = string,
>(
	url: URL,
	params: TParams,
	virtualPath: string,
	variablePath: string,
	search?: TSearch,
	hash?: THash,
): Location<TParams, TSearch, THash> {
	const resolvedSearch = search ?? (parseSearchParams(url.searchParams) as TSearch);
	const resolvedHash = hash ?? (url.hash as THash);

	return {
		hash: resolvedHash,
		params,
		pathname: url.pathname,
		search: resolvedSearch,
		url,
		variablePath,
		virtualPath,
	};
}
