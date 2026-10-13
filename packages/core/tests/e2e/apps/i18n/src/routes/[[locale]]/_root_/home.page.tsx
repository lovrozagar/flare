import { createPage, useDirection, useTheme } from "@lovrozagar/flare";
import { createTranslations, useLoaderT, useLocale } from "@lovrozagar/flare/i18n";

const messages = createTranslations({
	en: { hello: "Hello" },
	hr: { hello: "Bok" },
	ar: { hello: "مرحبا" },
});

// A shared page: the loader reads the locale from the path, never the cookie, so the render is the same for every
// visitor of a URL. Each control sets one feature, and each status shows what the hook reports.
export const route = createPage("[[locale]]/_root_/")
	.cache({ ssr: { ttl: "1m" }, cdn: { maxAge: "1m" } })
	.loader(() => ({ message: useLoaderT(messages)("hello") }))
	.render((props) => {
		const theme = useTheme();
		const direction = useDirection();
		const locale = useLocale();
		return (
			<main>
				<h1 id="message">{props.loaderData.message}</h1>
				<p>
					<span id="theme">{theme.theme()}</span> <span id="dir">{direction.direction()}</span>{" "}
					<span id="locale">{locale.locale()}</span>
				</p>
				<button id="light" type="button" onClick={() => theme.setTheme("light")}>
					light
				</button>
				<button id="rtl" type="button" onClick={() => direction.setDirection("rtl")}>
					rtl
				</button>
				<button id="en" type="button" onClick={() => locale.setLocale("en")}>
					en
				</button>
				<button id="hr" type="button" onClick={() => locale.setLocale("hr")}>
					hr
				</button>
				<button id="ar" type="button" onClick={() => locale.setLocale("ar")}>
					ar
				</button>
			</main>
		);
	});
