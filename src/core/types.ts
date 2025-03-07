import type { Page } from 'playwright-crx';

export interface ScriptContext {
  page: Page;
  log: (msg: string) => void;
}

export interface ScriptDefinition {
  id: string;
  name: string;
  description: string;
  useCurrentTab?: boolean;  // If true, attach to current tab; if false or undefined, create new tab
  run: (ctx: ScriptContext) => Promise<void>;
}

export interface ScriptExecutionResult {
  success: boolean;
  error?: string;
  output?: string;
  logs: string[];
}

export interface StorageData {
  scriptSettings: Record<string, any>;  // For storing user settings for scripts
}

export interface ScriptLogUpdateMessage {
  type: 'SCRIPT_LOG_UPDATE';
  logs: string[];
}

export type ChromeMessage = ScriptLogUpdateMessage; 