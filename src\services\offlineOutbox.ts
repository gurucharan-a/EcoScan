/**
 * Offline outbox — lightweight demo-grade queue for technician field notes.
 * Notes added while offline are held in localStorage and flushed through the
 * existing store.addLog() path on reconnect. Nothing else is queued, and the
 * core workflow is never altered.
 */

export interface QueuedNote {
  requestId: string;
  authorId: string;
  text: string;
  at: string;
}

const KEY = "servicegrid_outbox_v1";

function read(): QueuedNote[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(q: QueuedNote[]) {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* storage unavailable */ }
}

export function queueNote(n: QueuedNote) {
  write([...read(), n]);
}

export function pendingNotes(): QueuedNote[] {
  return read();
}

export function pendingCount(): number {
  return read().length;
}

/** Flush via the injected addLog (existing store path). Returns flushed count. */
export function flushOutbox(addLog: (requestId: string, authorId: string, text: string) => void): number {
  const q = read();
  if (q.length === 0) return 0;
  let n = 0;
  for (const note of q) {
    try { addLog(note.requestId, note.authorId, `${note.text} (synced offline @ ${new Date(note.at).toLocaleTimeString()})`); n += 1; }
    catch { /* keep remaining queued */ }
  }
  write(read().slice(n));
  return n;
}
