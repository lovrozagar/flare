import { render } from "solid-js/web"
import "./styles.css"
import logo from "./logo.png"

function App() {
	return <img src={(logo as { src: string }).src} class="bg-red-500" alt="" />
}

const root = document.getElementById("app")
if (root) render(() => <App />, root)
