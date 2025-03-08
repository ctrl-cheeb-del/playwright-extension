import type { ScriptContext } from './types';
import * as acorn from 'acorn';

// Define the environment for script execution
interface Environment {
  variables: Record<string, any>;
  parent: Environment | null;
}

// Create a new environment with given variables and parent environment
function createEnvironment(variables: Record<string, any> = {}, parent: Environment | null = null): Environment {
  return { variables, parent };
}

// Look up a variable in the environment chain
function lookup(env: Environment, name: string): any {
  if (name in env.variables) {
    return env.variables[name];
  }
  if (env.parent) {
    return lookup(env.parent, name);
  }
  throw new Error(`Variable '${name}' is not defined`);
}

// Define a variable in the environment
function define(env: Environment, name: string, value: any): void {
  env.variables[name] = value;
}

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

// Helper class for handling return statements
class ReturnValue {
  constructor(public value: any) {}
}

// Interpreter class for executing JavaScript AST
export class Interpreter {
  private globalEnv: Environment;
  
  constructor(context: ScriptContext) {
    // Create global environment with Playwright context
    this.globalEnv = createEnvironment({
      // Provide the page object as a dynamic proxy
      page: createDynamicProxy(context.page, 'page'),
      
      // Provide the log function
      log: context.log,
      
      // Add common utilities
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
      
      // Add setTimeout and other utilities
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      
      // Add basic constructors
      String: String,
      Number: Number,
      Boolean: Boolean,
      Array: Array,
      Object: Object,
      Date: Date,
      RegExp: RegExp,
      
      // Add math functions
      Math: Math,
      
      // Add JSON utilities
      JSON: JSON,
      
      // Add Promise support
      Promise: Promise,
      
      // Add basic functions
      parseInt: parseInt,
      parseFloat: parseFloat,
      isNaN: isNaN,
      isFinite: isFinite,
      
      // Add string functions
      encodeURIComponent: encodeURIComponent,
      decodeURIComponent: decodeURIComponent,
    });
  }
  
  // Execute a script from its AST
  async execute(ast: any): Promise<any> {
    return await this.evaluateNode(ast, this.globalEnv);
  }
  
  // Evaluate an AST node
  private async evaluateNode(node: any, env: Environment): Promise<any> {
    switch (node.type) {
      case 'Program':
        return await this.evaluateProgram(node, env);
      
      case 'ExpressionStatement':
        return await this.evaluateNode(node.expression, env);
      
      case 'CallExpression':
        return await this.evaluateCallExpression(node, env);
      
      case 'MemberExpression':
        return await this.evaluateMemberExpression(node, env);
      
      case 'Identifier':
        return lookup(env, node.name);
      
      case 'Literal':
        return node.value;
      
      case 'AwaitExpression':
        const value = await this.evaluateNode(node.argument, env);
        return await value;
      
      case 'VariableDeclaration':
        return await this.evaluateVariableDeclaration(node, env);
      
      case 'BlockStatement':
        return await this.evaluateBlockStatement(node, env);
      
      case 'IfStatement':
        return await this.evaluateIfStatement(node, env);
        
      case 'BinaryExpression':
        return await this.evaluateBinaryExpression(node, env);
        
      case 'LogicalExpression':
        return await this.evaluateLogicalExpression(node, env);
        
      case 'UnaryExpression':
        return await this.evaluateUnaryExpression(node, env);
        
      case 'ForStatement':
        return await this.evaluateForStatement(node, env);
        
      case 'WhileStatement':
        return await this.evaluateWhileStatement(node, env);
        
      case 'ObjectExpression':
        return await this.evaluateObjectExpression(node, env);
        
      case 'ArrayExpression':
        return await this.evaluateArrayExpression(node, env);
        
      case 'FunctionDeclaration':
        return await this.evaluateFunctionDeclaration(node, env);
        
      case 'ArrowFunctionExpression':
        return await this.evaluateArrowFunctionExpression(node, env);
        
      case 'ReturnStatement':
        return await this.evaluateReturnStatement(node, env);
        
      case 'AssignmentExpression':
        return await this.evaluateAssignmentExpression(node, env);
        
      case 'UpdateExpression':
        return await this.evaluateUpdateExpression(node, env);
        
      case 'TemplateLiteral':
        return await this.evaluateTemplateLiteral(node, env);
        
      case 'ConditionalExpression':
        return await this.evaluateConditionalExpression(node, env);
        
      case 'TryStatement':
        return await this.evaluateTryStatement(node, env);
        
      default:
        throw new Error(`Unsupported node type: ${node.type}`);
    }
  }
  
