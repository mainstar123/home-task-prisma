import axios from "axios";

export default async function PostPage({ params }: { params: { slug: string } }) {
    const { data: post } = await axios.get(`${process.env.NEXT_PUBLIC_BASE_URL}/api/posts/${params.slug}`);
  
    return (
      <article className="prose p-6">
        <h1>{post.title}</h1>
        <div dangerouslySetInnerHTML={{ __html: post.html }} />
      </article>
    );
  }