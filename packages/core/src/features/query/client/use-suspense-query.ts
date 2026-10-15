import { useQuery, type UseQueryResult } from "@tanstack/solid-query"

// TanStack's `useQuery`. Reading `data` while the query is pending suspends, so the surrounding Solid `<Loading>` shows
// its fallback, then the children (B80). Flare adds no second boundary around the hook (dx/features.md Query).
export function useSuspenseQuery<T, K extends readonly unknown[]>(
	options: () => { queryKey: K; queryFn: () => Promise<T> | T; staleTime?: number; enabled?: boolean },
): UseQueryResult<T, Error> {
	return useQuery<T, Error, T, K>(options)
}
