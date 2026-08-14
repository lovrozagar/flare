import { createPage } from "flare/page"
import { Image, type ImageLoader } from "flare/image"

const globalLoader: ImageLoader = ({ quality, src, width }) => `/_img/w${width}/q${quality}${src}`

export const route = createPage("_root_/image-test").render(() => (
	<div data-testid="image-test">
		{/* ── Responsive mode ── */}

		{/* Responsive — no loader (passthrough) */}
		<Image
			alt="Responsive basic"
			data-testid="img-responsive-basic"
			maxHeight={400}
			maxWidth={600}
			src="/photos/basic.jpg"
		/>

		{/* Responsive — with loader (width descriptors) */}
		<Image
			alt="Responsive loader"
			data-testid="img-responsive-loader"
			loader={globalLoader}
			maxHeight={400}
			maxWidth={600}
			src="/photos/responsive.jpg"
		/>

		{/* Responsive — aspectRatio instead of maxHeight */}
		<Image
			alt="Responsive aspect"
			aspectRatio={16 / 9}
			data-testid="img-responsive-aspect"
			loader={globalLoader}
			maxWidth={1600}
			src="/photos/aspect.jpg"
		/>

		{/* Responsive — custom sizes override */}
		<Image
			alt="Responsive sizes"
			data-testid="img-responsive-sizes"
			loader={globalLoader}
			maxHeight={400}
			maxWidth={600}
			sizes="(max-width: 768px) 100vw, 50vw"
			src="/photos/sizes.jpg"
		/>

		{/* Responsive — priority */}
		<Image
			alt="Hero banner"
			data-testid="img-priority"
			loader={globalLoader}
			maxHeight={600}
			maxWidth={1200}
			priority
			src="/photos/hero.jpg"
		/>

		{/* ── Fixed mode ── */}

		{/* Fixed — no loader */}
		<Image
			alt="Fixed icon"
			data-testid="img-fixed-basic"
			fixed
			height={48}
			src="/photos/icon.png"
			width={48}
		/>

		{/* Fixed — with loader (density descriptors) */}
		<Image
			alt="Fixed loader"
			data-testid="img-fixed-loader"
			fixed
			height={32}
			loader={globalLoader}
			src="/photos/fixed.png"
			width={32}
		/>

		{/* ── Fill mode ── */}

		{/* Fill — basic */}
		<div
			data-testid="fill-container"
			style={{ "height": "300px", "position": "relative", "width": "400px" }}
		>
			<Image
				alt="Fill image"
				data-testid="img-fill-basic"
				fill
				loader={globalLoader}
				src="/photos/fill.jpg"
			/>
		</div>

		{/* Fill — with aspectRatio */}
		<div style={{ "height": "300px", "position": "relative", "width": "400px" }}>
			<Image
				alt="Fill aspect"
				aspectRatio={16 / 9}
				data-testid="img-fill-aspect"
				fill
				src="/photos/fill-aspect.jpg"
			/>
		</div>

		{/* ── Shared features ── */}

		{/* Per-instance loader override */}
		<Image
			alt="Custom loader"
			data-testid="img-instance-loader"
			loader={({ src, width }) => `/_custom/w${width}${src}`}
			maxHeight={400}
			maxWidth={500}
			src="/photos/custom.jpg"
		/>

		{/* Quality */}
		<Image
			alt="High quality"
			data-testid="img-quality"
			loader={globalLoader}
			maxHeight={400}
			maxWidth={600}
			quality={95}
			src="/photos/quality.jpg"
		/>

		{/* Blur placeholder (responsive) */}
		<Image
			alt="Blurred photo"
			blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg"
			data-testid="img-blur"
			loader={globalLoader}
			maxHeight={400}
			maxWidth={600}
			placeholder="blur"
			src="/photos/blur.jpg"
		/>

		{/* Blur + user style (object) */}
		<Image
			alt="Blur styled"
			blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg"
			data-testid="img-blur-style-obj"
			loader={globalLoader}
			maxHeight={400}
			maxWidth={600}
			placeholder="blur"
			src="/photos/blur-styled.jpg"
			style={{ "border-radius": "8px" }}
		/>

		{/* Blur + user style (string) */}
		<Image
			alt="Blur string styled"
			blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg"
			data-testid="img-blur-style-str"
			loader={globalLoader}
			maxHeight={400}
			maxWidth={600}
			placeholder="blur"
			src="/photos/blur-string.jpg"
			style={{ "border-radius": "12px" }}
		/>

		{/* Rest attrs */}
		<Image
			alt="Accessible photo"
			class="hero-class"
			data-testid="img-attrs"
			id="hero-id"
			maxHeight={400}
			maxWidth={600}
			src="/photos/attrs.jpg"
		/>

		{/* Custom widths */}
		<Image
			alt="Custom widths"
			data-testid="img-custom-widths"
			loader={globalLoader}
			maxHeight={400}
			maxWidth={600}
			sizes="100vw"
			src="/photos/widths.jpg"
			widths={[300, 600, 900]}
		/>

		{/* Product suite alias: width-descriptor srcset */}
		<Image
			alt="Loader srcset"
			data-testid="img-loader-srcset"
			loader={({ quality, src, width }) => `${src}?w=${width}&q=${quality}`}
			maxWidth={800}
			src="/photos/basic.jpg"
			widths={[400, 600, 800]}
		/>
	</div>
))
