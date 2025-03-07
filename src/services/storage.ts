import type { StorageData } from '../core/types';

class StorageService {
  private async getData(): Promise<StorageData> {
    const data = await chrome.storage.local.get('scriptSettings');
    return { scriptSettings: data.scriptSettings || {} };
  }

  private async setData(data: StorageData): Promise<void> {
    await chrome.storage.local.set({ scriptSettings: data.scriptSettings });
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
}

export const storageService = new StorageService(); 