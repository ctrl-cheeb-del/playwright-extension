/// <reference types="vite/client" />
import type { ScriptDefinition } from './types';
import { scriptSyncService } from '../services/scriptSync';
import { storageService } from '../services/storage';

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
    // Get remote scripts
    const remoteScripts = await scriptSyncService.getAllScripts(localScripts);
    
    // Get locally recorded scripts
    const localRecordedScripts = await storageService.getLocalRecordedScripts();
    
    // Combine all scripts
    allScripts = [...remoteScripts, ...localRecordedScripts];
    
    // Sort scripts by name
    allScripts.sort((a, b) => a.name.localeCompare(b.name));
  }
  
  return allScripts;
}

// Sync with remote repository
export async function syncRemoteScripts(): Promise<void> {
  await scriptSyncService.syncScripts();
  
  // Get remote scripts
  const remoteScripts = await scriptSyncService.getAllScripts(localScripts);
  
  // Get locally recorded scripts
  const localRecordedScripts = await storageService.getLocalRecordedScripts();
  
  // Combine all scripts
  allScripts = [...remoteScripts, ...localRecordedScripts];
  
  // Sort scripts by name
  allScripts.sort((a, b) => a.name.localeCompare(b.name));
}

// Add a new script to the registry
export async function addScript(script: ScriptDefinition): Promise<void> {
  // Add to the in-memory scripts list
  allScripts = [...allScripts, script];
  
  // Sort scripts by name
  allScripts.sort((a, b) => a.name.localeCompare(b.name));
  
  // Save to storage
  await storageService.saveLocalRecordedScript(script);
}

// Delete a script from the registry
export async function deleteScript(scriptId: string): Promise<boolean> {
  // Find the script
  const scriptIndex = allScripts.findIndex(script => script.id === scriptId);
  
  // If script not found, return false
  if (scriptIndex === -1) {
    return false;
  }
  
  // Check if it's a locally recorded script
  const script = allScripts[scriptIndex];
  if (script.source !== 'local' || script.isRemote) {
    // Only locally recorded scripts can be deleted
    return false;
  }
  
  // Remove from in-memory list
  allScripts.splice(scriptIndex, 1);
  
  // Remove from storage
  return await storageService.deleteLocalRecordedScript(scriptId);
} 