"use client";
// Import Excel button: uploads a demand-history file, then polls the training job and shows the result.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function ImportExcelButton() {
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const router = useRouter();
  const [job, setJob] = useState(null);
  const [message, setMessage] = useState("");
  const [problems, setProblems] = useState([]);

  // Stop polling when the component is removed
  useEffect(() => () => clearInterval(timerRef.current), []);

  function stopPolling() {
    clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function poll(jobId) {
    stopPolling();
    timerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/training/status?jobId=${jobId}`, { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        setJob(data);

        if (data.status === "done") {
          stopPolling();
          const s = data.summary;
          setMessage(
            s
              ? `Training finished: ${s.trained} of ${s.items.length} medicines now have a forecast.` +
                  (s.failed ? ` ${s.failed} failed.` : "")
              : "Training finished. Dashboard updated."
          );
          router.refresh(); // reload server data automatically
        }
        if (data.status === "failed") {
          stopPolling();
          setMessage(`Failed: ${data.error ?? "unknown error"}`);
        }
      } catch {
        stopPolling();
        setMessage("Lost connection to the server.");
      }
    }, 2000);
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow choosing the same file again
    if (!file) return;

    setProblems([]);
    setMessage("Uploading...");
    setJob({ status: "uploading", total: 0, processed: 0 });

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        setJob(null);
        setMessage(data.error ?? "Upload failed");
        setProblems(data.problems ?? []);
        return;
      }

      setMessage(`Imported ${data.rows} rows for ${data.medicines} medicines. Training started...`);
      poll(data.jobId);
    } catch {
      setJob(null);
      setMessage("Upload failed: could not reach the server.");
    }
  }

  const pct = job && job.total ? Math.round((job.processed / job.total) * 100) : 0;
  const busy = job?.status === "uploading" || job?.status === "training";

  // Medicines that need attention after training
  const attention =
    job?.status === "done" && job.summary
      ? job.summary.items.filter((x) => !x.trained || x.error || x.gaps > 0)
      : [];

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 6, maxWidth: 420 }}>
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} />
      <button className="btn" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? "Working..." : "Import Excel"}
      </button>

      {job?.status === "training" && (
        <div>
          <div style={{ height: 6, background: "#e5e7eb", borderRadius: 3 }}>
            <div style={{ width: `${pct}%`, height: 6, background: "#16a34a", borderRadius: 3 }} />
          </div>
          <small>
            Training {job.processed} of {job.total} medicines ({pct}%)
          </small>
        </div>
      )}

      {message && <small>{message}</small>}

      {problems.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#b91c1c" }}>
          {problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}

      {attention.length > 0 && (
        <details style={{ fontSize: 12 }}>
          <summary>{attention.length} medicine(s) need attention</summary>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {attention.map((x) => (
              <li key={x.code}>
                {x.code}: {x.days} days
                {!x.trained && !x.error && " (fewer than 120 days, still insufficient_history)"}
                {x.gaps > 0 && `, ${x.gaps} missing days`}
                {x.error && `, error: ${x.error}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}