import axios from "axios";

export default async function PostPage({
  params,
}: {
  params: { slug: string };
}) {
  const { data: post } = await axios.get(
    `${process.env.SITE_URL}/api/posts/${params.slug}`
  );

  return (
    <article className="prose prose-zinc max-w-none">
      <div className="mb-4">
        <Link href="/posts" className="text-sm hover:underline">
          ← Back to posts
        </Link>
      </div>
      <h1 className="mb-2">{post.title}</h1>
      {post.publishedAt && (
        <div className="text-sm text-gray-500 dark:text-zinc-400 mb-6">
          {new Date(post.publishedAt).toLocaleString()}
        </div>
      )}
      <div className="rounded-md border bg-white p-6 dark:bg-zinc-900 dark:border-zinc-800">
        <div dangerouslySetInnerHTML={{ __html: post.html }} />
      </div>
    </article>
  );
}
