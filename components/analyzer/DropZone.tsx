"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { UPLOAD_LIMITS } from "@/lib/analyze/config";
import { BUTTON_SECONDARY, IconFile, IconUpload } from "@/components/analyzer/ui";

interface DropZoneProps {
  onFile: (file: File) => void;
  onSample: () => void;
  error: string | null;
}

export function DropZone({ onFile, onSample, error }: DropZoneProps) {
  const inputId = useId();
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
        className={`group relative block cursor-pointer rounded-xl border border-dashed px-6 py-12 text-center transition-colors focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-canvas sm:py-16 ${
          dragging ? "border-accent bg-accent/[0.06]" : "border-line-strong bg-panel hover:border-accent-deep hover:bg-raised"
        }`}
      >
        <input
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
        <span
          className={`mx-auto grid h-12 w-12 place-items-center rounded-lg border transition-colors ${
            dragging ? "border-accent bg-accent text-canvas" : "border-accent-deep/70 bg-accent/10 text-accent group-hover:border-accent"
          }`}
        >
          {dragging ? <IconFile className="h-6 w-6" /> : <IconUpload className="h-6 w-6" />}
        </span>
        <p className="mt-5 text-lg font-semibold text-bright">{dragging ? "Release to analyze" : "Drop your research PDF here"}</p>
        <p className="mt-1.5 text-sm text-muted">
          or <span className="font-medium text-accent underline decoration-accent-deep underline-offset-4">browse files</span>
        </p>
        <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          PDF · up to {UPLOAD_LIMITS.maxBytes / 1024 / 1024} MB · selectable text
        </p>
      </label>

      <div aria-live="polite" className="min-h-6 pt-3 text-center text-sm">
        {error ? (
          <p role="alert" className="animate-pop inline-block rounded-lg border border-danger/30 bg-danger/10 px-3 py-1.5 font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-center gap-4">
        <span className="h-px w-12 bg-line" />
        <button type="button" onClick={onSample} className={BUTTON_SECONDARY}>
          <IconFile className="h-4 w-4 text-accent" /> Try the sample paper
        </button>
        <span className="h-px w-12 bg-line" />
      </div>
    </div>
  );
}
