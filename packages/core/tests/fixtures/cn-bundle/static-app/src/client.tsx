import { createClient } from "@lovrozagar/flare/client";
import { router } from "./router";

createClient(() => router);
