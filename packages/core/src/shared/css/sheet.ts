// The one built stylesheet, as text for the server's critical CSS and as the URL the document loads it from
// (bits/11). The source is empty: a development document inlines and links nothing, since Vite injects its CSS. A
// server environment's build replaces this module with the client build's stylesheet (vite/css/inject).
export const builtSheet: string = ""
export const builtHref: string = ""
