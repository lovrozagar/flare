/**
 * Input Validation
 *
 * Runtime validation for route input (params, searchParams).
 * Note: hash is not validated server-side as browsers don't send fragments to servers.
 */

interface ParamsValidator {
	parse?: (raw: Record<string, string | string[]>) => unknown
}

interface SearchParamsValidator {
	parse?: (raw: Record<string, string>) => unknown
}

interface InputConfig {
	params?: ParamsValidator | ((raw: Record<string, string | string[]>) => unknown)
	searchParams?: SearchParamsValidator | ((raw: Record<string, string>) => unknown)
}

interface ValidatedInput<TParams, TSearch> {
	params: TParams
	search: TSearch
}

/**
 * Execute a validator on input
 * Supports: function validators, { parse } method (zod-like), or passthrough
 */
function executeValidator<TRaw, TOut>(
	validator: ((raw: TRaw) => TOut) | { parse?: (raw: TRaw) => TOut } | undefined,
	raw: TRaw | undefined,
): TOut {
	if (!validator) {
		return raw as unknown as TOut
	}

	if (typeof validator === "function") {
		return validator(raw as TRaw)
	}

	if (typeof validator.parse === "function") {
		return validator.parse(raw as TRaw)
	}

	return raw as unknown as TOut
}

/**
 * Convert URLSearchParams to plain object
 */
function searchParamsToObject(searchParams: URLSearchParams): Record<string, string> {
	const result: Record<string, string> = {}
	searchParams.forEach((value, key) => {
		result[key] = value
	})
	return result
}

/**
 * Validate route input against inputConfig validators
 * Returns validated params and search with proper types
 */
function validateInput<
	TParams = Record<string, string | string[]>,
	TSearch = Record<string, string>,
>(
	inputConfig: InputConfig | undefined,
	rawParams: Record<string, string | string[]>,
	rawSearchParams: URLSearchParams,
): ValidatedInput<TParams, TSearch> {
	const params = executeValidator(inputConfig?.params, rawParams) as TParams
	/* Convert URLSearchParams to plain object for zod compatibility */
	const searchObj = searchParamsToObject(rawSearchParams)
	const search = executeValidator(inputConfig?.searchParams, searchObj) as TSearch

	return { params, search }
}

export type { InputConfig, ValidatedInput }
export { validateInput }
