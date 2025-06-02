export interface CapturedItem {
  id?: number;
  description: string;
  status: 'pending' | 'completed' | 'deferred'; // Or more as needed
  createdAt: string;
  updatedAt: string;
  // Future fields: dueDate?: string; priority?: number; category?: string;
}

export interface CaptureService {
  captureItem(description: string): CapturedItem | null;
  // Future methods: getItem(id: number): CapturedItem | null;
  // Future methods: listItems(status?: CapturedItem['status']): CapturedItem[];
  // Future methods: updateItem(id: number, updates: Partial<CapturedItem>): CapturedItem | null;
  // Future methods: deleteItem(id: number): boolean;
} 