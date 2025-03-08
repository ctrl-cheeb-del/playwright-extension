import type { StorageData, RemoteScript } from '../core/types';

class StorageService {
  private async getData(): Promise<StorageData> {
    const data = await chrome.storage.local.get(['scriptSettings', 'remoteScripts', 'lastSyncTime']);
    return { 
      scriptSettings: data.scriptSettings || {},
      remoteScripts: data.remoteScripts || [],
      lastSyncTime: data.lastSyncTime || 0
    };
  }

  private async setData(data: StorageData): Promise<void> {
    await chrome.storage.local.set({ 
      scriptSettings: data.scriptSettings,
      remoteScripts: data.remoteScripts,
      lastSyncTime: data.lastSyncTime
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
}

export const storageService = new StorageService(); 