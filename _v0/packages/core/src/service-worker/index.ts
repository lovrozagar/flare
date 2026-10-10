/**
 * Facts about the current build for the app's own service worker (`src/service-worker.ts`).
 * Flare resolves this module when it bundles the worker; it is not available elsewhere.
 *
 *   import { build, files, version } from "@lovrozagar/flare/service-worker";
 */
export { build, files, version } from "virtual:flare-service-worker";
