import * as chrono from 'chrono-node';

/**
 * Parses a natural language date/time string into a JavaScript Date object.
 *
 * @param text The natural language string to parse (e.g., "tomorrow at 5pm", "in 2 hours", "next Monday").
 * @param referenceDate Optional. The date from which to interpret relative expressions (defaults to now).
 * @returns A Date object if parsing is successful, otherwise null.
 */
export function parseDateString(text: string, referenceDate?: Date): Date | null {
  const results = chrono.parse(text, referenceDate);

  if (results && results.length > 0) {
    // For simplicity, we take the first result.
    // chrono-node sorts results by likelihood, with the first being the most probable.
    // More sophisticated handling could involve looking at results[0].start and results[0].end
    // or providing options to the user if multiple interpretations are plausible.
    return results[0].start.date();
  }
  return null;
}

/**
 * Attempts to parse a date string and also extracts the reminder text if the input
 * is a full reminder command. This is a common pattern for reminder bots.
 *
 * Example: "remind me to call John in 2 hours"
 *          -> { date: DateObject for "in 2 hours", reminderText: "call John" }
 *
 * Example: "meeting next Tuesday at 3pm"
 *          -> { date: DateObject for "next Tuesday at 3pm", reminderText: "meeting" }
 *
 * Note: This is a basic implementation. More robust parsing might involve NLP techniques.
 *
 * @param fullText The full string potentially containing the reminder and time.
 * @param referenceDate Optional. The date from which to interpret relative expressions.
 * @returns An object containing the parsed Date and the extracted reminder text, or null if no date is found.
 */
export interface ParsedReminder {
  date: Date;
  reminderText: string;
}

export function parseReminderTextAndDate(fullText: string, referenceDate?: Date): ParsedReminder | null {
  const parsedResults = chrono.parse(fullText, referenceDate);

  if (!parsedResults || parsedResults.length === 0) {
    return null; // No date found
  }

  // Use the most likely parsing result
  const bestResult = parsedResults[0];
  const parsedDate = bestResult.start.date();

  // Extract the reminder text. This is a simple approach: 
  // take the text before the part that chrono-node identified as the date.
  // This might need refinement for more complex sentences.
  let reminderText = fullText.substring(0, bestResult.index).trim();

  // If the reminder text is empty, it might be that the date was at the beginning.
  // e.g. "Tomorrow at 10am, pick up laundry"
  // In this case, the text after the date part is the reminder.
  if (!reminderText && bestResult.index + bestResult.text.length < fullText.length) {
      reminderText = fullText.substring(bestResult.index + bestResult.text.length).trim();
      // Remove leading conjunctions like 'to', ',', 'that' if they exist
      reminderText = reminderText.replace(/^to\s+|^,\s*|^that\s+/i, '').trim();
  }
  
  // A common pattern is "remind me to [action] [time]" or "[action] [time]"
  // Try to clean up common prefixes if the reminder text still contains them.
  reminderText = reminderText.replace(/^remind me to\s+/i, '').trim();
  reminderText = reminderText.replace(/^remind me\s+/i, '').trim();
  reminderText = reminderText.replace(/^schedule\s+/i, '').trim(); // If using 'schedule' command

  if (!reminderText) {
    // Fallback if text extraction is difficult, use the original text minus the date string found by chrono.
    // This isn't perfect but can be a reasonable default.
    reminderText = fullText.replace(bestResult.text, '').trim();
    reminderText = reminderText.replace(/^remind me to\s+/i, '').trim();
    reminderText = reminderText.replace(/^remind me\s+/i, '').trim();
    reminderText = reminderText.replace(/^schedule\s+/i, '').trim();
    if (!reminderText) {
        // If still no text, this might be a malformed reminder, or just a date query.
        // For a scheduler, we probably need a reminder text.
        // However, the function could return just the date if reminderText is optional.
        // For now, let's assume reminderText is required for a ParsedReminder.
        return null; 
    }
  }

  return {
    date: parsedDate,
    reminderText: reminderText,
  };
} 