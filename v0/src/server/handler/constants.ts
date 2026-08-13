/**
 * Handler Constants
 *
 * Headers and values used for CSR data requests.
 */

const CSR_HEADERS = {
	DATA_REQUEST: "x-d",
	MATCH_IDS: "x-m",
	NAV_FORMAT: "x-f",
	PREFETCH: "x-p",
} as const

const CSR_HEADER_VALUES = {
	DATA_REQUEST_ENABLED: "1",
} as const

const NAV_FORMAT = {
	HTML: "html",
	NDJSON: "ndjson",
} as const

type NavFormat = (typeof NAV_FORMAT)[keyof typeof NAV_FORMAT]

export type { NavFormat }
export { CSR_HEADER_VALUES, CSR_HEADERS, NAV_FORMAT }