  // Evaluate a program node (the root of the AST)
  private async evaluateProgram(node: any, env: Environment): Promise<any> {
    let result;
    for (const statement of node.body) {
      result = await this.evaluateNode(statement, env);
    }
    return result;
  }
  
  // Evaluate a call expression (e.g., foo())
  private async evaluateCallExpression(node: any, env: Environment): Promise<any> {
    const func = await this.evaluateNode(node.callee, env);
    const args = [];
    
    for (const arg of node.arguments) {
      args.push(await this.evaluateNode(arg, env));
    }
    
    if (typeof func !== 'function') {
      throw new Error('Attempted to call a non-function');
    }
    
    return await func(...args);
  }
  
  // Evaluate a member expression (e.g., obj.prop or obj['prop'])
  private async evaluateMemberExpression(node: any, env: Environment): Promise<any> {
    const object = await this.evaluateNode(node.object, env);
    
    if (node.computed) {
      // obj[prop]
      const property = await this.evaluateNode(node.property, env);
      return object[property];
    } else {
      // obj.prop
      return object[node.property.name];
    }
  }
  
  // Evaluate a variable declaration (e.g., let x = 5)
  private async evaluateVariableDeclaration(node: any, env: Environment): Promise<any> {
    for (const declarator of node.declarations) {
      if (declarator.id.type === 'Identifier') {
        // Simple variable declaration (e.g., let x = 5)
        const value = declarator.init ? await this.evaluateNode(declarator.init, env) : undefined;
        define(env, declarator.id.name, value);
      } else if (declarator.id.type === 'ObjectPattern') {
        // Object destructuring (e.g., const { a, b } = obj)
        const rightValue = await this.evaluateNode(declarator.init, env);
        
        // Process each property in the destructuring pattern
        for (const property of declarator.id.properties) {
          if (property.key.type === 'Identifier') {
            const key = property.key.name;
            
            // Handle property value (could be a nested pattern or a simple identifier)
            if (property.value.type === 'Identifier') {
              // Simple case: { key } or { key: alias }
              const varName = property.value.name;
              define(env, varName, rightValue[key]);
            } else {
              // More complex patterns not supported yet
              throw new Error(`Unsupported destructuring pattern: ${property.value.type}`);
            }
          } else {
            throw new Error(`Unsupported property key type: ${property.key.type}`);
          }
        }
      } else if (declarator.id.type === 'ArrayPattern') {
        // Array destructuring (e.g., const [a, b] = array)
        const rightValue = await this.evaluateNode(declarator.init, env);
        
        // Process each element in the destructuring pattern
        for (let i = 0; i < declarator.id.elements.length; i++) {
          const element = declarator.id.elements[i];
          if (element === null) continue; // Skip holes in the pattern
          
          if (element.type === 'Identifier') {
            define(env, element.name, rightValue[i]);
          } else {
            throw new Error(`Unsupported array destructuring element: ${element.type}`);
          }
        }
      } else {
        throw new Error(`Unsupported variable declaration pattern: ${declarator.id.type}`);
      }
    }
    
    return undefined;
  }
  
  // Evaluate a block statement (e.g., { ... })
  private async evaluateBlockStatement(node: any, env: Environment): Promise<any> {
    // Create a new environment for the block
    const blockEnv = createEnvironment({}, env);
    
    let result;
    for (const statement of node.body) {
      result = await this.evaluateNode(statement, blockEnv);
      
      // Handle early returns from functions
      if (result instanceof ReturnValue) {
        return result;
      }
    }
    
    return result;
  }
  
  // Evaluate an if statement
  private async evaluateIfStatement(node: any, env: Environment): Promise<any> {
    const test = await this.evaluateNode(node.test, env);
    
    if (test) {
      return await this.evaluateNode(node.consequent, env);
    } else if (node.alternate) {
      return await this.evaluateNode(node.alternate, env);
    }
    
    return undefined;
  }
  
  // Evaluate a binary expression (e.g., a + b)
  private async evaluateBinaryExpression(node: any, env: Environment): Promise<any> {
    const left = await this.evaluateNode(node.left, env);
    const right = await this.evaluateNode(node.right, env);
    
    switch (node.operator) {
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/': return left / right;
      case '%': return left % right;
      case '==': return left == right;
      case '!=': return left != right;
      case '===': return left === right;
      case '!==': return left !== right;
      case '<': return left < right;
      case '<=': return left <= right;
      case '>': return left > right;
      case '>=': return left >= right;
      case '|': return left | right;
      case '&': return left & right;
      case '^': return left ^ right;
      case '<<': return left << right;
      case '>>': return left >> right;
      case '>>>': return left >>> right;
      default: throw new Error(`Unsupported binary operator: ${node.operator}`);
    }
  }
  
