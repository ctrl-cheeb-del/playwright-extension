import type { ScriptContext } from './types';
import * as acorn from 'acorn';

// Create a dynamic proxy for any object
function createDynamicProxy(target: any, path = ''): any {
  return new Proxy({}, {
    get(_, prop) {
      const propName = String(prop);
      const fullPath = path ? `${path}.${propName}` : propName;
      
      // If it's a method on the target object
      if (typeof target[propName] === 'function') {
        // Return a function that calls the real method
        return async (...args: any[]) => {
          console.log(`Calling ${fullPath}(${args.map(a => JSON.stringify(a)).join(', ')})`);
          return await target[propName](...args);
        };
      }
      
      // If it's an object, create a new proxy for it
      if (target[propName] && typeof target[propName] === 'object') {
        return createDynamicProxy(target[propName], fullPath);
      }
      
      // Otherwise just return the property
      return target[propName];
    }
  });
}

// Create the global scope with built-in objects
function createGlobalScope(context: ScriptContext): Record<string, any> {
  return {
    // Playwright context
    page: createDynamicProxy(context.page, 'page'),
    log: context.log,
    
    // Console API
    console: {
      log: (...args: any[]) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        context.log(message);
      },
      error: (...args: any[]) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        context.log(`ERROR: ${message}`);
      },
      warn: (...args: any[]) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        context.log(`WARNING: ${message}`);
      },
      info: (...args: any[]) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        context.log(`INFO: ${message}`);
      }
    },
    
    // Built-in objects and functions
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Date: Date,
    Math: Math,
    JSON: JSON,
    RegExp: RegExp,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    undefined: undefined,
    null: null,
    Promise: Promise,
    Error: Error,
    TypeError: TypeError,
    ReferenceError: ReferenceError,
    
    // Utility functions
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent
  };
}

// Simple interpreter that executes AST nodes with global scope
class Interpreter {
  private globalScope: Record<string, any>;
  
  constructor(scope: Record<string, any>) {
    this.globalScope = scope;
  }
  
  async execute(node: any): Promise<any> {
    switch (node.type) {
      case 'Program':
        let result;
        for (const statement of node.body) {
          result = await this.execute(statement);
        }
        return result;
      
      case 'ExpressionStatement':
        return await this.execute(node.expression);
      
      case 'AwaitExpression':
        const value = await this.execute(node.argument);
        return await value;
      
      case 'CallExpression':
        const func = await this.execute(node.callee);
        const args = await Promise.all(node.arguments.map((arg: any) => this.execute(arg)));
        return await func.apply(null, args);
      
      case 'MemberExpression':
        const object = await this.execute(node.object);
        const property = node.computed
          ? await this.execute(node.property)
          : node.property.name;
        return object[property];
      
      case 'Identifier':
        if (node.name in this.globalScope) {
          return this.globalScope[node.name];
        }
        throw new ReferenceError(`${node.name} is not defined`);
      
      case 'Literal':
        return node.value;
      
      default:
        throw new Error(`Unsupported node type: ${node.type}`);
    }
  }
}

// Parse and execute JavaScript code
export async function executeScript(scriptCode: string, context: ScriptContext): Promise<void> {
  try {
    // Create global scope
    const globalScope = createGlobalScope(context);
    
    // Parse the code
    const ast = acorn.parse(scriptCode, {
      ecmaVersion: 2020,
      sourceType: 'script',
      allowAwaitOutsideFunction: true
    });
    
    // Create interpreter with global scope
    const interpreter = new Interpreter(globalScope);
    
    // Execute the code
    await interpreter.execute(ast);
  } catch (error) {
    console.error('Error executing script:', error);
    context.log(`Error executing script: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
} 