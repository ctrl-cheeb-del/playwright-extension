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
  source?: 'local' | 'remote';  // Track where the script came from
  lastUpdated?: number;  // Timestamp for when the script was last updated
  isRemote?: boolean;  // Flag to indicate if this is a remote script
}

// Remote script format (what we fetch from GitHub)
export interface RemoteScript {
  id: string;
  name: string;
  description: string;
  useCurrentTab?: boolean;
  code: string;  // The function body as a string
  scriptBody?: string;  // Alternative name for the function body
  version: number;  // Version number for tracking updates
}

export interface ScriptExecutionResult {
  success: boolean;
  error?: string;
  output?: string;
  logs: string[];
}

export interface StorageData {
  scriptSettings: Record<string, any>;  // For storing user settings for scripts
  remoteScripts: RemoteScript[];  // For storing fetched remote scripts
  lastSyncTime?: number;  // When we last synced with the remote repository
}

export interface ScriptLogUpdateMessage {
  type: 'SCRIPT_LOG_UPDATE';
  logs: string[];
}

export type ChromeMessage = ScriptLogUpdateMessage; 