"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import JSZip from "jszip";
import { get, set, del } from "idb-keyval";

// Types
type Tier = "S" | "A" | "B" | "C" | "D" | "F" | null;

interface Task {
  id: string;
  text: string;
  completed: boolean;
  children: Task[];
}

interface Folder {
  id: string;
  name: string;
  tier: Tier;
  tasks: Task[];
  expanded: boolean;
}

interface SortResponse {
  tasks: { text: string; bucket: string }[];
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

const TIERS: Tier[] = ["S", "A", "B", "C", "D", "F"];
const TIER_COLORS: Record<string, string> = {
  S: "bg-red-500",
  A: "bg-orange-500",
  B: "bg-yellow-500",
  C: "bg-green-500",
  D: "bg-blue-500",
  F: "bg-purple-500",
};

export default function Home() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load from IndexedDB
  useEffect(() => {
    get("flowlist-folders").then((saved) => {
      if (saved) setFolders(saved);
      setIsLoaded(true);
    });
  }, []);

  // Save to IndexedDB
  useEffect(() => {
    if (isLoaded) {
      set("flowlist-folders", folders);
    }
  }, [folders, isLoaded]);

  // File handling
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragActive(e.type === "dragenter" || e.type === "dragover");
    }
  }, []);

  const handleFile = async (f: File) => {
    if (f.name.endsWith(".zip")) {
      const zip = new JSZip();
      const content = await zip.loadAsync(f);
      const newFolders: Folder[] = [];

      const processFile = async (relativePath: string, file: JSZip.JSZipObject) => {
        if (file.dir) return; // Skip directories
        if (relativePath.startsWith("__MACOSX/") || relativePath.includes(".DS_Store")) return; // Skip junk

        const text = await file.async("string");
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

        // Parse tiers from path (e.g., "A/Work.txt" or "Work.txt")
        const parts = relativePath.split("/");
        const fileName = parts[parts.length - 1].replace(/\.(txt|md)$/, "");

        // Check for tier in path or filename prefix
        let tier: Tier = null;
        let cleanName = fileName;

        // Check path (e.g. "A/Folder.txt")
        if (parts.length > 1) {
          const parentDir = parts[parts.length - 2];
          if (["S", "A", "B", "C", "D", "F"].includes(parentDir)) {
            tier = parentDir as Tier;
          }
        }

        // Also check filename prefix (e.g. "[A] Folder.txt") for back-compat
        const tierMatch = fileName.match(/^\[([SABCDF])\]\s*(.+)/);
        if (tierMatch) {
          tier = tierMatch[1] as Tier;
          cleanName = tierMatch[2];
        }

        // Parse checksum/count suffix if present (e.g. "Folder (5)")
        cleanName = cleanName.replace(/\s*\(\d+\)$/, "");

        const tasks: Task[] = [];
        const taskStack: { task: Task; level: number }[] = [];

        lines.forEach(line => {
          const indentMatch = line.match(/^(\s*)/);
          const indent = indentMatch ? indentMatch[1].length : 0;
          const level = Math.floor(indent / 2); // Assume 2 spaces per level

          const cleanLine = line.replace(/^\s*-\s*\[([ xX])\]\s*/, "") // Remove "- [ ]"
            .replace(/^\s*-\s*/, ""); // OR remove just "- "
          const completed = line.includes("[x]") || line.includes("[X]");

          const newTask: Task = {
            id: generateId(),
            text: cleanLine,
            completed,
            children: []
          };

          if (level === 0) {
            tasks.push(newTask);
            taskStack.length = 0; // Reset stack
            taskStack.push({ task: newTask, level: 0 });
          } else {
            // Find parent
            while (taskStack.length > 0 && taskStack[taskStack.length - 1].level >= level) {
              taskStack.pop();
            }
            const parent = taskStack[taskStack.length - 1];
            if (parent) {
              parent.task.children.push(newTask);
              taskStack.push({ task: newTask, level });
            } else {
              // Fallback if indentation is weird
              tasks.push(newTask);
              taskStack.push({ task: newTask, level: 0 });
            }
          }
        });

        if (tasks.length > 0) {
          newFolders.push({
            id: generateId(),
            name: cleanName,
            tier,
            tasks,
            expanded: false
          });
        }
      };

      const promises: Promise<void>[] = [];
      zip.forEach((relativePath, file) => {
        promises.push(processFile(relativePath, file));
      });

      await Promise.all(promises);

      // Update state, merging with existing
      setFolders(prev => {
        const existingMap = new Map(prev.map(f => [f.name, f]));
        newFolders.forEach(f => {
          // If folder exists, overwrite tasks but keep ID? Or just overwrite?
          // Let's overwrite tasks but keep extended props if needed
          existingMap.set(f.name, f);
        });
        return Array.from(existingMap.values());
      });

      return;
    }

    if (!f.name.endsWith(".txt") && !f.name.endsWith(".md")) return;
    const content = await f.text();
    await processContent(content);
  };

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  }, []);

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const processContent = async (content: string) => {
    const existingNames = new Set(folders.map(f => f.name.toLowerCase()));
    const allLines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const newLines = allLines.filter(line => {
      const inExisting = folders.some(f =>
        f.tasks.some(t => t.text.toLowerCase() === line.toLowerCase())
      );
      return !inExisting;
    });

    if (newLines.length === 0) return;

    const BATCH_SIZE = 30;
    const batches: string[][] = [];
    for (let i = 0; i < newLines.length; i += BATCH_SIZE) {
      batches.push(newLines.slice(i, i + BATCH_SIZE));
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: batches.length });

    const newFolders = new Map<string, Task[]>();
    folders.forEach(f => newFolders.set(f.name, [...f.tasks]));

    try {
      for (let i = 0; i < batches.length; i++) {
        const response = await fetch("/api/sort", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batch: batches[i],
            existingBuckets: Array.from(newFolders.keys())
          }),
        });

        if (!response.ok) throw new Error("Processing failed");
        const data: SortResponse = await response.json();

        for (const item of data.tasks) {
          const task: Task = { id: generateId(), text: item.text, completed: false, children: [] };
          if (!newFolders.has(item.bucket)) {
            newFolders.set(item.bucket, []);
          }
          newFolders.get(item.bucket)!.push(task);
        }

        setProgress({ current: i + 1, total: batches.length });
        if (i < batches.length - 1) await delay(300);
      }

      // Merge with existing folders, new ones get tier: null
      const updatedFolders: Folder[] = [];
      const existingFolderMap = new Map(folders.map(f => [f.name, f]));

      newFolders.forEach((tasks, name) => {
        const existing = existingFolderMap.get(name);
        updatedFolders.push({
          id: existing?.id || generateId(),
          name,
          tier: existing?.tier || null,
          tasks,
          expanded: existing?.expanded || false,
        });
      });

      setFolders(updatedFolders);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Drag-drop for tier sorting
  const handleFolderDragStart = (e: React.DragEvent, folderId: string) => {
    setDraggedFolderId(folderId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleFolderDragEnd = () => {
    setDraggedFolderId(null);
  };

  const handleTierDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleTierDrop = (e: React.DragEvent, tier: Tier) => {
    e.preventDefault();
    if (!draggedFolderId) return;

    setFolders(prev => prev.map(f =>
      f.id === draggedFolderId ? { ...f, tier } : f
    ));
    setDraggedFolderId(null);
  };

  // Toggle folder expansion
  const toggleExpand = (folderId: string) => {
    setFolders(prev => prev.map(f =>
      f.id === folderId ? { ...f, expanded: !f.expanded } : f
    ));
  };

  // Toggle task completion
  const toggleTask = (folderId: string, taskId: string) => {
    setFolders(prev => prev.map(f => {
      if (f.id !== folderId) return f;

      const toggleInTree = (tasks: Task[]): Task[] =>
        tasks.map(t => t.id === taskId
          ? { ...t, completed: !t.completed }
          : { ...t, children: toggleInTree(t.children) }
        );

      return { ...f, tasks: toggleInTree(f.tasks) };
    }));
  };

  // Add subtask
  const addSubtask = (folderId: string, parentTaskId: string, text: string) => {
    if (!text.trim()) return;

    setFolders(prev => prev.map(f => {
      if (f.id !== folderId) return f;

      const addToTree = (tasks: Task[]): Task[] =>
        tasks.map(t => t.id === parentTaskId
          ? { ...t, children: [...t.children, { id: generateId(), text, completed: false, children: [] }] }
          : { ...t, children: addToTree(t.children) }
        );

      return { ...f, tasks: addToTree(f.tasks) };
    }));
  };

  // Clear all
  const clearAll = () => {
    setFolders([]);
    localStorage.removeItem("flowlist-folders");
  };

  // Download ZIP
  const downloadZip = async () => {
    const zip = new JSZip();
    const date = new Date().toISOString().split("T")[0];

    TIERS.forEach(tier => {
      // tier is string here ("S", "A", etc) so it's safe
      if (!tier) return;
      const tierFolder = zip.folder(tier);
      folders.filter(f => f.tier === tier).forEach(folder => {
        const content = folder.tasks.map(t => `- [${t.completed ? "x" : " "}] ${t.text}`).join("\n");
        tierFolder?.file(`${folder.name}.txt`, content);
      });
    });

    // Unsorted
    const unsortedFolder = zip.folder("_Unsorted");
    folders.filter(f => f.tier === null).forEach(folder => {
      const content = folder.tasks.map(t => `- [${t.completed ? "x" : " "}] ${t.text}`).join("\n");
      unsortedFolder?.file(`${folder.name}.txt`, content);
    });

    // Generate blob with explicit MIME type
    const blob = await zip.generateAsync({ type: "blob" });
    const zipBlob = new Blob([blob], { type: "application/zip" });
    const url = URL.createObjectURL(zipBlob);

    // Create and trigger download link
    const a = document.createElement("a");
    a.href = url;
    a.download = `flowlist-${date}.zip`;
    document.body.appendChild(a); // Required for some browsers
    a.click();

    // Cleanup
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Render task tree
  const renderTask = (task: Task, folderId: string, depth: number = 0) => (
    <div key={task.id} className={`${depth > 0 ? "ml-4 border-l border-[var(--border)] pl-2" : ""}`}>
      <div className="flex items-center gap-2 py-1 group">
        <input
          type="checkbox"
          checked={task.completed}
          onChange={() => toggleTask(folderId, task.id)}
          className="accent-[var(--primary)]"
        />
        <span className={`flex-1 text-sm ${task.completed ? "line-through opacity-50" : ""}`}>
          {task.text}
        </span>
        {!task.completed && (
          <button
            onClick={() => {
              const text = prompt("Add subtask:");
              if (text) addSubtask(folderId, task.id, text);
            }}
            className="opacity-0 group-hover:opacity-100 text-xs text-[var(--primary)]"
          >
            + sub
          </button>
        )}
      </div>
      {task.children.map(child => renderTask(child, folderId, depth + 1))}
    </div>
  );

  // Render folder card
  const renderFolder = (folder: Folder) => (
    <div
      key={folder.id}
      draggable
      onDragStart={(e) => handleFolderDragStart(e, folder.id)}
      onDragEnd={handleFolderDragEnd}
      className={`bg-[var(--card)] border border-[var(--border)] rounded-lg p-2 cursor-grab active:cursor-grabbing transition-all hover:border-[var(--primary)] ${draggedFolderId === folder.id ? "opacity-50 scale-95" : ""
        }`}
    >
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => toggleExpand(folder.id)}
      >
        <span>{folder.expanded ? "📂" : "📁"}</span>
        <span className="font-medium text-sm truncate flex-1">{folder.name}</span>
        <span className="text-xs text-[var(--muted-foreground)]">{folder.tasks.length}</span>
      </div>

      {folder.expanded && (
        <div className="mt-2 pt-2 border-t border-[var(--border)]">
          {folder.tasks.map(task => renderTask(task, folder.id))}
        </div>
      )}
    </div>
  );

  const unsortedFolders = folders.filter(f => f.tier === null);

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">FlowList</h1>
        <p className="text-[var(--muted-foreground)] text-sm mt-1">Dump → Coalesce → Tier Rank</p>
      </div>

      {/* Drop Zone */}
      <div
        className={`drop-zone rounded-xl p-6 text-center cursor-pointer transition-all mb-6 ${isDragActive ? "active glow-primary" : ""
          }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleFileDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.zip"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <div className="text-3xl mb-1">📄</div>
        <p className="text-sm">Drop .txt, .md to coalesce, or .zip to restore</p>
      </div>

      {/* Progress */}
      {isProcessing && (
        <div className="mb-4">
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          <p className="text-xs text-center mt-1 text-[var(--muted-foreground)]">
            Processing {progress.current}/{progress.total}
          </p>
        </div>
      )}

      {/* Tier Rows */}
      {folders.length > 0 && (
        <div className="space-y-2">
          {TIERS.map(tier => {
            const tierFolders = folders.filter(f => f.tier === tier);
            return (
              <div
                key={tier}
                className="flex gap-2 items-stretch"
                onDragOver={handleTierDragOver}
                onDrop={(e) => handleTierDrop(e, tier)}
              >
                <div className={`${tier ? TIER_COLORS[tier] : ""} w-12 flex items-center justify-center rounded-lg text-white font-bold text-xl`}>
                  {tier}
                </div>
                <div className="flex-1 min-h-[60px] bg-[var(--card)] border border-[var(--border)] rounded-lg p-2 flex flex-wrap gap-2 items-start">
                  {tierFolders.map(renderFolder)}
                  {tierFolders.length === 0 && (
                    <span className="text-xs text-[var(--muted-foreground)] opacity-50 self-center">
                      Drag folders here
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Unsorted */}
          <div
            className="flex gap-2 items-stretch mt-4"
            onDragOver={handleTierDragOver}
            onDrop={(e) => handleTierDrop(e, null)}
          >
            <div className="bg-[var(--muted)] w-12 flex items-center justify-center rounded-lg text-[var(--muted-foreground)] font-bold text-xs">
              ?
            </div>
            <div className="flex-1 min-h-[60px] bg-[var(--card)] border border-dashed border-[var(--border)] rounded-lg p-2 flex flex-wrap gap-2 items-start">
              {unsortedFolders.map(renderFolder)}
              {unsortedFolders.length === 0 && (
                <span className="text-xs text-[var(--muted-foreground)] opacity-50 self-center">
                  Unsorted folders appear here
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {folders.length > 0 && (
        <div className="flex gap-2 mt-6 justify-center">
          <button onClick={downloadZip} className="btn-primary text-sm px-4 py-2">
            📥 Export ZIP
          </button>
          <button onClick={clearAll} className="btn-secondary text-sm px-4 py-2 text-red-400">
            🗑️ Clear All
          </button>
        </div>
      )}
    </main>
  );
}