  // Evaluate a logical expression (e.g., a && b)
  private async evaluateLogicalExpression(node: any, env: Environment): Promise<any> {
    const left = await this.evaluateNode(node.left, env);
    
    switch (node.operator) {
      case '&&':
        return left ? await this.evaluateNode(node.right, env) : left;
      case '||':
        return left ? left : await this.evaluateNode(node.right, env);
      case '??':
        return left !== null && left !== undefined ? left : await this.evaluateNode(node.right, env);
      default:
        throw new Error(`Unsupported logical operator: ${node.operator}`);
    }
  }
  
  // Evaluate a unary expression (e.g., !a, -b)
  private async evaluateUnaryExpression(node: any, env: Environment): Promise<any> {
    const argument = await this.evaluateNode(node.argument, env);
    
    switch (node.operator) {
      case '!': return !argument;
      case '-': return -argument;
      case '+': return +argument;
      case '~': return ~argument;
      case 'typeof': return typeof argument;
      case 'void': return void argument;
      case 'delete':
        if (node.argument.type === 'MemberExpression') {
          const object = await this.evaluateNode(node.argument.object, env);
          const property = node.argument.computed
            ? await this.evaluateNode(node.argument.property, env)
            : node.argument.property.name;
          return delete object[property];
        }
        return true; // Can't delete variables in our environment
      default:
        throw new Error(`Unsupported unary operator: ${node.operator}`);
    }
  }
  
  // Evaluate a function declaration
  private async evaluateFunctionDeclaration(node: any, env: Environment): Promise<any> {
    const func = this.createFunction(node.params, node.body, env);
    define(env, node.id.name, func);
    return undefined;
  }
  
  // Evaluate an arrow function expression
  private async evaluateArrowFunctionExpression(node: any, env: Environment): Promise<any> {
    return this.createFunction(node.params, node.body, env);
  }
  
  // Create a function from parameters and body
  private createFunction(params: any[], body: any, env: Environment): Function {
    return async (...args: any[]) => {
      // Create a new environment for the function
      const funcEnv = createEnvironment({}, env);
      
      // Bind parameters to arguments
      for (let i = 0; i < params.length; i++) {
        if (params[i].type !== 'Identifier') {
          throw new Error('Only simple parameter names are supported');
        }
        define(funcEnv, params[i].name, args[i]);
      }
      
      // Execute the function body
      try {
        const result = await this.evaluateNode(body, funcEnv);
        
        // Handle return values
        if (result instanceof ReturnValue) {
          return result.value;
        }
        
        return result;
      } catch (error) {
        if (error instanceof ReturnValue) {
          return error.value;
        }
        throw error;
      }
    };
  }
  
  // Evaluate a return statement
  private async evaluateReturnStatement(node: any, env: Environment): Promise<any> {
    const value = node.argument ? await this.evaluateNode(node.argument, env) : undefined;
    return new ReturnValue(value);
  }
  
  // Evaluate a for statement
  private async evaluateForStatement(node: any, env: Environment): Promise<any> {
    // Create a new environment for the loop
    const loopEnv = createEnvironment({}, env);
    
    // Initialize
    if (node.init) {
      await this.evaluateNode(node.init, loopEnv);
    }
    
    // Loop condition and update
    while (true) {
      // Check condition
      if (node.test) {
        const condition = await this.evaluateNode(node.test, loopEnv);
        if (!condition) break;
      }
      
      // Execute body
      const result = await this.evaluateNode(node.body, loopEnv);
      if (result instanceof ReturnValue) {
        return result;
      }
      
      // Update
      if (node.update) {
        await this.evaluateNode(node.update, loopEnv);
      }
    }
    
    return undefined;
  }
  
  // Evaluate a while statement
  private async evaluateWhileStatement(node: any, env: Environment): Promise<any> {
    while (true) {
      // Check condition
      const condition = await this.evaluateNode(node.test, env);
      if (!condition) break;
      
      // Execute body
      const result = await this.evaluateNode(node.body, env);
      if (result instanceof ReturnValue) {
        return result;
      }
    }
    
    return undefined;
  }
  
  // Evaluate an object expression (e.g., { a: 1, b: 2 })
  private async evaluateObjectExpression(node: any, env: Environment): Promise<any> {
    const obj: Record<string, any> = {};
    
    for (const property of node.properties) {
      let key;
      
      if (property.computed) {
        key = await this.evaluateNode(property.key, env);
      } else if (property.key.type === 'Identifier') {
        key = property.key.name;
      } else if (property.key.type === 'Literal') {
        key = property.key.value;
      } else {
        throw new Error('Unsupported property key type');
      }
      
      const value = await this.evaluateNode(property.value, env);
      obj[key] = value;
    }
    
    return obj;
  }
  
