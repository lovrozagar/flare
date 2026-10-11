import { createClient } from "@lovrozagar/flare/client";
import { router } from "./router.ts";

export function start(): void {
	createClient(router);
}
