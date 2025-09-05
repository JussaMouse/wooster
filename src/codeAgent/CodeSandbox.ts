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
    
    const refs: ivm.Reference<any>[] = [];

    const finalAnswerRef = new ivm.Reference((text: string) => {
        if (finalAnswer === undefined) {
          finalAnswer = text;
        } else {
          log(LogLevel.WARN, 'finalAnswer called more than once. Subsequent calls are ignored.');
        }
    });
    refs.push(finalAnswerRef);
    await jail.set('finalAnswer', finalAnswerRef);
    
    const consoleLogRef = new ivm.Reference((...args: any[]) => stdout.push(args.map(arg => String(arg)).join(' ')));
    refs.push(consoleLogRef);
    const consoleErrorRef = new ivm.Reference((...args: any[]) => stderr.push(args.map(arg => String(arg)).join(' ')));
    refs.push(consoleErrorRef);
    const consoleRef = new ivm.Reference({
        log: consoleLogRef,
        error: consoleErrorRef
    });
    refs.push(consoleRef);
    await jail.set('console', consoleRef);
    
    for (const key in toolApi) {
      if (typeof toolApi[key] === 'function') {
        const ref = new ivm.Reference(toolApi[key]);
        refs.push(ref);
        await jail.set(key, ref);
      }
    }

    try {
      const wrappedCode = `(async () => { ${code} })();`;
      const script = await isolate.compileScript(wrappedCode);
      await script.run(context, { timeout, promise: true });
      
      return {
        finalAnswer,
        stdout,
        stderr,
      };
    } finally {
      refs.forEach(ref => {
        try {
          ref.dispose();
        } catch (e) {}
      });
      if (!isolate.isDisposed) {
        isolate.dispose();
      }
    }
  }
}
