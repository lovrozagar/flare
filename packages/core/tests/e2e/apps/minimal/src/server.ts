import { createServer } from "@lovrozagar/flare/server";
import { echo } from "./fns/echo.ts";
import { router } from "./router.ts";

// Until codegen writes src/_gen/server-fns.gen.ts (bit 12), the app lists its one server function by hand.
export const server = createServer({ router, serverFns: { [echo.id]: async () => echo } });
