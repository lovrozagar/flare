import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import {
	COMMENT_DELAY_MS,
	comments,
	getPost,
	headForPost,
	initialLikes,
} from "../../../../shared/data"
import { LikeButton } from "./like-button"

interface PageProps {
	params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
	const { slug } = await params
	const post = getPost(slug)
	if (!post) return { title: "Not Found" }

	const h = headForPost(post)
	return {
		description: h.description,
		openGraph: {
			description: h.openGraph.description,
			title: h.openGraph.title,
			type: "article",
		},
		title: h.title,
	}
}

async function Comments(props: { slug: string }) {
	await new Promise((r) => setTimeout(r, COMMENT_DELAY_MS))
	const postComments = comments[props.slug] ?? []
	return (
		<ul>
			{postComments.map((c, i) => (
				<li>
					<strong>{c.author}</strong> ({c.date}): {c.text}
				</li>
			))}
		</ul>
	)
}

export default async function PostPage(props: PageProps) {
	const { slug } = await props.params
	const post = getPost(slug)
	if (!post) return <div>Post not found</div>

	return (
		<article>
			<h1>{post.title}</h1>
			<p>By {post.author}</p>
			<LikeButton initial={initialLikes[slug] ?? 0} />
			<div>{post.body}</div>

			<h2>Comments</h2>
			<Suspense fallback={<p>Loading comments...</p>}>
				<Comments slug={slug} />
			</Suspense>

			<p>
				<Link href="/">Back to posts</Link>
			</p>
		</article>
	)
}
