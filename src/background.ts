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
import { getAvailableScripts, syncRemoteScripts } from './core/registry';
import { crx } from 'playwright-crx';

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
}

type Message = ExecuteScriptMessage;

// Handle messages from popup
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === 'EXECUTE_SCRIPT') {
    executeScript(message.scriptId).then(sendResponse);
    return true;
  }
});

async function executeScript(scriptId: string): Promise<ScriptExecutionResult> {
  const logs: string[] = [];
  
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

    const crxApp = await crx.start();
    
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
    } else {
      // Create a new tab
      page = await crxApp.newPage();
      logs.push('Created new tab');
    }

    const ctx = {
      page,
      log: (msg: string) => {
        logs.push(msg);
        chrome.runtime.sendMessage({
          type: 'SCRIPT_LOG_UPDATE',
          logs: [...logs]
        });
      }
    };

    try {
      // Execute the script with our context
      await script.run(ctx);
      logs.push(`Script ${script.name} completed successfully`);
      
      if (script.useCurrentTab) {
        await crxApp.detach(page);
        logs.push('Detached from tab');
      }
      
      return {
        success: true,
        logs
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logs.push(`Error: ${errorMessage}`);
      
      if (script.useCurrentTab) {
        try {
          await crxApp.detach(page);
          logs.push('Detached from tab');
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
      await crxApp.close();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logs.push(`Fatal error: ${errorMessage}`);
    
    return {
      success: false,
      error: errorMessage,
      logs
    };
  }
}
