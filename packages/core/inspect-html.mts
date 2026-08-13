// Create a minimal Vite server and check what transformIndexHtml does with @layer
import { createServer } from "vite"

const server = await createServer({
  plugins: [
    {
      name: "test-css-transform",
      transform(code, id) {
        if (id.endsWith(".css") || id.includes("?inline")) {
          console.log("TRANSFORM called for:", id.slice(-50))
          if (code.includes("@layer reset")) {
            console.log("  @layer reset PRESENT before transform")
          }
        }
        return null
      }
    }
  ],
  server: { port: 4000 }
})

const testHtml = `<!doctype html><html><head>
<style nonce="test">@layer reset {button { background-color: transparent }}</style>
</head><body></body></html>`

console.log("Input HTML:", testHtml.slice(0, 200))

const result = await server.transformIndexHtml("/", testHtml)
console.log("Result HTML:", result.slice(0, 400))
await server.close()
