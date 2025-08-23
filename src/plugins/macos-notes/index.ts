import { DynamicTool } from '@langchain/core/tools';
import { WoosterPlugin, AppConfig, CoreServices, LogLevel } from '../../types/plugin';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const execFileAsync = promisify(execFile);

type ShortcutNames = {
  create: string;
  get: string;
  append: string;
};

async function getConsoleUserAndUid(): Promise<{ username: string; uid: string }> {
  const { execFile: _execFile } = await import('child_process');
  const exec = promisify(_execFile);
  const stat = await exec('/usr/bin/stat', ['-f%Su', '/dev/console']);
  const username = stat.stdout.trim();
  const id = await exec('/usr/bin/id', ['-u', username]);
  const uid = id.stdout.trim();
  return { username, uid };
}

async function runShortcutAsConsoleUser(
  shortcutName: string,
  options: { inputContent?: string; captureTextOutput?: boolean },
  services: CoreServices,
  timeoutMs = 20000
): Promise<string> {
  const { uid } = await getConsoleUserAndUid();
  const args: string[] = ['asuser', uid, '/usr/bin/shortcuts', 'run', shortcutName];
  let tempPath: string | undefined;
  try {
    if (options.inputContent !== undefined) {
      const filename = `wooster-shortcuts-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
      tempPath = path.join(os.tmpdir(), filename);
      await fs.writeFile(tempPath, options.inputContent, { encoding: 'utf8' });
      args.push('--input-path', tempPath);
    }
    if (options.captureTextOutput) {
      args.push('--output-path', '/dev/stdout', '--output-type', 'text');
    }
    const { stdout } = await execFileAsync('/bin/launchctl', args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 });
    return stdout?.toString() ?? '';
  } catch (err: any) {
    services.log(LogLevel.ERROR, 'macOS Notes: shortcuts run failed', { error: err?.message || String(err), args });
    throw new Error(`Shortcuts run failed for "${shortcutName}": ${err?.message || String(err)}`);
  } finally {
    if (tempPath) {
      try { await fs.unlink(tempPath); } catch {}
    }
  }
}

export class MacNotesPlugin implements WoosterPlugin {
  static readonly pluginName = 'macosNotes';
  static readonly version = '0.1.0';
  static readonly description = 'Create, read, and append Apple Notes via Shortcuts CLI.';

  readonly name = MacNotesPlugin.pluginName;
  readonly version = MacNotesPlugin.version;
  readonly description = MacNotesPlugin.description;

  private services!: CoreServices;
  private shortcuts: ShortcutNames = {
    create: 'Wooster Create Note',
    get: 'Wooster Get Note',
    append: 'Wooster Append Note',
  };

  async initialize(config: AppConfig, services: CoreServices): Promise<void> {
    this.services = services;
    if (process.platform !== 'darwin') {
      services.log(LogLevel.INFO, 'macOS Notes plugin loaded on non-macOS platform; tools will be no-ops.');
      return;
    }
    // Allow overriding shortcut names via config if present
    const pluginCfg = (config as any)?.plugins?.macosNotes;
    if (pluginCfg?.shortcutNames) {
      this.shortcuts = { ...this.shortcuts, ...pluginCfg.shortcutNames };
    }
    try {
      // Quick existence check for Shortcuts CLI
      await execFileAsync('/usr/bin/shortcuts', ['list'], { timeout: 5000 });
      services.log(LogLevel.INFO, 'macOS Notes plugin: Shortcuts CLI detected.');
    } catch {
      services.log(LogLevel.WARN, 'macOS Notes plugin: Shortcuts CLI not available or GUI user not active. Tools may fail until configured.');
    }
  }

  getAgentTools(): DynamicTool[] {
    const createNote = new DynamicTool({
      name: 'notes_create',
      description: 'Create a new Apple Note via Shortcuts. Input JSON: {"title":"...","body":"...","folder":"Notes"}. If given a plain string, uses it as body.',
      func: async (input: string) => {
        if (process.platform !== 'darwin') return 'Notes not supported on this platform.';
        let payload = input;
        try {
          // If input is not JSON, wrap as body-only
          JSON.parse(input);
        } catch {
          payload = JSON.stringify({ title: 'From Wooster', body: String(input), folder: 'Notes' });
        }
        const out = await runShortcutAsConsoleUser(this.shortcuts.create, { inputContent: payload }, this.services);
        return out?.trim() || 'Note created.';
      },
    });

    const getNote = new DynamicTool({
      name: 'notes_get',
      description: 'Get the contents of an Apple Note by title via Shortcuts. Input: the exact note title as plain text.',
      func: async (input: string) => {
        if (process.platform !== 'darwin') return 'Notes not supported on this platform.';
        const title = String(input || '').trim();
        if (!title) return 'Please provide a note title.';
        const out = await runShortcutAsConsoleUser(this.shortcuts.get, { inputContent: title, captureTextOutput: true }, this.services);
        return out?.trim() || '';
      },
    });

    const appendNote = new DynamicTool({
      name: 'notes_append',
      description: 'Append to an Apple Note via Shortcuts. Input JSON: {"title":"...","append":"..."}.',
      func: async (input: string) => {
        if (process.platform !== 'darwin') return 'Notes not supported on this platform.';
        let payload: any;
        try {
          payload = JSON.parse(input);
        } catch {
          return 'Input must be JSON: {"title":"...","append":"..."}';
        }
        if (!payload?.title || !payload?.append) return 'Both "title" and "append" are required.';
        const out = await runShortcutAsConsoleUser(this.shortcuts.append, { inputContent: JSON.stringify(payload) }, this.services);
        return out?.trim() || 'Appended to note.';
      },
    });

    return [createNote, getNote, appendNote];
  }
}

export default MacNotesPlugin;


