import type { StorageData, RemoteScript, ScriptDefinition, SerializableScript, ScriptContext } from '../core/types';
import { executeScript } from '../core/interpreter';

class StorageService {
  private async getData(): Promise<StorageData> {
    const data = await chrome.storage.local.get(['scriptSettings', 'remoteScripts', 'lastSyncTime', 'localRecordedScripts']);
    return { 
      scriptSettings: data.scriptSettings || {},
      remoteScripts: data.remoteScripts || [],
      lastSyncTime: data.lastSyncTime || 0,
      localRecordedScripts: data.localRecordedScripts || []
    };
  }

  private async setData(data: StorageData): Promise<void> {
    await chrome.storage.local.set({ 
      scriptSettings: data.scriptSettings,
      remoteScripts: data.remoteScripts,
      lastSyncTime: data.lastSyncTime,
      localRecordedScripts: data.localRecordedScripts
    });
  }

  async getScriptSettings(scriptId: string): Promise<any> {
    const data = await this.getData();
    return data.scriptSettings[scriptId] || {};
  }

  async saveScriptSettings(scriptId: string, settings: any): Promise<void> {
    const data = await this.getData();
    data.scriptSettings[scriptId] = settings;
    await this.setData(data);
  }

  async clearScriptSettings(scriptId: string): Promise<void> {
    const data = await this.getData();
    delete data.scriptSettings[scriptId];
    await this.setData(data);
  }

  // Remote scripts methods
  async getRemoteScripts(): Promise<RemoteScript[]> {
    const data = await this.getData();
    return data.remoteScripts;
  }

  async saveRemoteScripts(scripts: RemoteScript[]): Promise<void> {
    const data = await this.getData();
    data.remoteScripts = scripts;
    data.lastSyncTime = Date.now();
    await this.setData(data);
  }

  async getLastSyncTime(): Promise<number> {
    const data = await this.getData();
    return data.lastSyncTime || 0;
  }

  // Local recorded scripts methods
  async getLocalRecordedScripts(): Promise<ScriptDefinition[]> {
    const data = await this.getData();
    const scripts = data.localRecordedScripts || [];
    
    // Recreate the run function for each script using the executeScript function
    return scripts.map(script => {
      if (script.code) {
        // Recreate the run function
        const runFunction = async (ctx: ScriptContext) => {
          try {
            ctx.log(`Starting recorded script: ${script.name}`);
            await executeScript(script.code, ctx);
            ctx.log(`Recorded script completed: ${script.name}`);
          } catch (error) {
            ctx.log(
              `Error executing script: ${error instanceof Error ? error.message : String(error)}`
            );
            throw error;
          }
        };
        
        // Return the script with the recreated run function
        return {
          ...script,
          run: runFunction
        };
      }
      
      return script as unknown as ScriptDefinition;
    });
  }

  async saveLocalRecordedScript(script: ScriptDefinition): Promise<void> {
    const data = await this.getData();
    // Initialize if not exists
    if (!data.localRecordedScripts) {
      data.localRecordedScripts = [];
    }
    
    // Create a serializable version of the script
    const serializableScript: SerializableScript = {
      id: script.id,
      name: script.name,
      description: script.description,
      useCurrentTab: script.useCurrentTab,
      source: script.source,
      lastUpdated: script.lastUpdated,
      isRemote: script.isRemote,
      code: script.code || '',  // Ensure code is always a string
    };
    
    // Add the new script
    data.localRecordedScripts.push(serializableScript);
    await this.setData(data);
  }

  async deleteLocalRecordedScript(scriptId: string): Promise<boolean> {
    const data = await this.getData();
    
    // If no scripts exist, return false
    if (!data.localRecordedScripts || data.localRecordedScripts.length === 0) {
      return false;
    }
    
    // Find the script index
    const scriptIndex = data.localRecordedScripts.findIndex(script => script.id === scriptId);
    
    // If script not found, return false
    if (scriptIndex === -1) {
      return false;
    }
    
    // Remove the script
    data.localRecordedScripts.splice(scriptIndex, 1);
    
    // Save the updated data
    await this.setData(data);
    
    return true;
  }
}

export const storageService = new StorageService(); 