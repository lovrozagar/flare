import { createQueryClientGetter } from "@lovrozagar/flare/query-client";

export const getQueryClient = createQueryClientGetter({
	defaultOptions: {
		queries: { staleTime: 30_000 },
	},
});
