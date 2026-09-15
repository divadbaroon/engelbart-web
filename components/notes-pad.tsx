"use client";

import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";

const STORAGE_KEY = "engelbart.notes";

export function NotesPad() {
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setNotes(localStorage.getItem(STORAGE_KEY) ?? "");
  }, []);

  function update(value: string) {
    setNotes(value);
    localStorage.setItem(STORAGE_KEY, value);
  }

  return (
    <section aria-label="Notes" className="flex h-full">
      <Textarea
        value={notes}
        onChange={(e) => update(e.target.value)}
        placeholder="Start typing…"
        className="h-full min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent px-10 py-8 text-[15px] leading-[1.65] shadow-none focus-visible:ring-0 md:text-[15px]"
      />
    </section>
  );
}
