/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { ScriptExecutionResult } from './core/types';
import { getAvailableScripts, syncRemoteScripts, addScript, deleteScript } from './core/registry';
import { crx } from 'playwright-crx';
import { recordingService } from './services/recording';

// Store execution logs persistently
let currentExecutionLogs: string[] = [];
let isExecuting = false;

// Sync scripts when extension is loaded
chrome.runtime.onStartup.addListener(() => {
  syncRemoteScripts();
});

// Also sync when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  syncRemoteScripts();
});

interface ExecuteScriptMessage {
  type: 'EXECUTE_SCRIPT';
  scriptId: string;
  parameters?: Record<string, any>;
}

interface StartRecordingMessage {
  type: 'START_RECORDING';
  useCurrentTab: boolean;
}

interface StopRecordingMessage {
  type: 'STOP_RECORDING';
}

interface SaveRecordedScriptMessage {
  type: 'SAVE_RECORDED_SCRIPT';
  scriptName: string;
  scriptDescription: string;
}

interface GetRecordingStateMessage {
  type: 'GET_RECORDING_STATE';
}

interface GetScriptCodeMessage {
  type: 'GET_SCRIPT_CODE';
  scriptName: string;
  scriptDescription: string;
}

interface DiscardRecordingMessage {
  type: 'DISCARD_RECORDING';
}

interface DeleteScriptMessage {
  type: 'DELETE_SCRIPT';
  scriptId: string;
}

interface GetExecutionStateMessage {
  type: 'GET_EXECUTION_STATE';
}

interface GetTraceDataMessage {
  type: 'GET_TRACE_DATA';
}

type Message = 
  | ExecuteScriptMessage 
  | StartRecordingMessage 
  | StopRecordingMessage
  | SaveRecordedScriptMessage
  | GetRecordingStateMessage
  | GetScriptCodeMessage
  | DiscardRecordingMessage
  | DeleteScriptMessage
  | GetTraceDataMessage
  | GetExecutionStateMessage;

// Handle messages from popup
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === 'EXECUTE_SCRIPT') {
    executeScript(message.scriptId, message.parameters).then(sendResponse);
    return true;
  } else if (message.type === 'START_RECORDING') {
    recordingService.startRecording(message.useCurrentTab).then(sendResponse);
    return true;
  } else if (message.type === 'STOP_RECORDING') {
    recordingService.stopRecording().then(actions => {
      sendResponse(actions);
    });
    return true;
  } else if (message.type === 'SAVE_RECORDED_SCRIPT') {
    const script = recordingService.generateScript(
      message.scriptName, 
      message.scriptDescription
    );
    addScript(script).then(() => {
      sendResponse(true);
    });
    return true;
  } else if (message.type === 'GET_RECORDING_STATE') {
    // Return the current recording state
    sendResponse(recordingService.getRecordingState());
    return true;
  } else if (message.type === 'GET_SCRIPT_CODE') {
    // Return the script code as a string for copying to clipboard
    const scriptCode = recordingService.generateCompleteScriptString(
      message.scriptName,
      message.scriptDescription
    );
    sendResponse(scriptCode);
    return true;
  } else if (message.type === 'DISCARD_RECORDING') {
    // Discard the recording
    recordingService.discardRecording().then(() => {
      sendResponse(true);
    });
    return true;
  } else if (message.type === 'DELETE_SCRIPT') {
    // Delete the script
    deleteScript(message.scriptId).then(success => {
      sendResponse(success);
    });
    return true;
  } else if (message.type === 'GET_EXECUTION_STATE') {
    // Return current execution state and logs
    sendResponse({
      isExecuting,
      logs: currentExecutionLogs
    });
    return true;
  } else if (message.type === 'GET_TRACE_DATA') {
    recordingService.getTraceData().then(traceData => {
      if (traceData) {
        // Convert Uint8Array to a plain array of numbers for serialization
        sendResponse({ success: true, data: Array.from(traceData) });
      } else {
        sendResponse({ success: false, error: 'No trace data available.' });
      }
    }).catch(error => {
      console.error('Error getting trace data:', error);
      sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
    });
    return true;
  }
});

