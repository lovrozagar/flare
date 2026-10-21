// The plugin's image widths and quality. `flare({ image })` replaces this module in every environment with the app's
// values (features/image/vite/optimize.ts). These are the defaults `image: {}` gives (dx/plugin.md image).
export const imageWidths: readonly number[] = [640, 750, 828, 1080, 1200, 1920]

export const imageQuality = 75

// Whether the app configured the plugin, which then replaces this module. Without it a string src's widths are its own.
export const imageConfigured = false
