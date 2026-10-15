import { matchParams, type MatchOptions, type RawParams } from "./match.ts"

// The raw params of a path that matches the pattern, under the options that picked it. A path that does not match is
// a caller bug.
export function readParams(pattern: string, path: string, options: MatchOptions = {}): RawParams {
	const params = matchParams(pattern, path, options)
	if (params === undefined) throw new Error(`${pattern} does not match ${path}`)
	return params
}