async function executeScript(scriptId: string, parameters?: Record<string, any>): Promise<ScriptExecutionResult> {
  // Reset logs at the start of execution
  currentExecutionLogs = [];
  isExecuting = true;
  
  const logs: string[] = [];
  let crxApp = null;
  
  try {
    // Get all scripts to ensure we have the latest
    const allScripts = await getAvailableScripts();
    
    // Find the script by ID
    const script = allScripts.find(s => s.id === scriptId);
    
    if (!script) {
      return {
        success: false,
        error: `Script not found: ${scriptId}`,
        logs: [`Error: Script with ID "${scriptId}" not found`]
      };
    }
    
    logs.push(`Executing script: ${script.name}`);
    updateLogs(logs);

    // If the script has parameters, log them
    if (parameters && Object.keys(parameters).length > 0) {
      logs.push(`Using parameters: ${JSON.stringify(parameters)}`);
      updateLogs(logs);
    }

    // Try to start CRX with retry logic
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          logs.push(`Retry attempt ${attempt}/${maxRetries}...`);
          updateLogs(logs);
          // Add a delay between retries
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        crxApp = await crx.start();
        if (attempt > 0) {
          logs.push('Successfully started CRX instance');
          updateLogs(logs);
        }
        break;
      } catch (error) {
        if (error instanceof Error && error.message.includes('crxApplication is already started')) {
          if (attempt === maxRetries) {
            throw new Error('Failed to start CRX after multiple attempts');
          }
          logs.push('Detected lingering CRX instance, waiting before retry...');
          updateLogs(logs);
          continue;
        }
        throw error;
      }
    }

    // Verify crxApp was initialized
    if (!crxApp) {
      throw new Error('Failed to initialize CRX application');
    }
    
    let page;
    if (script.useCurrentTab) {
      // Get the current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error('No active tab found');
      }
      
      // Attach to the current tab
      page = await crxApp.attach(tab.id);
      logs.push('Attached to current tab');
      updateLogs(logs);
    } else {
      // Create a new tab
      page = await crxApp.newPage();
      logs.push('Created new tab');
      updateLogs(logs);
    }

    const ctx = {
      page,
      log: (msg: string) => {
        logs.push(msg);
        updateLogs(logs);
      },
      parameters // Pass parameters to the script context
    };

    try {
      // Execute the script with our context
      await script.run(ctx);
      logs.push(`Script ${script.name} completed successfully`);
      updateLogs(logs);
      
      if (script.useCurrentTab && crxApp) {
        await crxApp.detach(page);
        logs.push('Detached from tab');
        updateLogs(logs);
      }
      
      return {
        success: true,
        logs
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logs.push(`Error: ${errorMessage}`);
      updateLogs(logs);
      
      if (script.useCurrentTab && crxApp) {
        try {
          await crxApp.detach(page);
          logs.push('Detached from tab');
          updateLogs(logs);
        } catch (detachError) {
          // Ignore detach errors
        }
      }
      
      return {
        success: false,
        error: errorMessage,
        logs
      };
    } finally {
      if (crxApp) {
        try {
          await crxApp.close();
          // Add a small delay after closing to ensure it's fully cleaned up
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error('Error closing CRX:', error);
        }
      }
      isExecuting = false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logs.push(`Fatal error: ${errorMessage}`);
    updateLogs(logs);
    
    if (crxApp) {
      try {
        await crxApp.close();
        // Add a small delay after closing to ensure it's fully cleaned up
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (closeError) {
        console.error('Error closing CRX during error handling:', closeError);
      }
    }
    
    isExecuting = false;
    return {
      success: false,
      error: errorMessage,
      logs
    };
  }
}

// Helper function to update logs and notify popup
function updateLogs(logs: string[]) {
  currentExecutionLogs = [...logs];
  chrome.runtime.sendMessage({
    type: 'SCRIPT_LOG_UPDATE',
    logs: currentExecutionLogs,
    isExecuting
  });
}
