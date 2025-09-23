import Link from "next/link";
import axios from "axios";

export default async function PostsPage() {
  const { data: posts } = await axios.get(`${process.env.SITE_URL}/api/posts`);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Posts</h1>
      <div className="grid gap-3">
        {posts.map((post: any) => (
          <Link
            key={post.id}
            href={`/posts/${post.slug}`}
            className="block rounded-md border bg-white hover:bg-gray-50 transition-colors px-4 py-3 dark:bg-zinc-900 dark:border-zinc-800 dark:hover:bg-zinc-800"
          >
            <div className="font-medium">{post.title}</div>
            {post.publishedAt && (
              <div className="text-xs text-gray-500 dark:text-zinc-400">
                {new Date(post.publishedAt).toLocaleString()}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
