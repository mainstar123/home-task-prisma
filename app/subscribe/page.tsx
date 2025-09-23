"use client";

import { useState } from "react";
import axios from "axios";

export default function SubscribePage() {
  const [email, setEmail] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await axios.post("/api/subscribe", { email });
    setEmail("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm mb-1">Email</label>
        <input
          type="email"
          className="border rounded-md p-2 w-full bg-white dark:bg-zinc-900 dark:border-zinc-800"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <button
        type="submit"
        className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700"
      >
        Subscribe
      </button>
    </form>
  );
}
