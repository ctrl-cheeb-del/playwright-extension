/// <reference types="vite/client" />
import type { ScriptDefinition } from './types';

// Import all script modules
const scriptModules = import.meta.glob<{ default: ScriptDefinition }>('../scripts/*.ts', { eager: true });

// Convert modules to array of scripts
export const availableScripts: ScriptDefinition[] = Object.values(scriptModules)
  .map((module: { default: ScriptDefinition }) => module.default)
  .sort((a, b) => a.name.localeCompare(b.name));

// Helper to find a script by ID
export function findScript(id: string): ScriptDefinition | undefined {
  return availableScripts.find(script => script.id === id);
} 