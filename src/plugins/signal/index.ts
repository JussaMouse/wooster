import { DynamicTool } from '@langchain/core/tools';
import { WoosterPlugin, AppConfig, CoreServices, LogLevel } from '../../types/plugin';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

type SignalEnv = {
  cliPath: string;
  number?: string;
  to?: string;
  groupId?: string;
  timeoutMs: number;
};

function readEnv(): SignalEnv {
  const cliPath = process.env.SIGNAL_CLI_PATH || '/opt/homebrew/bin/signal-cli';
  const number = process.env.SIGNAL_CLI_NUMBER;
  const to = process.env.SIGNAL_TO;
  const groupId = process.env.SIGNAL_GROUP_ID;
  const timeoutMs = Number(process.env.SIGNAL_CLI_TIMEOUT_MS || '20000');
  return { cliPath, number, to, groupId, timeoutMs };
}

export async function sendSignalMessage(env: SignalEnv, message: string): Promise<string> {
  if (!env.number) throw new Error('SIGNAL_CLI_NUMBER not configured');
  const args: string[] = ['-u', env.number, 'send'];
  if (env.groupId) {
    args.push('-g', env.groupId, '-m', message);
  } else if (env.to) {
    args.push('-m', message, env.to);
  } else {
    // Fallback to Note-to-Self if no recipient specified
    args.push('-m', message, env.number);
  }
  const { stdout } = await execFileAsync(env.cliPath, args, { timeout: env.timeoutMs, maxBuffer: 2 * 1024 * 1024 });
  return (stdout || '').toString();
}

export class SignalPlugin implements WoosterPlugin {
  static readonly pluginName = 'signal';
  static readonly version = '0.1.0';
  static readonly description = 'Send announcements via Signal (signal-cli).';

  readonly name = SignalPlugin.pluginName;
  readonly version = SignalPlugin.version;
  readonly description = SignalPlugin.description;

  private services!: CoreServices;
  private env!: SignalEnv;

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    this.services = services;
    this.env = readEnv();
    services.log(LogLevel.INFO, `Signal plugin initialized. Using signal-cli at ${this.env.cliPath}`);
  }

  getAgentTools(): DynamicTool[] {
    const notify = new DynamicTool({
      name: 'signal_notify',
      description: 'Send an announcement via Signal. Input can be a plain string, or JSON {"message":"..."}. Uses SIGNAL_CLI_NUMBER and either SIGNAL_TO or SIGNAL_GROUP_ID from env.',
      func: async (input: string) => {
        const chunks = chunkMessage(normalizeInput(input), 3500);
        let count = 0;
        for (const c of chunks) {
          try {
            await sendSignalMessage(this.env, c);
            count++;
          } catch (err: any) {
            this.services.log(LogLevel.ERROR, 'signal_notify failed', { error: err?.message || String(err) });
            return `Signal send failed after ${count} part(s): ${err?.message || String(err)}`;
          }
        }
        return `Signal sent (${count} part${count === 1 ? '' : 's'}).`;
      },
    });
    return [notify];
  }
}

function normalizeInput(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) return '';
  try {
    const obj = JSON.parse(trimmed);
    if (obj && typeof obj === 'object' && typeof obj.message === 'string') {
      return obj.message;
    }
  } catch {
    // not JSON; treat as text
  }
  return trimmed;
}

function chunkMessage(text: string, maxLen: number): string[] {
  if (!text) return [''];
  if (text.length <= maxLen) return [text];
  const parts: string[] = [];
  let i = 0;
  while (i < text.length) {
    parts.push(text.slice(i, i + maxLen));
    i += maxLen;
  }
  return parts;
}

export default SignalPlugin;


