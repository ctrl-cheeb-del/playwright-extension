/// <reference types="vite/client" />
import type { ScriptDefinition } from './types';
import { scriptSyncService } from '../services/scriptSync';

// Import all local script modules
const scriptModules = import.meta.glob<{ default: ScriptDefinition }>('../scripts/*.ts', { eager: true });

// Convert modules to array of local scripts
export const localScripts: ScriptDefinition[] = Object.values(scriptModules)
  .map((module: { default: ScriptDefinition }) => {
    // Mark as local script
    const script = module.default;
    script.source = 'local';
    return script;
  })
  .sort((a, b) => a.name.localeCompare(b.name));

// This will hold all scripts (local + remote)
let allScripts: ScriptDefinition[] = [];

// Helper to find a script by ID
export function findScript(id: string): ScriptDefinition | undefined {
  return allScripts.find(script => script.id === id);
}

// Get all available scripts (local + remote)
export async function getAvailableScripts(forceSync = false): Promise<ScriptDefinition[]> {
  // Always sync on first load or when forced
  if (forceSync || allScripts.length === 0) {
    allScripts = await scriptSyncService.getAllScripts(localScripts);
  }
  
  return allScripts;
}

// Sync with remote repository
export async function syncRemoteScripts(): Promise<void> {
  await scriptSyncService.syncScripts();
  allScripts = await scriptSyncService.getAllScripts(localScripts);
} 