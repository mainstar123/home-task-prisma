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
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      <input
        type="email"
        className="border p-2 w-full"
        placeholder="Enter your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button
        type="submit"
        className="bg-green-600 text-white px-4 py-2 rounded"
      >
        Subscribe
      </button>
    </form>
  );
}
