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
    
    // Pass the entire tool API as a single reference
    const toolApiRef = new ivm.Reference(toolApi);
    await jail.set('_toolApi', toolApiRef);

    // Create shims
    const bootstrapCode = Object.keys(toolApi).map(key => {
      if (typeof toolApi[key] === 'function') {
        return `globalThis.${key} = async (...args) => { return await _toolApi.get('${key}').apply(undefined, args, { result: { promise: true } }); };`;
      }
      return '';
    }).join('\n');
    
    const finalAnswerRef = new ivm.Reference((text: string) => {
        if (finalAnswer === undefined) {
          finalAnswer = text;
        } else {
          log(LogLevel.WARN, 'finalAnswer called more than once. Subsequent calls are ignored.');
        }
    });
    await jail.set('finalAnswer', finalAnswerRef);
    
    const consoleLogRef = new ivm.Reference((...args: any[]) => stdout.push(args.map(arg => String(arg)).join(' ')));
    const consoleErrorRef = new ivm.Reference((...args: any[]) => stderr.push(args.map(arg => String(arg)).join(' ')));
    const consoleRef = new ivm.Reference({
        log: consoleLogRef,
        error: consoleErrorRef
    });
    await jail.set('console', consoleRef);

    try {
      // Run the bootstrap script to define the tool shims
      const bootstrapScript = await isolate.compileScript(bootstrapCode);
      await bootstrapScript.run(context, { timeout });
      
      // Now run the user code
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
      toolApiRef.release();
      finalAnswerRef.release();
      consoleLogRef.release();
      consoleErrorRef.release();
      consoleRef.release();

      if (!isolate.isDisposed) {
        isolate.dispose();
      }
    }
  }
}
