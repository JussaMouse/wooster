import ivm from 'isolated-vm';
import { log, LogLevel } from '../logger';
import { getConfig } from '../configLoader';

export interface SandboxResult {
  finalAnswer?: string;
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

    let finalAnswer: string | undefined;
    const stdout: string[] = [];
    const stderr: string[] = [];
    
    const references: ivm.Reference<any>[] = [];

    const finalAnswerRef = new ivm.Reference((text: string) => {
        if (finalAnswer === undefined) {
          finalAnswer = text;
        } else {
          log(LogLevel.WARN, 'finalAnswer called more than once. Subsequent calls are ignored.');
        }
    });
    references.push(finalAnswerRef);
    await jail.set('finalAnswer', finalAnswerRef);
    
    const consoleLogRef = new ivm.Reference((...args: any[]) => stdout.push(args.map(arg => String(arg)).join(' ')));
    references.push(consoleLogRef);
    const consoleErrorRef = new ivm.Reference((...args: any[]) => stderr.push(args.map(arg => String(arg)).join(' ')));
    references.push(consoleErrorRef);
    const consoleRef = new ivm.Reference({
        log: consoleLogRef,
        error: consoleErrorRef
    });
    references.push(consoleRef);
    await jail.set('console', consoleRef);
    
    // Register each tool as a hidden reference and create a callable async shim
    const bootstrapLines: string[] = [];
    for (const [key, value] of Object.entries(toolApi)) {
      if (typeof value === 'function') {
        const refName = `__tool_ref_${key}`;
        const ref = new ivm.Reference(value);
        references.push(ref);
        await jail.set(refName, ref, { reference: true } as any);
        bootstrapLines.push(
          `globalThis.${key} = async (...args) => {
             return await globalThis['${refName}'].apply(undefined, args, { arguments: { copy: true }, result: { promise: true } });
           };`
        );
      }
    }

    try {
      // Install tool shims
      const bootstrapScript = await isolate.compileScript(bootstrapLines.join('\n'));
      await bootstrapScript.run(context, { timeout });

      const wrappedCode = `(async () => { ${code} })();`;
      const script = await isolate.compileScript(wrappedCode);
      await script.run(context, { timeout, promise: true });
      
      return {
        finalAnswer,
        stdout,
        stderr,
      };
    } catch (error: any) {
      log(LogLevel.ERROR, 'Error executing code in sandbox', { error: error.message });
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
