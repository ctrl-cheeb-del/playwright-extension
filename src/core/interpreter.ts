import { evaluate } from 'scraggy';
import type { ScriptContext } from './types';

function createDynamicProxy(target: any, path = ''): any {
  return new Proxy(
    {},
    {
      get(_, prop) {
        const propName = String(prop);
        const fullPath = path ? `${path}.${propName}` : propName;

        if (typeof target[propName] === 'function') {
          return async (...args: any[]) => {
            console.log(`Calling ${fullPath}(${args.map(a => JSON.stringify(a)).join(', ')})`);
            return await target[propName](...args);
          };
        }

        if (target[propName] && typeof target[propName] === 'object') {
          return createDynamicProxy(target[propName], fullPath);
        }

        return target[propName];
      },
    }
  );
}

function createGlobalScope(context: ScriptContext): Record<string, any> {
  const scopeCtx: any = {
    page: createDynamicProxy(context.page, 'page'),
    log: context.log,
    parameters: context.parameters || {}
  };

  if (context.tryWithAI) {
    scopeCtx.tryWithAI = context.tryWithAI;
  }

  return {
    ctx: scopeCtx,

    console: {
      log: (...args: any[]) => {
        const message = args
          .map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
          .join(' ');
        context.log(message);
      },
      error: (...args: any[]) => {
        const message = args
          .map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
          .join(' ');
        context.log(`ERROR: ${message}`);
      },
      warn: (...args: any[]) => {
        const message = args
          .map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
          .join(' ');
        context.log(`WARNING: ${message}`);
      },
      info: (...args: any[]) => {
        const message = args
          .map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
          .join(' ');
        context.log(`INFO: ${message}`);
      },
    },
  };
}

export async function executeScript(scriptCode: string, context: ScriptContext): Promise<void> {
  try {
    // Log the first few lines of the script for debugging
    const previewLines = scriptCode.split('\n').slice(0, 5).join('\n');
    console.log('Executing script preview:', previewLines + '...');
    context.log('Script execution started');
    
    if (context.parameters && Object.keys(context.parameters).length > 0) {
      context.log(`Using parameters: ${JSON.stringify(context.parameters)}`);
    }
    
    await evaluate(createGlobalScope(context), scriptCode);
  } catch (error) {
    console.error('Error executing script:', error);
    context.log(
      `Error executing script: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}
