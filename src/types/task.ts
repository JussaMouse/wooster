export interface TaskItem {
  id: string; // Unique identifier (e.g., generated from rawText hash or line number)
  rawText: string; // The original full line text, e.g., "- [ ] @home Call mom +Family due:2024-07-10 (Captured: 2024-07-09 10:00:00)"
  description: string; // The core task description, e.g., "Call mom"
  isCompleted: boolean; // true if starts with "- [x]", false if "- [ ]"
  context?: string | null; // e.g., "@home", "@work"
  project?: string | null; // e.g., "+Family", "+ProjectAlpha"
  dueDate?: string | null; // e.g., "2024-07-10"
  capturedDate?: string | null; // e.g., "2024-07-09 10:00:00" from "(Captured: ...)"
  completedDate?: string | null; // To be set when a task is marked done
  // Additional metadata from the string can be added here if needed in the future
  additionalMetadata?: string | null; // For anything else captured in parens like "(Delegated: John)" or other notes not part of core fields
} 