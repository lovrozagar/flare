import { matchParams, type RawParams } from "./match.ts";

// The raw params of a path that matches the pattern. A path that does not match is a caller bug.
export function readParams(pattern: string, path: string): RawParams {
	const params = matchParams(pattern, path);
	if (params === undefined) throw new Error(`${pattern} does not match ${path}`);
	return params;
}
