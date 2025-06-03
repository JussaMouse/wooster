export interface CapturedItem {
  id: string; // Unique identifier (e.g., UUID)
  timestamp: string; // YYYY-MM-DD HH:MM:SS, when the item was captured
  text: string; // The actual content of the captured item
}

export interface CaptureService {
  /**
   * Captures a new item and appends it to the inbox.md file.
   * @param text The text content of the item to capture.
   * @returns The captured item object or null if capture failed.
   */
  captureItem(text: string): CapturedItem | null;
  // Future methods: getItem(id: number): CapturedItem | null;
  // Future methods: listItems(status?: CapturedItem['status']): CapturedItem[];
  // Future methods: updateItem(id: number, updates: Partial<CapturedItem>): CapturedItem | null;
  // Future methods: deleteItem(id: number): boolean;
} 