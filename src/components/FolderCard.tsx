import { Folder } from "@/lib/types";
import { TaskItem } from "./TaskItem";

interface FolderCardProps {
  folder: Folder;
  isDragged: boolean;
  onDragStart: (e: React.DragEvent, folderId: string) => void;
  onDragEnd: () => void;
  onToggleExpand: (folderId: string) => void;
  onToggleTask: (folderId: string, taskId: string) => void;
  onAddSubtask: (folderId: string, parentTaskId: string, text: string) => void;
}

export function FolderCard({
  folder,
  isDragged,
  onDragStart,
  onDragEnd,
  onToggleExpand,
  onToggleTask,
  onAddSubtask,
}: FolderCardProps) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, folder.id)}
      onDragEnd={onDragEnd}
      className={`bg-[var(--card)] border border-[var(--border)] rounded-lg p-2 cursor-grab active:cursor-grabbing transition-all hover:border-[var(--primary)] ${
        isDragged ? "opacity-50 scale-95" : ""
      }`}
    >
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => onToggleExpand(folder.id)}
      >
        <span>{folder.expanded ? "📂" : "📁"}</span>
        <span className="font-medium text-sm truncate flex-1">{folder.name}</span>
        <span className="text-xs text-[var(--muted-foreground)]">{folder.tasks.length}</span>
      </div>

      {folder.expanded && (
        <div className="mt-2 pt-2 border-t border-[var(--border)]">
          {folder.tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              folderId={folder.id}
              onToggle={onToggleTask}
              onAddSubtask={onAddSubtask}
            />
          ))}
        </div>
      )}
    </div>
  );
}
