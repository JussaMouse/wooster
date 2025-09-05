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

    const toolApiWrapper = new ivm.Reference(toolApi);
    await jail.set('toolApi', toolApiWrapper);
    
    await jail.set('finalAnswer', new ivm.Reference((text: string) => {
        if (finalAnswer === undefined) {
          finalAnswer = text;
        } else {
          log(LogLevel.WARN, 'finalAnswer called more than once. Subsequent calls are ignored.');
        }
    }));
    
    const consoleLog = (...args: any[]) => stdout.push(args.map(arg => String(arg)).join(' '));
    const consoleError = (...args: any[]) => stderr.push(args.map(arg => String(arg)).join(' '));
    
    await jail.set('console', new ivm.Reference({
        log: new ivm.Reference(consoleLog),
        error: new ivm.Reference(consoleError)
    }));
    
    const bootstrap = `
        Object.keys(toolApi).forEach(key => {
            global[key] = (...args) => {
                return toolApi[key].apply(undefined, args, { result: { promise: true } });
            };
        });
    `;

    try {
      const wrappedCode = `(async () => { ${code} })();`;
      const script = await isolate.compileScript(bootstrap + wrappedCode);
      await script.run(context, { timeout });
      
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
      if (!isolate.isDisposed) {
        isolate.dispose();
      }
    }
  }
}