  // Evaluate an array expression (e.g., [1, 2, 3])
  private async evaluateArrayExpression(node: any, env: Environment): Promise<any> {
    const array = [];
    
    for (const element of node.elements) {
      if (element === null) {
        array.push(undefined); // Handle sparse arrays
      } else {
        array.push(await this.evaluateNode(element, env));
      }
    }
    
    return array;
  }
  
  // Evaluate an assignment expression (e.g., a = 5)
  private async evaluateAssignmentExpression(node: any, env: Environment): Promise<any> {
    const right = await this.evaluateNode(node.right, env);
    
    if (node.left.type === 'Identifier') {
      // Simple assignment to a variable
      const name = node.left.name;
      
      // Find the environment that contains the variable
      let currentEnv: Environment | null = env;
      while (currentEnv) {
        if (name in currentEnv.variables) {
          // Apply the assignment operator
          switch (node.operator) {
            case '=': currentEnv.variables[name] = right; break;
            case '+=': currentEnv.variables[name] += right; break;
            case '-=': currentEnv.variables[name] -= right; break;
            case '*=': currentEnv.variables[name] *= right; break;
            case '/=': currentEnv.variables[name] /= right; break;
            case '%=': currentEnv.variables[name] %= right; break;
            case '**=': currentEnv.variables[name] **= right; break;
            case '<<=': currentEnv.variables[name] <<= right; break;
            case '>>=': currentEnv.variables[name] >>= right; break;
            case '>>>=': currentEnv.variables[name] >>>= right; break;
            case '|=': currentEnv.variables[name] |= right; break;
            case '^=': currentEnv.variables[name] ^= right; break;
            case '&=': currentEnv.variables[name] &= right; break;
            default: throw new Error(`Unsupported assignment operator: ${node.operator}`);
          }
          return currentEnv.variables[name];
        }
        currentEnv = currentEnv.parent;
      }
      
      // If the variable doesn't exist, define it in the current environment
      if (node.operator === '=') {
        define(env, name, right);
        return right;
      }
      
      throw new Error(`Cannot use operator ${node.operator} on undefined variable ${name}`);
    } else if (node.left.type === 'MemberExpression') {
      // Assignment to an object property
      const object = await this.evaluateNode(node.left.object, env);
      const property = node.left.computed
        ? await this.evaluateNode(node.left.property, env)
        : node.left.property.name;
      
      // Apply the assignment operator
      switch (node.operator) {
        case '=': object[property] = right; break;
        case '+=': object[property] += right; break;
        case '-=': object[property] -= right; break;
        case '*=': object[property] *= right; break;
        case '/=': object[property] /= right; break;
        case '%=': object[property] %= right; break;
        case '**=': object[property] **= right; break;
        case '<<=': object[property] <<= right; break;
        case '>>=': object[property] >>= right; break;
        case '>>>=': object[property] >>>= right; break;
        case '|=': object[property] |= right; break;
        case '^=': object[property] ^= right; break;
        case '&=': object[property] &= right; break;
        default: throw new Error(`Unsupported assignment operator: ${node.operator}`);
      }
      
      return object[property];
    } else {
      throw new Error('Unsupported assignment target');
    }
  }
  
  // Evaluate an update expression (e.g., i++, --j)
  private async evaluateUpdateExpression(node: any, env: Environment): Promise<any> {
    if (node.argument.type === 'Identifier') {
      const name = node.argument.name;
      
      // Find the environment that contains the variable
      let currentEnv: Environment | null = env;
      while (currentEnv) {
        if (name in currentEnv.variables) {
          const oldValue = currentEnv.variables[name];
          
          // Apply the update
          if (node.operator === '++') {
            currentEnv.variables[name] += 1;
          } else if (node.operator === '--') {
            currentEnv.variables[name] -= 1;
          } else {
            throw new Error(`Unsupported update operator: ${node.operator}`);
          }
          
          // Return the appropriate value based on prefix/postfix
          return node.prefix ? currentEnv.variables[name] : oldValue;
        }
        currentEnv = currentEnv.parent;
      }
      
      throw new Error(`Cannot update undefined variable ${name}`);
    } else if (node.argument.type === 'MemberExpression') {
      const object = await this.evaluateNode(node.argument.object, env);
      const property = node.argument.computed
        ? await this.evaluateNode(node.argument.property, env)
        : node.argument.property.name;
      
      const oldValue = object[property];
      
      // Apply the update
      if (node.operator === '++') {
        object[property] += 1;
      } else if (node.operator === '--') {
        object[property] -= 1;
      } else {
        throw new Error(`Unsupported update operator: ${node.operator}`);
      }
      
      // Return the appropriate value based on prefix/postfix
      return node.prefix ? object[property] : oldValue;
    } else {
      throw new Error('Unsupported update target');
    }
  }
  
