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
      <input
        type="number"
        min={0}
        className="border p-2 w-full"
        placeholder="Schedule in minutes (optional)"
        value={scheduleMinutes}
        onChange={(e) => setScheduleMinutes(e.target.value)}
      />
      <button
        type="submit"
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        Publish / Schedule
      </button>
    </form>
  );
}
