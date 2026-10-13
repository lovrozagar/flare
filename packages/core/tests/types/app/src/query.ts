import { createQueryClientGetter } from "@lovrozagar/flare/query";

// Importing the ./query entry makes codegen set `hasQueryClient`, and a loader's ctx gains `queryClient`.
export const getQueryClient = createQueryClientGetter();
