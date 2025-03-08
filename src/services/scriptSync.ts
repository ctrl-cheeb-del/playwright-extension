import type { RemoteScript, ScriptDefinition, ScriptContext } from '../core/types';
import { storageService } from './storage';
import { executeScript } from '../core/interpreter';

// GitHub repository to fetch scripts from
const GITHUB_REPO = 'ctrl-cheeb-del/playwright-script-examples';
const GITHUB_BRANCH = 'master';
const SCRIPTS_PATH = ''; // Root directory

class ScriptSyncService {
  /**
   * Fetch scripts from GitHub and store them locally
   */
  async syncScripts(): Promise<RemoteScript[]> {
    try {
      const cacheBuster = Date.now();
      
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/contents/${SCRIPTS_PATH}?ref=${GITHUB_BRANCH}&_=${cacheBuster}`,
        {
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }
      
      const files = await response.json();
      
      const scriptFiles = files.filter((file: any) => 
        file.type === 'file' && (file.name.endsWith('.ts') || file.name.endsWith('.js'))
      );
      
      const scripts: RemoteScript[] = [];
      
      for (const file of scriptFiles) {
        const fileUrl = `${file.download_url}?_=${cacheBuster}`;
        const scriptResponse = await fetch(fileUrl, {
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        if (scriptResponse.ok) {
          const scriptText = await scriptResponse.text();
          const parsedScript = this.parseTypeScriptFile(scriptText, file.name);
          if (parsedScript) {
            scripts.push(parsedScript);
          }
        }
      }
      
      await storageService.saveRemoteScripts(scripts);
      return scripts;
    } catch (error) {
      console.error('Error syncing scripts:', error);
      return [];
    }
  }
  
  /**
   * Parse a TypeScript file to extract script information
   */
  private parseTypeScriptFile(fileContent: string, fileName: string): RemoteScript | null {
    try {
      // Extract script ID from filename (remove extension)
      let id = fileName.replace(/\.(ts|js)$/, '');
      
      // Try to extract ID from the script definition first
      const idMatch = fileContent.match(/id:\s*['"]([^'"]+)['"]/);
      if (idMatch) {
        id = idMatch[1];
      }
      
      // Extract name using regex
      const nameMatch = fileContent.match(/name:\s*['"]([^'"]+)['"]/);
      const name = nameMatch ? nameMatch[1] : id;
      
      // Extract description using regex
      const descMatch = fileContent.match(/description:\s*['"]([^'"]+)['"]/);
      const description = descMatch ? descMatch[1] : '';
      
      // Extract useCurrentTab using regex
      const useCurrentTabMatch = fileContent.match(/useCurrentTab:\s*(true|false)/);
      const useCurrentTab = useCurrentTabMatch ? useCurrentTabMatch[1] === 'true' : true;
      
      // Extract the run function body
      const runFunctionMatch = fileContent.match(/async\s+run\s*\([^)]*\)\s*{([\s\S]*?)}\s*(?:;|\n)/);
      const runFunctionBody = runFunctionMatch ? runFunctionMatch[1].trim() : '';
      
      if (!runFunctionBody) {
        console.error(`Could not extract run function body from ${fileName}`);
        return null;
      }
      
      return {
        id,
        name,
        description,
        useCurrentTab,
        code: runFunctionBody,  // Store the raw function body
        version: Date.now() // Use timestamp as version
      };
    } catch (error) {
      console.error(`Error parsing TypeScript file ${fileName}:`, error);
      return null;
    }
  }
  
  /**
   * Convert a remote script to a runnable script definition
   */
  convertRemoteScript(remoteScript: RemoteScript): ScriptDefinition {
    // Create a script definition from a remote script
    const runFunction = async (ctx: ScriptContext) => {
      try {
        ctx.log(`Starting remote script: ${remoteScript.name}`);
        
        // Preprocess the script code to handle common patterns
        let processedCode = remoteScript.code;
        
        // Remove destructuring assignments for ctx, as we'll provide these directly
        processedCode = processedCode.replace(/const\s*{\s*page\s*,\s*log\s*}\s*=\s*ctx\s*;?/g, '');
        
        // Execute the script using our interpreter
        await executeScript(processedCode, ctx);
        
        ctx.log(`Remote script completed: ${remoteScript.name}`);
      } catch (error) {
        ctx.log(`Error executing script: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    };

    return {
      id: remoteScript.id,
      name: remoteScript.name,
      description: remoteScript.description,
      useCurrentTab: remoteScript.useCurrentTab,
      isRemote: true,
      source: 'remote',
      lastUpdated: Date.now(),
      run: runFunction
    };
  }
  
  /**
   * Get all available scripts (local + remote)
   */
  async getAllScripts(localScripts: ScriptDefinition[]): Promise<ScriptDefinition[]> {
    // Get remote scripts from storage
    const remoteScripts = await storageService.getRemoteScripts();
    console.log(`Retrieved ${remoteScripts.length} remote scripts from storage`);
    
    // Log all remote script IDs for debugging
    console.log('Remote script IDs:', remoteScripts.map(s => s.id));
    
    // Convert remote scripts to script definitions
    const convertedRemoteScripts = remoteScripts.map(script => 
      this.convertRemoteScript(script)
    );
    
    // Combine local and remote scripts
    // If there are duplicates (same ID), prefer the local version
    const allScripts: ScriptDefinition[] = [...localScripts];
    
    // Add remote scripts that don't conflict with local ones
    for (const remoteScript of convertedRemoteScripts) {
      if (!allScripts.some(script => script.id === remoteScript.id)) {
        allScripts.push(remoteScript);
      }
    }
    
    console.log(`Total scripts available: ${allScripts.length} (${localScripts.length} local, ${convertedRemoteScripts.length} remote)`);
    console.log('All script IDs:', allScripts.map(s => s.id));
    
    return allScripts;
  }
}

export const scriptSyncService = new ScriptSyncService(); 