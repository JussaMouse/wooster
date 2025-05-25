import { updateHeartbeat, getLastHeartbeat } from './scheduler/reminderRepository';
import { log, LogLevel } from './logger'; // Import logger

const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 1 minute
let heartbeatIntervalId: NodeJS.Timeout | null = null;

/**
 * Performs a single heartbeat update to the database.
 */
async function performHeartbeat(): Promise<void> {
  try {
    await updateHeartbeat();
    log(LogLevel.DEBUG, 'Heartbeat updated successfully.');
    // console.log('[Heartbeat] Heartbeat updated at', new Date().toISOString());
  } catch (error) {
    log(LogLevel.ERROR, 'Error updating heartbeat:', { error });
    // console.error('[Heartbeat] Error updating heartbeat:', error);
  }
}

/**
 * Initializes the HeartbeatService:
 * - Performs an initial heartbeat.
 * - Sets up a periodic interval to update the heartbeat.
 */
export async function initHeartbeatService(): Promise<void> {
  if (heartbeatIntervalId) {
    log(LogLevel.WARN, 'Heartbeat service already initialized.');
    // console.warn('[Heartbeat] Service already initialized.');
    return;
  }
  log(LogLevel.INFO, 'Initializing Heartbeat Service...');
  // console.log('[Heartbeat] Initializing Heartbeat Service...');
  performHeartbeat(); // Perform an initial heartbeat immediately
  heartbeatIntervalId = setInterval(performHeartbeat, HEARTBEAT_INTERVAL_MS);
  log(LogLevel.INFO, `Heartbeat Service initialized. Interval: ${HEARTBEAT_INTERVAL_MS}ms`);
  // console.log(`[Heartbeat] Service initialized. Interval: ${HEARTBEAT_INTERVAL_MS}ms`);
}

/**
 * Stops the periodic heartbeat updates.
 */
export function stopHeartbeatService(): void {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
    log(LogLevel.INFO, 'Heartbeat Service stopped.');
    // console.log('[Heartbeat] Service stopped.');
  } else {
    log(LogLevel.WARN, 'Heartbeat service was not running or already stopped.');
    // console.warn('[Heartbeat] Service was not running or already stopped.');
  }
}

// Ensure the heartbeat is stopped gracefully on application exit
// Note: ReminderRepository already handles db.close() on process.exit
// Here, we just ensure the interval is cleared.
process.on('exit', stopHeartbeatService);
// For SIGHUP, SIGINT, SIGTERM, stopHeartbeatService will be called by process.on('exit')
// if the main exit handlers in reminderRepository and schedulerService lead to process.exit() 

export async function getHeartbeatStatus(): Promise<Date | null> {
  try {
    const lastHeartbeat = await getLastHeartbeat();
    log(LogLevel.DEBUG, 'Fetched last heartbeat time for status.', { lastHeartbeat });
    return lastHeartbeat;
  } catch (error) {
    log(LogLevel.ERROR, 'Error fetching last heartbeat for status:', { error });
    // console.error('[Heartbeat] Error fetching last heartbeat for status:', error);
    return null;
  }
} 