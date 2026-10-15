// Flare's history entry. `index` orders the entries of this document. `usr` is the app's navigate state.
// `intercepted` marks an overlay entry (B84).
export type HistoryState = { index: number; usr?: unknown; intercepted?: true }
