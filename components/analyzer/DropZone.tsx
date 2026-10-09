"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { UPLOAD_LIMITS } from "@/lib/analyze/config";
import { IconFile, IconSpark, IconUpload } from "@/components/analyzer/ui";

interface DropZoneProps {
  onFile: (file: File) => void;
  onSample: () => void;
  error: string | null;
}

export function DropZone({ onFile, onSample, error }: DropZoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);

  // A counter avoids the flicker caused by dragenter/dragleave firing on child elements.
  const enter = (event: DragEvent) => {
    event.preventDefault();
    depth.current += 1;
    setDragging(true);
  };
  const leave = (event: DragEvent) => {
    event.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <label
        htmlFor={inputId}
        onDragEnter={enter}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={leave}
        onDrop={drop}
        className={`group relative block cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed p-8 text-center transition-all duration-300 focus-within:ring-4 focus-within:ring-indigo-500/30 sm:p-12 ${
          dragging
            ? "scale-[1.02] border-fuchsia-500 bg-fuchsia-50/80 shadow-2xl shadow-fuchsia-500/20 dark:bg-fuchsia-500/10"
            : "border-indigo-300/80 bg-white/70 shadow-xl shadow-indigo-500/10 hover:-translate-y-0.5 hover:border-indigo-500 hover:bg-white dark:border-indigo-400/30 dark:bg-white/5 dark:hover:bg-white/10"
        }`}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onFile(file);
          }}
        />
        <div className="pointer-events-none absolute -inset-px -z-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-fuchsia-500/10 opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="relative">
          <div className={`mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/40 ${dragging ? "" : "animate-float"}`}>
            {dragging ? <IconFile className="h-9 w-9" /> : <IconUpload className="h-9 w-9" />}
          </div>
          <p className="mt-6 text-xl font-semibold tracking-tight sm:text-2xl">{dragging ? "Release to analyze" : "Drag & drop your research PDF"}</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            or <span className="font-medium text-indigo-600 underline decoration-indigo-300 underline-offset-4 dark:text-indigo-300">browse your files</span> · PDF up to {UPLOAD_LIMITS.maxBytes / 1024 / 1024} MB
          </p>
        </div>
      </label>

      <div aria-live="polite" className="min-h-6 pt-3 text-center text-sm">
        {error ? (
          <p role="alert" className="animate-pop inline-block rounded-lg bg-rose-50 px-3 py-1.5 font-medium text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30">
            {error}
          </p>
        ) : null}
      </div>

      <div className="mt-1 flex items-center justify-center gap-3 text-sm text-slate-500 dark:text-slate-400">
        <span className="h-px w-10 bg-slate-300 dark:bg-white/10" />
        no paper handy?
        <span className="h-px w-10 bg-slate-300 dark:bg-white/10" />
      </div>
      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={onSample}
          className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-5 py-2 text-sm font-medium text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/30 dark:border-indigo-400/30 dark:bg-white/5 dark:text-indigo-200"
        >
          <IconSpark className="h-4 w-4" /> Try a sample paper
        </button>
      </div>
    </div>
  );
}
