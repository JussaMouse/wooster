import { updateHeartbeat as dbUpdateHeartbeat, getLastHeartbeat as dbGetLastHeartbeat } from './scheduler/reminderRepository';

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let heartbeatIntervalId: NodeJS.Timeout | null = null;

/**
 * Performs a single heartbeat update to the database.
 */
async function performHeartbeat(): Promise<void> {
  try {
    await dbUpdateHeartbeat();
    // console.log(`Heartbeat updated at ${new Date().toISOString()}`); // Optional: for verbose logging
  } catch (error) {
    console.error('Error updating heartbeat:', error);
  }
}

/**
 * Initializes the HeartbeatService:
 * - Performs an initial heartbeat.
 * - Sets up a periodic interval to update the heartbeat.
 */
export async function initHeartbeatService(): Promise<void> {
  console.log('Initializing HeartbeatService...');
  
  // Perform an initial heartbeat immediately
  await performHeartbeat();

  // Clear any existing interval if init is called multiple times (though it shouldn't be)
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
  }

  // Set up the periodic heartbeat
  heartbeatIntervalId = setInterval(performHeartbeat, HEARTBEAT_INTERVAL_MS);
  
  const lastHeartbeat = await dbGetLastHeartbeat();
  console.log(`HeartbeatService initialized. Current heartbeat: ${lastHeartbeat}. Updates will occur every ${HEARTBEAT_INTERVAL_MS / 1000 / 60} minutes.`);
}

/**
 * Stops the periodic heartbeat updates.
 */
export function stopHeartbeatService(): void {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
    console.log('HeartbeatService stopped.');
  }
}

// Ensure the heartbeat is stopped gracefully on application exit
// Note: ReminderRepository already handles db.close() on process.exit
// Here, we just ensure the interval is cleared.
process.on('exit', stopHeartbeatService);
// For SIGHUP, SIGINT, SIGTERM, stopHeartbeatService will be called by process.on('exit')
// if the main exit handlers in reminderRepository and schedulerService lead to process.exit() 