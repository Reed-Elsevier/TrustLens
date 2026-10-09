"use client";

import { useState } from "react";
import type { BucketDocument, BucketTask } from "@/lib/analyze/bucketlist";
import type { TaskProposal } from "@/lib/analyze/types";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, EYEBROW, FOCUS_RING } from "@/components/analyzer/ui";

function TaskRow({ task, onChange, onDelete }: { task: BucketTask; onChange: (task: BucketTask) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [action, setAction] = useState(task.action);
  const verification = task.verification;
  return (
    <li className="rounded-lg border border-line bg-canvas p-3">
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={task.completedBy !== null} onChange={(event) => onChange({ ...task, completedBy: event.target.checked ? "manual" : null })} aria-label={`Complete task: ${task.title}`} className={`mt-1 accent-accent ${FOCUS_RING}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${task.completedBy ? "text-muted line-through" : "text-bright"}`}>{task.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{task.action}</p>
          <p className="mt-2 text-xs text-muted">Priority: {task.severity} · {task.completedBy === "manual" ? "Manually completed" : task.completedBy === "automatic" ? "Check resolved automatically" : "Open"} · Source analysis: {task.originAnalysisId}</p>
          {verification ? (
            <div className="mt-2 rounded-md border border-line p-2 text-xs text-ink">
              <p className="font-semibold">{verification.status === "resolved" ? "Resolved: measured check passed" : verification.status === "outstanding" ? "Still outstanding" : "Needs review: cannot verify automatically"}</p>
              <p className="mt-1">Before: {verification.before}</p>
              <p className="mt-1">After: {verification.after}</p>
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2 text-xs">
          <button type="button" onClick={() => { setTitle(task.title); setAction(task.action); setEditing(!editing); }} className={`text-accent ${FOCUS_RING}`}>Edit</button>
          <button type="button" onClick={onDelete} aria-label={`Delete task: ${task.title}`} className={`text-muted hover:text-danger ${FOCUS_RING}`}>Delete</button>
        </div>
      </div>
      {editing ? (
        <form className="mt-3 space-y-2" onSubmit={(event) => {
          event.preventDefault();
          onChange({ ...task, title: title.trim(), action: action.trim(), findingIds: [], completedBy: null, verification: undefined });
          setEditing(false);
        }}>
          <label className="block text-xs text-muted">Task title<input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 block w-full rounded border border-line bg-panel p-2 text-bright" /></label>
          <label className="block text-xs text-muted">Action<textarea required maxLength={600} value={action} onChange={(event) => setAction(event.target.value)} className="mt-1 block w-full rounded border border-line bg-panel p-2 text-bright" /></label>
          <p className="text-xs text-muted">Editing makes this a custom task; automatic verification is removed.</p>
          <button disabled={!title.trim() || !action.trim()} className={BUTTON_SECONDARY}>Save task</button>
        </form>
      ) : null}
    </li>
  );
}

export function BucketListPanel({ document, busy, onRevision, onAdd, onChange, onDelete, onDeleteDocument }: {
  document: BucketDocument;
  busy: boolean;
  onRevision: (file: File) => void;
  onAdd: (proposal: TaskProposal) => boolean;
  onChange: (task: BucketTask) => void;
  onDelete: (id: string) => void;
  onDeleteDocument: () => void;
}) {
  const [custom, setCustom] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const completed = document.tasks.filter((task) => task.completedBy !== null).length;
  return (
    <section aria-label="Bucket list" className="rounded-xl border border-line bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={EYEBROW}>Bucket list</p>
          <h2 className="mt-2 text-lg font-semibold text-bright">{completed}/{document.tasks.length} tasks complete</h2>
          <p className="mt-1 text-xs text-muted">Last analyzed: {document.latest.fileName} · {new Date(document.latest.analyzedAt).toLocaleString()}</p>
        </div>
        <label className={`${BUTTON_PRIMARY} cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
          Upload revised PDF / Re-analyze
          <input type="file" accept=".pdf,application/pdf" disabled={busy} className="sr-only" aria-label="Upload revised PDF" onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onRevision(file);
          }} />
        </label>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">Use the revised PDF of this same paper. Checks compare against its last analysis, not an unrelated upload. Saved only in this browser; no PDF or full manuscript text is saved. Detection can confirm headings or counts, not content quality or proper attribution.</p>
      {document.previous ? <p className="mt-3 text-sm text-ink">Compared {document.previous.fileName} ({document.previous.words.toLocaleString()} words) → {document.latest.fileName} ({document.latest.words.toLocaleString()} words).</p> : null}
      <ul className="mt-4 space-y-3">
        {document.tasks.map((task) => <TaskRow key={task.id} task={task} onChange={onChange} onDelete={() => onDelete(task.id)} />)}
      </ul>
      {!document.tasks.length ? <p className="mt-4 text-sm text-muted">Ask the chatbot how to fix a gap, then confirm a suggested task, or add your own below.</p> : null}
      <form className="mt-4 flex gap-2" onSubmit={(event) => {
        event.preventDefault();
        if (onAdd({ title: custom.trim(), action: custom.trim(), severity: "low", findingIds: [] })) setCustom("");
      }}>
        <label htmlFor="custom-task" className="sr-only">Custom task</label>
        <input id="custom-task" value={custom} onChange={(event) => setCustom(event.target.value)} maxLength={200} placeholder="Add your own task…" className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-bright" />
        <button disabled={busy || !custom.trim()} className={BUTTON_SECONDARY}>Add task</button>
      </form>
      <div className="mt-4 text-xs">
        {confirmDelete ? (
          <div className="flex items-center gap-3"><span className="text-muted">Delete this saved list, comparison history and its cached server analyses? Identical uploads share cached reports.</span><button type="button" disabled={busy} onClick={onDeleteDocument} className={`text-danger ${FOCUS_RING}`}>Confirm delete</button><button type="button" onClick={() => setConfirmDelete(false)} className={`text-muted ${FOCUS_RING}`}>Cancel</button></div>
        ) : <button type="button" onClick={() => setConfirmDelete(true)} className={`text-muted hover:text-danger ${FOCUS_RING}`}>Delete saved list</button>}
      </div>
    </section>
  );
}
