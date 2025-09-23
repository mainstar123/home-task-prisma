"use client";

import { useState } from "react";
import axios from "axios";

export default function NewPostPage() {
  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [scheduleMinutes, setScheduleMinutes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const minutes = Number(scheduleMinutes);
    const shouldSchedule = Number.isFinite(minutes) && minutes > 0;
    const scheduledAt = shouldSchedule
      ? new Date(Date.now() + minutes * 60_000).toISOString()
      : undefined;

    await axios.post("/api/posts", {
      title,
      markdown,
      slug: title,
      status: shouldSchedule ? "SCHEDULED" : "PUBLISHED",
      ...(scheduledAt ? { scheduledAt } : {}),
    });
    setTitle("");
    setMarkdown("");
    setScheduleMinutes("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm mb-1">Title</label>
        <input
          className="border rounded-md p-2 w-full bg-white dark:bg-zinc-900 dark:border-zinc-800"
          placeholder="Post title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm mb-1">Content (Markdown)</label>
        <textarea
          className="border rounded-md p-2 w-full h-48 bg-white dark:bg-zinc-900 dark:border-zinc-800"
          placeholder="Write your post in markdown..."
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm mb-1">
          Schedule in minutes (optional)
        </label>
        <input
          type="number"
          min={0}
          className="border rounded-md p-2 w-full bg-white dark:bg-zinc-900 dark:border-zinc-800"
          placeholder="e.g. 30"
          value={scheduleMinutes}
          onChange={(e) => setScheduleMinutes(e.target.value)}
        />
      </div>
      <div className="flex gap-3">
        <button
          type="submit"
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Publish / Schedule
        </button>
      </div>
    </form>
  );
}
