// A wildcard module declaration must sit in a script file, and a reference is how an entry carries one (B88).
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="../features/image/vite/modules.d.ts" preserve="true" />
export { flare } from "../vite/plugin/flare.ts"
