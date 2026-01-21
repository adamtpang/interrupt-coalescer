export type Tier = "S" | "A" | "B" | "C" | "D" | "F" | null;

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  children: Task[];
}

export interface Folder {
  id: string;
  name: string;
  tier: Tier;
  tasks: Task[];
  expanded: boolean;
}

export interface SortResponse {
  tasks: { text: string; bucket: string }[];
}

export const TIERS: Tier[] = ["S", "A", "B", "C", "D", "F"];

export const TIER_COLORS: Record<string, string> = {
  S: "bg-red-500",
  A: "bg-orange-500",
  B: "bg-yellow-500",
  C: "bg-green-500",
  D: "bg-blue-500",
  F: "bg-purple-500",
};