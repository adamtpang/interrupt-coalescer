"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { splitIntoBatches } from "@/lib/chunker";
import type { Task, Bucket, SortResponse } from "@/lib/types";
import JSZip from "jszip";

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

interface LogEntry {
  id: string;
  type: "info" | "task" | "success" | "error";
  message: string;
  timestamp: Date;
}

type SortMode = "count" | "alpha";
type Tier = "A" | "B" | "C" | null;

interface BucketWithTier extends Bucket {
  tier?: Tier;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [isDragActive, setIsDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, startTime: 0 });
  const [eta, setEta] = useState<string>("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [buckets, setBuckets] = useState<BucketWithTier[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("count");
  const [showFolders, setShowFolders] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Load persisted buckets on mount
  useEffect(() => {
    const saved = localStorage.getItem("interrupt-buckets");
    if (saved) {
      try {
        setBuckets(JSON.parse(saved));
      } catch (e) { }
    }
  }, []);

  // Save buckets to localStorage
  useEffect(() => {
    if (buckets.length > 0) {
      localStorage.setItem("interrupt-buckets", JSON.stringify(buckets));
    }
  }, [buckets]);

  const addLog = (type: LogEntry["type"], message: string) => {
    const entry: LogEntry = { id: generateId(), type, message, timestamp: new Date() };
    setLogs(prev => [...prev, entry]);
    setTimeout(() => {
      logContainerRef.current?.scrollTo({ top: logContainerRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(e.type === "dragenter" || e.type === "dragover");
  }, []);

  const handleFile = async (f: File) => {
    if (!f.name.endsWith(".txt") && !f.name.endsWith(".md")) {
      addLog("error", "Invalid file type. Drop a .txt or .md file.");
      return;
    }
    setFile(f);
    const content = await f.text();
    setFileContent(content);
    const lines = content.split(/\r?\n/).filter(l => l.trim()).length;
    addLog("info", `📄 Loaded "${f.name}" — ${lines} tasks found`);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  }, []);

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const formatEta = (seconds: number): string => {
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  // Process a single batch with retry
  const processBatch = async (
    batch: { lines: string[]; index: number },
    existingBuckets: string[],
    retries: number = 3
  ): Promise<SortResponse> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch("/api/sort", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batch: batch.lines, existingBuckets }),
        });

        if (response.status === 503 && attempt < retries) {
          addLog("info", `⏳ Network timeout, retrying in 5s... (${attempt}/${retries})`);
          await delay(5000);
          continue;
        }

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Processing failed");
        }

        return response.json();
      } catch (err) {
        if (attempt < retries && err instanceof TypeError) {
          addLog("info", `⏳ Connection error, retrying in 5s... (${attempt}/${retries})`);
          await delay(5000);
          continue;
        }
        throw err;
      }
    }
    throw new Error("Max retries exceeded");
  };

  const processFile = async () => {
    if (!fileContent) return;

    // Deduplication
    const existingTasks = new Set<string>();
    buckets.forEach(b => b.tasks.forEach(t => existingTasks.add(t.text.toLowerCase().trim())));

    const allLines = fileContent.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const newLines = allLines.filter(line => !existingTasks.has(line.toLowerCase().trim()));
    const skipped = allLines.length - newLines.length;

    if (skipped > 0) addLog("info", `♻️ Skipped ${skipped} duplicates`);

    if (newLines.length === 0) {
      addLog("success", "✅ All tasks already sorted!");
      setShowFolders(true);
      return;
    }

    const BATCH_SIZE = 30;
    const PARALLEL = 5;

    const batches: { lines: string[]; index: number }[] = [];
    for (let i = 0; i < newLines.length; i += BATCH_SIZE) {
      batches.push({ lines: newLines.slice(i, i + BATCH_SIZE), index: batches.length });
    }

    setIsProcessing(true);
    const startTime = Date.now();
    setProgress({ current: 0, total: batches.length, startTime });
    setLogs([]);

    addLog("info", `🚀 ${newLines.length} tasks → ${batches.length} batches (${PARALLEL}x parallel)`);

    const newBuckets: Map<string, { tasks: Task[]; tier?: Tier }> = new Map();
    buckets.forEach(b => newBuckets.set(b.name, { tasks: [...b.tasks], tier: b.tier }));

    let completed = 0;

    try {
      for (let i = 0; i < batches.length; i += PARALLEL) {
        const group = batches.slice(i, i + PARALLEL);
        const existingBucketNames = Array.from(newBuckets.keys());

        addLog("info", `⏳ Batch ${i + 1}-${Math.min(i + PARALLEL, batches.length)}/${batches.length}`);

        const results = await Promise.all(
          group.map(batch => processBatch(batch, existingBucketNames))
        );

        for (const data of results) {
          for (const item of data.tasks) {
            const task: Task = { id: generateId(), text: item.text, bucket: item.bucket };

            if (!newBuckets.has(item.bucket)) {
              newBuckets.set(item.bucket, { tasks: [], tier: null });
              addLog("success", `📁 New: "${item.bucket}"`);
            }

            newBuckets.get(item.bucket)!.tasks.push(task);
          }
        }

        completed += group.length;
        setProgress({ current: completed, total: batches.length, startTime });

        setBuckets(Array.from(newBuckets.entries()).map(([name, data]) => ({
          name,
          tasks: data.tasks,
          tier: data.tier
        })));

        const elapsed = (Date.now() - startTime) / 1000;
        const perBatch = elapsed / completed;
        const remaining = (batches.length - completed) * perBatch;
        setEta(formatEta(remaining));

        if (i + PARALLEL < batches.length) await delay(500);
      }

      const totalTasks = Array.from(newBuckets.values()).reduce((s, d) => s + d.tasks.length, 0);
      addLog("success", `✅ Done! ${totalTasks} tasks in ${newBuckets.size} folders`);
      setShowFolders(true);
    } catch (err) {
      addLog("error", `❌ ${err instanceof Error ? err.message : "Error"}`);
    } finally {
      setIsProcessing(false);
      setEta("");
    }
  };

  // Set tier for a bucket
  const setTier = (bucketName: string, tier: Tier) => {
    setBuckets(prev => prev.map(b =>
      b.name === bucketName ? { ...b, tier } : b
    ));
  };

  // Download as ZIP
  const downloadZip = async () => {
    const zip = new JSZip();
    const date = new Date().toISOString().split("T")[0];
    const rootFolder = zip.folder(`tasks-${date}`);

    for (const bucket of sortedBuckets) {
      const tierPrefix = bucket.tier ? `[${bucket.tier}] ` : "";
      const folderName = `${tierPrefix}${bucket.name} (${bucket.tasks.length})`;
      const content = bucket.tasks.map(t => `- [ ] ${t.text}`).join("\n");
      rootFolder?.file(`${folderName}.txt`, content);
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tasks-${date}.zip`;
    a.click();
  };

  const clearBuckets = () => {
    setBuckets([]);
    localStorage.removeItem("interrupt-buckets");
    addLog("info", "🗑️ Cleared all buckets");
    setShowFolders(false);
  };

  // Sort buckets: by tier first, then by sortMode
  const sortedBuckets = [...buckets].sort((a, b) => {
    // Tier priority: A > B > C > null
    const tierOrder = { A: 0, B: 1, C: 2, null: 3 };
    const tierDiff = (tierOrder[a.tier ?? null] ?? 3) - (tierOrder[b.tier ?? null] ?? 3);
    if (tierDiff !== 0) return tierDiff;

    if (sortMode === "count") return b.tasks.length - a.tasks.length;
    return a.name.localeCompare(b.name);
  });

  const maxTasks = Math.max(...buckets.map(b => b.tasks.length), 1);
  const tierColors = { A: "text-green-400", B: "text-yellow-400", C: "text-red-400" };

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-3xl mx-auto">
      {/* Header + YouTube */}
      <div className="text-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">🏭 Interrupt Coalescer</h1>
        <p className="text-[var(--muted-foreground)] text-sm mt-1">
          Raw todos → Flow-ready batches
        </p>
        <a href="/deconstructor" className="text-xs text-[var(--primary)] hover:underline mt-2 inline-block">
          ⚛️ Go to Atomic Deconstructor →
        </a>

        {/* YouTube Embed */}
        <div className="mt-4 aspect-video w-full max-w-md mx-auto rounded-lg overflow-hidden">
          <iframe
            className="w-full h-full"
            src="https://www.youtube.com/embed/iDbdXTMnOmE"
            title="Flow State inspiration"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>

      {/* Drop Zone */}
      <div
        className={`drop-zone rounded-xl p-8 md:p-12 text-center cursor-pointer transition-all ${isDragActive ? "active glow-primary" : ""
          } ${file ? "border-[var(--primary)]" : ""}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <div className="text-4xl mb-2">{file ? "📄" : "📁"}</div>
        {file ? (
          <p className="font-mono text-[var(--primary)] text-sm">{file.name}</p>
        ) : (
          <p className="text-sm">Drop .txt or .md</p>
        )}
      </div>

      {/* Progress + ETA */}
      {isProcessing && (
        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
            <span>Processing...</span>
            <span>
              {progress.current}/{progress.total}
              {eta && <span className="ml-2 text-[var(--primary)]">ETA: {eta}</span>}
            </span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <div
          ref={logContainerRef}
          className="mt-4 bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 h-32 overflow-y-auto font-mono text-xs space-y-0.5"
        >
          {logs.map((log) => (
            <div
              key={log.id}
              className={
                log.type === "error" ? "text-red-400" :
                  log.type === "success" ? "text-green-400" :
                    log.type === "task" ? "text-blue-300 opacity-70" :
                      "text-[var(--muted-foreground)]"
              }
            >
              {log.message}
            </div>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-4 flex gap-2 flex-wrap">
        <button
          onClick={processFile}
          disabled={!file || isProcessing}
          className="btn-primary flex-1 min-w-[120px]"
        >
          {isProcessing ? "⏳ Sorting..." : "⚡ Sort"}
        </button>
        {buckets.length > 0 && (
          <>
            <button onClick={() => setShowFolders(!showFolders)} className="btn-secondary">
              {showFolders ? "Hide" : "Show"} Folders ({buckets.length})
            </button>
            <button onClick={downloadZip} className="btn-secondary">📥 ZIP</button>
            <button onClick={clearBuckets} className="btn-secondary text-red-400">🗑️</button>
          </>
        )}
      </div>

      {/* Folders Section */}
      {showFolders && buckets.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">
              📂 Folders ({buckets.reduce((s, b) => s + b.tasks.length, 0)} tasks)
            </h2>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="input-field text-xs py-1"
            >
              <option value="count">By count</option>
              <option value="alpha">A-Z</option>
            </select>
          </div>

          <div className="space-y-2">
            {sortedBuckets.map((bucket) => (
              <div key={bucket.name} className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  {/* Tier buttons */}
                  <div className="flex gap-1">
                    {(["A", "B", "C"] as Tier[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTier(bucket.name, bucket.tier === t ? null : t)}
                        className={`w-6 h-6 text-xs font-bold rounded ${bucket.tier === t
                          ? t === "A" ? "bg-green-500 text-black" :
                            t === "B" ? "bg-yellow-500 text-black" :
                              "bg-red-500 text-white"
                          : "bg-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--border)]/80"
                          }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <h3 className={`font-semibold flex-1 ${tierColors[bucket.tier!] || "text-[var(--foreground)]"}`}>
                    {bucket.name}
                  </h3>
                  <span className="text-xs text-[var(--muted-foreground)]">{bucket.tasks.length}</span>
                </div>

                {/* Visual bar */}
                <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full transition-all ${bucket.tier === "A" ? "bg-green-500" :
                      bucket.tier === "B" ? "bg-yellow-500" :
                        bucket.tier === "C" ? "bg-red-500" :
                          "bg-[var(--primary)]"
                      }`}
                    style={{ width: `${(bucket.tasks.length / maxTasks) * 100}%` }}
                  />
                </div>

                <details>
                  <summary className="text-xs text-[var(--muted-foreground)] cursor-pointer">
                    Show tasks
                  </summary>
                  <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                    {bucket.tasks.map((task) => (
                      <div key={task.id} className="text-xs text-[var(--muted-foreground)] pl-2 border-l border-[var(--border)]">
                        {task.text}
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
