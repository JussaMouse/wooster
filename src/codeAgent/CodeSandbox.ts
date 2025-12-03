import ivm from 'isolated-vm';
import { log, LogLevel } from '../logger';
import { getConfig } from '../configLoader';

export interface SandboxResult {
  finalAnswer?: string;
  returnValue?: any; // Captured return value of the script
  error?: string;
  stdout: string[];
  stderr: string[];
}

export class CodeSandbox {
  private readonly stepTimeoutMs: number;
  private readonly totalTimeoutMs: number;
  private readonly memoryLimit: number;

  constructor(stepTimeoutMs: number, totalTimeoutMs: number) {
    this.stepTimeoutMs = stepTimeoutMs;
    this.totalTimeoutMs = totalTimeoutMs;
    this.memoryLimit = getConfig().codeAgent.memoryLimitMb || 128;
  }

  public async run(code: string, toolApi: Record<string, unknown>, timeout: number): Promise<SandboxResult> {
    const isolate = new ivm.Isolate({ memoryLimit: this.memoryLimit });
    const context = await isolate.createContext();
    const jail = context.global;

    await jail.set('global', jail.derefInto());

    const debug = process.env.CODE_AGENT_DEBUG === '1' || process.env.CODE_AGENT_DEBUG === 'true';

    let finalAnswer: string | undefined;
    const stdout: string[] = [];
    const stderr: string[] = [];
    
    const references: ivm.Reference<any>[] = [];

    if (debug) {
      try {
        const toolKeys = Object.keys(toolApi);
        log(LogLevel.DEBUG, '[CODE_AGENT][DEBUG] Tool API keys/types before inject', {
          keys: toolKeys,
          types: toolKeys.reduce((acc: any, k: string) => { acc[k] = typeof (toolApi as any)[k]; return acc; }, {})
        });
      } catch (e) {}
    }

    const finalAnswerRef = new ivm.Reference((text: string) => {
        if (finalAnswer === undefined) {
          finalAnswer = text;
        } else {
          log(LogLevel.WARN, 'finalAnswer called more than once. Subsequent calls are ignored.');
        }
    });
    references.push(finalAnswerRef);
    await jail.set('__tool_ref_finalAnswer', finalAnswerRef);
    
    const consoleLogRef = new ivm.Reference((...args: any[]) => {
      stdout.push(args.map(arg => String(arg)).join(' '));
      try {
        const { log, LogLevel } = require('../logger');
        log(LogLevel.WARN, '[SANDBOX][console.log] %s', stdout[stdout.length - 1]);
      } catch {}
    });
    references.push(consoleLogRef);
    const consoleErrorRef = new ivm.Reference((...args: any[]) => {
      stderr.push(args.map(arg => String(arg)).join(' '));
      try {
        const { log, LogLevel } = require('../logger');
        log(LogLevel.WARN, '[SANDBOX][console.error] %s', stderr[stderr.length - 1]);
      } catch {}
    });
    references.push(consoleErrorRef);
    // Expose console refs under hidden names; shims will call them
    await jail.set('__tool_ref_console_log', consoleLogRef);
    await jail.set('__tool_ref_console_error', consoleErrorRef);
    
    // Register each tool as a hidden reference and create a callable async shim
    const bootstrapLines: string[] = [];
    // Console shims first
    bootstrapLines.push(
      `globalThis.console = {
         log: (...args) => globalThis['__tool_ref_console_log'].apply(undefined, args, { arguments: { copy: true }, result: { copy: true } }),
         error: (...args) => globalThis['__tool_ref_console_error'].apply(undefined, args, { arguments: { copy: true }, result: { copy: true } })
       };`
    );
    // finalAnswer shim
    bootstrapLines.push(
      `globalThis.finalAnswer = (text) => globalThis['__tool_ref_finalAnswer'].apply(undefined, [text], { arguments: { copy: true }, result: { copy: true } });`
    );
    
    for (const [key, value] of Object.entries(toolApi)) {
      if (typeof value === 'function') {
        const refName = `__tool_ref_${key}`;
        const ref = new ivm.Reference(value);
        references.push(ref);
        await jail.set(refName, ref);
        bootstrapLines.push(
          `globalThis.${key} = async (...args) => {
             try {
               return await globalThis['${refName}'].apply(undefined, args, { arguments: { copy: true }, result: { copy: true, promise: true } });
             } catch (err) {
               console.error('[TOOL_ERROR:${key}]', String(err));
               throw err;
             }
           };`
        );
      }
    }

    try {
      // Install tool shims
      const bootstrapSrc = bootstrapLines.join('\n');
      if (debug) {
        log(LogLevel.DEBUG, '[CODE_AGENT][DEBUG] Bootstrap shim code (first 400 chars)', { code: bootstrapSrc.slice(0, 400) });
      }
      if (bootstrapSrc.length) {
        const bootstrapScript = await isolate.compileScript(bootstrapSrc);
        await bootstrapScript.run(context, { timeout });
      }

      if (debug) {
        // Probe the sandbox to confirm tool availability
        const probeSrc = `(() => {
          try {
            const info = {
              typeof_webSearch: typeof webSearch,
              typeof_fetchText: typeof fetchText,
              typeof_queryRAG: typeof queryRAG,
              typeof_schedule: typeof schedule,
              globals: Object.keys(globalThis).filter(k => ['webSearch','fetchText','queryRAG','schedule'].includes(k))
            };
            console.log('[PROBE]', JSON.stringify(info));
          } catch (e) { console.error('[PROBE_ERROR]', String(e)); }
        })();`;
        const probeScript = await isolate.compileScript(probeSrc);
        await probeScript.run(context, { timeout });
      }

      // Heuristic: If code is a single expression/call without explicit return or finalAnswer,
      // prepend 'return ' to the last line to ensure we capture the result.
      // This handles "lazy" agent code like `await viewInboxItems();` which otherwise returns undefined.
      let codeToRun = code;
      if (!code.includes('finalAnswer') && !code.includes('return ')) {
          const lines = code.trim().split('\n');
          if (lines.length > 0) {
              const lastLine = lines[lines.length - 1].trim();
              // Check if last line looks like a function call or await expression
              if (/^(?:await\s+)?[\w\.]+\s*\(/.test(lastLine)) {
                   lines[lines.length - 1] = 'return ' + lines[lines.length - 1];
                   codeToRun = lines.join('\n');
                   if (debug) {
                       log(LogLevel.DEBUG, '[CODE_AGENT] Applied lazy-return heuristic.', { original: lastLine, modified: lines[lines.length - 1] });
                   }
              }
          }
      }

      const wrappedCode = `(async () => { ${codeToRun} })();`;
      if (debug) {
        log(LogLevel.DEBUG, '[CODE_AGENT][DEBUG] Emitted code (first 400 chars)', { code: wrappedCode.slice(0, 400) });
      }
      const script = await isolate.compileScript(wrappedCode);
      const scriptResult = await script.run(context, { timeout, promise: true });
      
      // If scriptResult is a reference (handle), try to copy it out
      let returnValue: any;
      try {
          if (scriptResult && typeof scriptResult === 'object' && 'copy' in scriptResult) {
              returnValue = await scriptResult.copy(); // If it's an ivm.Reference or Transferable
          } else {
              returnValue = scriptResult;
          }
      } catch (e) {
          // If copy fails (e.g. non-transferable), just ignore return value
          log(LogLevel.WARN, '[CodeSandbox] Could not copy return value from sandbox', { error: String(e) });
      }

      return {
        finalAnswer,
        returnValue,
        stdout,
        stderr,
      };
    } catch (error: any) {
      log(LogLevel.ERROR, 'Error executing code in sandbox', { error: error.message, stack: error.stack });
      return {
        error: error.message,
        stdout,
        stderr,
      };
    } finally {
      // Clean up all references
      references.forEach(ref => {
        try { ref.release(); } catch (e) {}
      });

      if (!isolate.isDisposed) {
        isolate.dispose();
      }
    }
  }
}
