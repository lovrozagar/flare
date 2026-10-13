// Whether theme, direction, and locale tell other tabs on `flare.sync`. `flare({ broadcast: false })` replaces this
// module in the client environment with `false`. The server copy stays `true`, and the server has no channel to post
// on (dx/plugin.md).
export const broadcastEnabled = true;
