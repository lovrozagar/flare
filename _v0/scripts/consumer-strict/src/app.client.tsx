import { createClient } from "@lovrozagar/flare/client";
import { router } from "./app.router";

createClient(() => router);
