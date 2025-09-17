export interface SignalService {
  /**
   * Send a Signal message. If options are omitted, falls back to env
   * SIGNAL_TO / SIGNAL_GROUP_ID, or Note-to-Self on SIGNAL_CLI_NUMBER.
   */
  send: (message: string, options?: { to?: string; groupId?: string }) => Promise<void>;
}


