import { createQueryClientGetter } from "@lovrozagar/flare/query";

// One client per document on the client and one per request on the server. A loader reads it as `ctx.queryClient`.
export const getQueryClient = createQueryClientGetter();
