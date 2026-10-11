import { createServer } from "@lovrozagar/flare/server";
import { loader } from "./routes/_root_/home.page.tsx";
import { router } from "./router.ts";

export const server = createServer({ router, page: { id: "_root_", loader } });
