import type { Page } from 'playwright-crx';

export interface ScriptContext {
  page: Page;
  log: (msg: string) => void;
  parameters?: Record<string, any>;  // Parameter values provided by the user
}

export interface ScriptParameter {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean';
  default?: string | number | boolean;
  required?: boolean;
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
  code?: string;  // The script code as a string (for interpreter execution)
  parameters?: ScriptParameter[];  // Parameters that can be configured when running the script
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
  localRecordedScripts?: SerializableScript[];  // For storing locally recorded scripts
  aiApiKey?: string; // For storing the user's AI API key
}

export interface ScriptLogUpdateMessage {
  type: 'SCRIPT_LOG_UPDATE';
  logs: string[];
}

export interface StartRecordingMessage {
  type: 'START_RECORDING';
  useCurrentTab: boolean;
}

export interface StopRecordingMessage {
  type: 'STOP_RECORDING';
}

export interface RecordingStatusUpdateMessage {
  type: 'RECORDING_STATUS_UPDATE';
  isRecording: boolean;
  actions: RecordedAction[];
  tabUrl?: string;
}

export interface GetRecordingStateMessage {
  type: 'GET_RECORDING_STATE';
}

export interface GetScriptCodeMessage {
  type: 'GET_SCRIPT_CODE';
  scriptName: string;
  scriptDescription: string;
}

export interface DiscardRecordingMessage {
  type: 'DISCARD_RECORDING';
}

export interface DeleteScriptMessage {
  type: 'DELETE_SCRIPT';
  scriptId: string;
}

export interface ExecuteScriptMessage {
  type: 'EXECUTE_SCRIPT';
  scriptId: string;
  parameters?: Record<string, any>;  // Parameter values provided by the user
}

export interface RecordedAction {
  type: string;  // 'click', 'fill', 'press', etc.
  selector?: string;
  value?: string;
  timestamp: number;  // When the action occurred
  timeSincePrevious?: number;  // Time in ms since the previous action
}

export type ChromeMessage = 
  | ScriptLogUpdateMessage
  | StartRecordingMessage
  | StopRecordingMessage
  | RecordingStatusUpdateMessage
  | GetRecordingStateMessage
  | GetScriptCodeMessage
  | DiscardRecordingMessage
  | DeleteScriptMessage
  | ExecuteScriptMessage;

// For storing scripts in storage (without the run function)
export interface SerializableScript extends Omit<ScriptDefinition, 'run'> {
  run?: undefined;
  code: string;  // The script code is required for serializable scripts
} 