  // Evaluate a template literal (e.g., `Hello ${name}`)
  private async evaluateTemplateLiteral(node: any, env: Environment): Promise<string> {
    let result = '';
    
    for (let i = 0; i < node.quasis.length; i++) {
      // Add the static part
      result += node.quasis[i].value.cooked;
      
      // Add the expression part if there is one
      if (i < node.expressions.length) {
        const value = await this.evaluateNode(node.expressions[i], env);
        result += String(value);
      }
    }
    
    return result;
  }
  
  // Evaluate a conditional expression (e.g., a ? b : c)
  private async evaluateConditionalExpression(node: any, env: Environment): Promise<any> {
    const test = await this.evaluateNode(node.test, env);
    return test
      ? await this.evaluateNode(node.consequent, env)
      : await this.evaluateNode(node.alternate, env);
  }
  
  // Evaluate a try-catch statement
  private async evaluateTryStatement(node: any, env: Environment): Promise<any> {
    try {
      return await this.evaluateNode(node.block, env);
    } catch (error) {
      if (error instanceof ReturnValue) {
        throw error; // Re-throw return values
      }
      
      if (node.handler) {
        // Create a new environment for the catch block
        const catchEnv = createEnvironment({}, env);
        
        // Bind the error to the parameter
        if (node.handler.param && node.handler.param.type === 'Identifier') {
          define(catchEnv, node.handler.param.name, error);
        }
        
        return await this.evaluateNode(node.handler.body, catchEnv);
      }
      
      throw error;
    } finally {
      if (node.finalizer) {
        await this.evaluateNode(node.finalizer, env);
      }
    }
  }
}

// Parse JavaScript code to AST using Acorn
export function parseScript(code: string): any {
  try {
    // Use Acorn to parse the code
    return acorn.parse(code, {
      ecmaVersion: 2020,
      sourceType: 'script',
      locations: true,
      allowAwaitOutsideFunction: true
    });
  } catch (error) {
    console.error('Error parsing script:', error);
    throw new Error(`Failed to parse script: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Execute a script with the given context
export async function executeScript(scriptCode: string, context: ScriptContext): Promise<void> {
  try {
    // Add debugging
    console.log('Executing script code:', scriptCode);
    
    // Check if the code is a function body fragment (doesn't start with a declaration or statement)
    const isFunctionBody = !scriptCode.trim().match(/^(const|let|var|function|class|import|export|if|for|while|switch|return|try|throw)/);
    
    // If it's a function body, we need to handle it differently
    if (isFunctionBody) {
      console.log('Detected function body fragment, executing directly');
      
      // Create a new interpreter with the context
      const interpreter = new Interpreter(context);
      
      // Execute each line of the function body directly
      const lines = scriptCode.split('\n');
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('//')) continue; // Skip empty lines and comments
        
        try {
          // For destructuring assignments like "const { page, log } = ctx;"
          if (trimmedLine.match(/const\s*{.*}\s*=\s*ctx/)) {
            // We already have page and log in the global environment, so we can skip this line
            continue;
          }
          
          // For await expressions, we need to wrap them in an async IIFE
          if (trimmedLine.startsWith('await ')) {
            const expression = trimmedLine.substring(6); // Remove 'await '
            const wrappedCode = `(async () => { return ${expression}; })()`;
            const ast = parseScript(wrappedCode);
            await interpreter.execute(ast);
          } else {
            // For regular statements
            const ast = parseScript(trimmedLine);
            await interpreter.execute(ast);
          }
        } catch (lineError) {
          console.error(`Error executing line "${trimmedLine}":`, lineError);
          context.log(`Error in line "${trimmedLine}": ${lineError instanceof Error ? lineError.message : String(lineError)}`);
          // Continue with next line instead of failing the whole script
        }
      }
    } else {
      // For complete scripts, parse and execute normally
      const ast = parseScript(scriptCode);
      const interpreter = new Interpreter(context);
      await interpreter.execute(ast);
    }
  } catch (error) {
    console.error('Error executing script:', error);
    context.log(`Error executing script: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
} 