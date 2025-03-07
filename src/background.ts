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
import { findScript } from './core/registry';
import { crx } from 'playwright-crx';

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
  const script = findScript(scriptId);

  if (!script) {
    return {
      success: false,
      error: `Script not found: ${scriptId}`,
      logs
    };
  }

  let crxApp;
  try {
    crxApp = await crx.start();
    
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

    await script.run(ctx);

    if (script.useCurrentTab) {
      await crxApp.detach(page);
      logs.push('Detached from tab');
    }

    return {
      success: true,
      logs
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      logs
    };
  } finally {
    if (crxApp) {
      await crxApp.close();
    }
  }
}
