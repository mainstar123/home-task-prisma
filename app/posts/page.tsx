import Link from "next/link";
import axios from "axios";

export default async function PostsPage() {
  const { data: posts } = await axios.get(`${process.env.SITE_URL}/api/posts`);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Posts</h1>
      {posts.map((post: any) => (
        <div key={post.id}>
          <Link href={`/posts/${post.slug}`} className="text-blue-600 underline">
            {post.title}
          </Link>
        </div>
      ))}
    </div>
  );
}
