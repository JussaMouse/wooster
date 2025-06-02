export interface Task {
  id?: number;
  description: string;
  status: 'pending' | 'completed' | 'deferred'; // Or more as needed
  createdAt: string;
  updatedAt: string;
  // Future fields: dueDate?: string; priority?: number; category?: string;
}

export interface TaskCaptureService {
  captureTask(description: string): Task | null;
  // Future methods: getTask(id: number): Task | null;
  // Future methods: listTasks(status?: Task['status']): Task[];
  // Future methods: updateTask(id: number, updates: Partial<Task>): Task | null;
  // Future methods: deleteTask(id: number): boolean;
} 