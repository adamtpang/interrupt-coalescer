import { Task } from "@/lib/types";

interface TaskItemProps {
  task: Task;
  folderId: string;
  depth?: number;
  onToggle: (folderId: string, taskId: string) => void;
  onAddSubtask: (folderId: string, parentTaskId: string, text: string) => void;
}

export function TaskItem({ task, folderId, depth = 0, onToggle, onAddSubtask }: TaskItemProps) {
  return (
    <div className={`${depth > 0 ? "ml-4 border-l border-[var(--border)] pl-2" : ""}`}>
      <div className="flex items-center gap-2 py-1 group">
        <input
          type="checkbox"
          checked={task.completed}
          onChange={() => onToggle(folderId, task.id)}
          className="accent-[var(--primary)]"
        />
        <span className={`flex-1 text-sm ${task.completed ? "line-through opacity-50" : ""}`}>
          {task.text}
        </span>
        {!task.completed && (
          <button
            onClick={() => {
              const text = prompt("Add subtask:");
              if (text) onAddSubtask(folderId, task.id, text);
            }}
            className="opacity-0 group-hover:opacity-100 text-xs text-[var(--primary)]"
          >
            + sub
          </button>
        )}
      </div>
      {task.children.map((child) => (
        <TaskItem
          key={child.id}
          task={child}
          folderId={folderId}
          depth={depth + 1}
          onToggle={onToggle}
          onAddSubtask={onAddSubtask}
        />
      ))}
    </div>
  );
}
