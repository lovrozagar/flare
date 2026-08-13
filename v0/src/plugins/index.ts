/**
 * Flare Vite Plugins
 *
 * - flare() - Main plugin for SSR/dev builds (includes client config for Cloudflare plugin)
 * - flareClient() - Standalone client build (legacy, optional)
 * - flareServerFn() - Server function ID injection
 */

export { type StylesTransformOptions, stylesTransform } from "./css-transform"
export { flare } from "./flare"
export { flareClient } from "./flare-client"
export { type FlareServerFnPluginOptions, flareServerFn } from "./server-fn"
export { tailwindTransform } from "./tailwind-transform"
