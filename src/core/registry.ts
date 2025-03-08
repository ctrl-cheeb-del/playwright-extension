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
let allScripts: ScriptDefinition[] = [...localScripts];

// Helper to find a script by ID
export function findScript(id: string): ScriptDefinition | undefined {
  return allScripts.find(script => script.id === id);
}

// Get all available scripts (local + remote)
export async function getAvailableScripts(forceSync = false): Promise<ScriptDefinition[]> {
  // If we're forcing a sync or this is the first load, sync with remote
  if (forceSync || allScripts.length === localScripts.length) {
    allScripts = await scriptSyncService.getAllScripts(localScripts);
  }
  
  // Deduplicate scripts by ID, preferring local scripts over remote ones
  const scriptsMap = new Map<string, ScriptDefinition>();
  
  // Add local scripts first
  localScripts.forEach(script => {
    scriptsMap.set(script.id, script);
  });
  
  // Add remote scripts only if they don't conflict with local ones
  allScripts
    .filter(script => script.source === 'remote')
    .forEach(script => {
      if (!scriptsMap.has(script.id)) {
        scriptsMap.set(script.id, script);
      }
    });
  
  return Array.from(scriptsMap.values());
}

// Sync with remote repository
export async function syncRemoteScripts(): Promise<void> {
  await scriptSyncService.syncScripts();
  allScripts = await scriptSyncService.getAllScripts(localScripts);
} 