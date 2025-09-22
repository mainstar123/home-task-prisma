"use client";

import { useState } from "react";
import axios from "axios";


export default function NewPostPage() {
  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await axios.post('/api/posts', {title, markdown, slug:title });
    setTitle("");
    setMarkdown("");
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      <input
        className="border p-2 w-full"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="border p-2 w-full h-40"
        placeholder="Write your post in markdown..."
        value={markdown}
        onChange={(e) => setMarkdown(e.target.value)}
      />
      <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
        Publish
      </button>
    </form>
  );
}