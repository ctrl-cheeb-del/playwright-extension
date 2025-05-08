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
import { LLM_SYSTEM_PROMPT_FOR_AI_ACT, LLM_SYSTEM_PROMPT_FOR_DIRECT_AI } from './core/prompts';

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

// New Message Types for AI Act
interface PrepareAiActDataMessage {
  type: 'PREPARE_AI_ACT_DATA';
  command: string;
}

interface ExecutePlaywrightActionMessage {
  type: 'EXECUTE_PLAYWRIGHT_ACTION';
  actionJson: any; // This will be the JSON from the LLM { action: string, selector?: string, value?: string, url?: string, error?: string }
  originalCommand: string;
}

// This message is from background to popup
interface AiActDataReadyMessage {
  type: 'AI_ACT_DATA_READY';
  llmPrompt: string;
  originalCommand: string;
}

// New Message Type for AI Direct Mode
interface ExecuteAiDirectCommandMessage {
  type: 'EXECUTE_AI_DIRECT_COMMAND';
  prompt: string;
  token: string; // This token will be used for direct LLM API calls
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
  | GetExecutionStateMessage
  // Add new types to the union
  | PrepareAiActDataMessage
  | ExecutePlaywrightActionMessage
  | ExecuteAiDirectCommandMessage;

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
  // Add handlers for new AI Act messages
  else if (message.type === 'PREPARE_AI_ACT_DATA') {
    handlePrepareAiActData(message.command).then(sendResponse);
    return true;
  } else if (message.type === 'EXECUTE_PLAYWRIGHT_ACTION') {
    handleExecutePlaywrightAction(message.actionJson, message.originalCommand).then(sendResponse);
    return true;
  } else if (message.type === 'EXECUTE_AI_DIRECT_COMMAND') {
    handleExecuteAiDirectCommand(message.prompt, message.token, sendResponse);
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

    // Add AI fallback capability to the context
    const ctx = {
      page,
      log: (msg: string) => {
        logs.push(msg);
        updateLogs(logs);
      },
      parameters, // Pass parameters to the script context
      // New method for AI fallback
      tryWithAI: async (failedAction: string, errorMessage: string): Promise<boolean> => {
        logs.push(`🤖 Attempting to use AI to fix: "${failedAction}"`);
        logs.push(`🤖 Error was: ${errorMessage}`);
        updateLogs(logs);
        
        try {
          // Capture accessibility tree for context
          const accessibilitySnapshot = await page.accessibility.snapshot({interestingOnly: false});
          const currentUrl = await page.url();
          
          // Get API token
          const storage = await chrome.storage.local.get('aiApiKey');
          const token = storage.aiApiKey;
          
          if (!token) {
            logs.push(`🤖 AI fallback failed: No API key found in storage. Please set an API key in settings.`);
            updateLogs(logs);
            return false;
          }
          
          logs.push(`🤖 Consulting AI for help with this step...`);
          updateLogs(logs);
          
          // Create a detailed prompt for the AI
          const aiPrompt = `I'm running a Playwright script and I'm stuck on this action: "${failedAction}".
The error message is: "${errorMessage}".
Current URL: ${currentUrl}

Please help me complete this specific step by determining the correct selector or approach.`;

          // Use the AI direct command handler to execute this
          const result = await handleAiDirectFallback(aiPrompt, token, page, accessibilitySnapshot, logs);
          
          if (result.success) {
            logs.push(`🤖 AI successfully helped resolve the step!`);
            updateLogs(logs);
            return true;
          } else {
            logs.push(`🤖 AI could not resolve the issue: ${result.error}`);
            updateLogs(logs);
            return false;
          }
        } catch (aiError) {
          logs.push(`🤖 Error during AI fallback: ${aiError instanceof Error ? aiError.message : String(aiError)}`);
          updateLogs(logs);
          return false;
        }
      }
    };

    try {
      // Execute the script with our enhanced context that includes AI fallback capability
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

// New helper function for AI fallback specifically during script execution
async function handleAiDirectFallback(
  prompt: string, 
  token: string, 
  page: any,
  accessibilitySnapshot: any,
  logs: string[]
): Promise<{success: boolean, error?: string}> {
  const openAiEndpoint = 'https://api.openai.com/v1/chat/completions';
  
  try {
    logs.push(`🤖 Preparing AI fallback request...`);
    updateLogs(logs);
    
    const stringifiedTree = JSON.stringify(accessibilitySnapshot);
    
    const llmApiPayload = {
      model: "gpt-4.1-2025-04-14", 
      messages: [
        { 
          role: "system", 
          content: `${LLM_SYSTEM_PROMPT_FOR_DIRECT_AI}
          
SPECIAL INSTRUCTIONS FOR SCRIPT FALLBACK:
You are helping fix a failed Playwright script action. The user will tell you which step failed and the error message.
Focus only on the specific failing step. Don't try to rewrite the entire script.
Respond with precise actions that will overcome the immediate obstacle.
Prefer robust selectors that are less likely to break (aria attributes, text content, etc.).`
        },
        { 
          role: "user", 
          content: `Accessibility Tree (JSON):
${stringifiedTree}

User Request - Fix this Playwright script step:
"${prompt}"`
        }
      ],
      response_format: { type: "json_object" }
    };
    
    logs.push(`🤖 Sending request to AI...`);
    updateLogs(logs);
    
    const llmApiResponse = await fetch(openAiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(llmApiPayload)
    });

    if (!llmApiResponse.ok) {
      const errorBody = await llmApiResponse.text();
      logs.push(`🤖 AI API Error: ${llmApiResponse.status} ${llmApiResponse.statusText}`);
      updateLogs(logs);
      return { success: false, error: `API request failed: ${errorBody}` };
    }

    const llmResponseText = await llmApiResponse.text();
    const llmResultJson = JSON.parse(llmResponseText);
    
    if (llmResultJson.error) {
      return { success: false, error: `LLM returned an error: ${llmResultJson.error}` };
    }
    
    const actionJson = JSON.parse(llmResultJson.choices[0].message.content);
    
    logs.push(`🤖 AI suggested actions: ${JSON.stringify(actionJson)}`);
    updateLogs(logs);
    
    if (!actionJson.actions || !Array.isArray(actionJson.actions) || actionJson.actions.length === 0) {
      return { success: false, error: 'AI response missing "actions" array or actions array is empty.' };
    }
    
    // Execute the actions suggested by AI
    for (const step of actionJson.actions) {
      const { action, selector, value, url } = step;
      logs.push(`🤖 Executing AI-suggested action: ${action} ${selector ? `on ${selector}` : ''}`);
      updateLogs(logs);
      
      switch (action) {
        case 'click':
          if (!selector) throw new Error('Action "click" missing "selector".');
          await page.click(selector, { timeout: 15000 });
          logs.push(`🤖 Clicked: ${selector}`);
          break;
        case 'fill':
          if (!selector || value === undefined) throw new Error('Action "fill" missing "selector" or "value".');
          await page.fill(selector, value, { timeout: 15000 });
          logs.push(`🤖 Filled: ${selector} with "${value}"`);
          break;
        case 'navigate':
          if (!url) throw new Error('Action "navigate" missing "url".');
          await page.goto(url, { timeout: 30000 });
          logs.push(`🤖 Navigated to: ${url}`);
          break;
        case 'press':
          if (!value) throw new Error('Action "press" missing "value".');
          if (selector) {
            await page.focus(selector, { timeout: 5000 });
            logs.push(`🤖 Focused: ${selector}`);
          }
          await page.keyboard.press(value);
          logs.push(`🤖 Pressed key: ${value}`);
          break;
        case 'wait':
          const waitTime = typeof value === 'number' ? value : 1000;
          logs.push(`🤖 Waiting for ${waitTime}ms`);
          await page.waitForTimeout(waitTime);
          break;
        case 'waitForSelector':
          if (!selector) throw new Error('Action "waitForSelector" missing "selector".');
          logs.push(`🤖 Waiting for selector: ${selector}`);
          await page.waitForSelector(selector, { timeout: 15000 });
          break;
        case 'select':
          if (!selector || value === undefined) throw new Error('Action "select" missing "selector" or "value".');
          await page.selectOption(selector, value, { timeout: 15000 });
          logs.push(`🤖 Selected option: ${value} in ${selector}`);
          break;
        default:
          throw new Error(`Unknown action type from AI: "${action}".`);
      }
      updateLogs(logs);
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between actions
    }
    
    return { success: true };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logs.push(`🤖 AI fallback execution error: ${errorMessage}`);
    updateLogs(logs);
    return { success: false, error: errorMessage };
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

// --- AI Act Functionality ---

// const LLM_SYSTEM_PROMPT_FOR_AI_ACT = `...`; // Removed
// const LLM_SYSTEM_PROMPT_FOR_DIRECT_AI = `...`; // Removed

async function attachToActiveTab(crxAppInstance: any, logs: string[]): Promise<any> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab found to attach.');
  }
  const page = await crxAppInstance.attach(tab.id);
  logs.push(`Attached to active tab (ID: ${tab.id}, URL: ${tab.url})`);
  updateLogs(logs);
  return page;
}

async function handlePrepareAiActData(userCommand: string) {
  isExecuting = true;
  currentExecutionLogs = [`Preparing AI Act data for command: "${userCommand}"...`];
  updateLogs(currentExecutionLogs);

  let crxApp = null;
  try {
    crxApp = await crx.start();
    const page = await attachToActiveTab(crxApp, currentExecutionLogs);
    
    currentExecutionLogs.push('Capturing accessibility tree...');
    updateLogs(currentExecutionLogs);
    const accessibilitySnapshot = await page.accessibility.snapshot();
    // Consider potential size of snapshot. May need to stringify with truncation or a replacer if it's too big.
    const stringifiedTree = JSON.stringify(accessibilitySnapshot, null, 2); // Pretty print for readability if shown to user
    
    currentExecutionLogs.push('Accessibility tree captured.');
    updateLogs(currentExecutionLogs);

    const userPromptForLLM = `
Accessibility Tree:
${stringifiedTree}

User Instruction:
"${userCommand}"

Based on the system prompt, the accessibility tree, and the user instruction, what is the Playwright action JSON?`;

    const fullPromptForLLM = `${LLM_SYSTEM_PROMPT_FOR_AI_ACT}

${userPromptForLLM}`;

    // Send data back to popup
    chrome.runtime.sendMessage({
      type: 'AI_ACT_DATA_READY',
      llmPrompt: fullPromptForLLM,
      originalCommand: userCommand
    } as AiActDataReadyMessage);

    // No direct response needed for sendResponse here as communication is one-way to popup for this part
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    currentExecutionLogs.push(`Error preparing AI data: ${errorMessage}`);
    console.error('Error in handlePrepareAiActData:', error);
  } finally {
    if (crxApp) {
      try {
        await crxApp.close();
        currentExecutionLogs.push('CRX application closed after data preparation.');
      } catch (closeError) {
        currentExecutionLogs.push(`Error closing CRX app: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
        console.error('Error closing CRX app in handlePrepareAiActData:', closeError);
      }
    }
    isExecuting = false; // Reset execution state
    updateLogs(currentExecutionLogs); // Send final logs
  }
}

async function handleExecutePlaywrightAction(actionJson: any, originalCommand: string): Promise<ScriptExecutionResult> {
  isExecuting = true;
  currentExecutionLogs = [`Executing AI action for command: "${originalCommand}"...`, `Action JSON: ${JSON.stringify(actionJson)}`];
  updateLogs(currentExecutionLogs);

  let crxApp = null;
  let page = null;

  try {
    const { action, selector, value, url, error: llmError } = actionJson;

    if (llmError) {
      currentExecutionLogs.push(`LLM Error: ${llmError}`);
      updateLogs(currentExecutionLogs);
      return { success: false, error: llmError, logs: currentExecutionLogs };
    }

    crxApp = await crx.start();
    page = await attachToActiveTab(crxApp, currentExecutionLogs);

    switch (action) {
      case 'click':
        if (!selector) {
          throw new Error('LLM action "click" missing "selector".');
        }
        currentExecutionLogs.push(`Attempting to click: ${selector}`);
        updateLogs(currentExecutionLogs);
        await page.click(selector, { timeout: 10000 }); // Added timeout
        currentExecutionLogs.push(`Clicked element with selector: ${selector}`);
        break;
      case 'fill':
        if (!selector || value === undefined) {
          throw new Error('LLM action "fill" missing "selector" or "value".');
        }
        currentExecutionLogs.push(`Attempting to fill: ${selector} with "${value}"`);
        updateLogs(currentExecutionLogs);
        await page.fill(selector, value, { timeout: 10000 }); // Added timeout
        currentExecutionLogs.push(`Filled element with selector: ${selector}`);
        break;
      case 'navigate':
        if (!url) {
          throw new Error('LLM action "navigate" missing "url".');
        }
        currentExecutionLogs.push(`Attempting to navigate to: ${url}`);
        updateLogs(currentExecutionLogs);
        await page.goto(url, { timeout: 30000 }); // Added timeout
        currentExecutionLogs.push(`Navigated to: ${url}`);
        break;
      default:
        throw new Error(`Unknown LLM action type: "${action}". Supported actions: click, fill, navigate.`);
    }
    
    currentExecutionLogs.push('AI action executed successfully.');
    updateLogs(currentExecutionLogs);
    return { success: true, logs: currentExecutionLogs };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    currentExecutionLogs.push(`Error executing AI action: ${errorMessage}`);
    console.error('Error in handleExecutePlaywrightAction:', error);
    return { success: false, error: errorMessage, logs: currentExecutionLogs };
  } finally {
    if (page && crxApp) {
      try {
        await crxApp.detach(page);
        currentExecutionLogs.push('Detached from tab after AI action.');
      } catch (detachError) {
        currentExecutionLogs.push(`Error detaching from tab: ${detachError instanceof Error ? detachError.message : String(detachError)}`);
      }
    }
    if (crxApp) {
      try {
        await crxApp.close();
        currentExecutionLogs.push('CRX application closed after AI action execution.');
      } catch (closeError) {
        currentExecutionLogs.push(`Error closing CRX app: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
        console.error('Error closing CRX app in handleExecutePlaywrightAction:', closeError);
      }
    }
    isExecuting = false; // Reset execution state
    updateLogs(currentExecutionLogs); // Send final logs
  }
}

// Placeholder for the new AI Direct Command handler
async function handleExecuteAiDirectCommand(prompt: string, token: string, sendResponse: (response?: any) => void) {
  isExecuting = true;
  currentExecutionLogs = [`Executing AI Direct Command: "${prompt}"...`];
  updateLogs(currentExecutionLogs);

  let crxApp = null;
  let page = null;
  const openAiEndpoint = 'https://api.openai.com/v1/chat/completions'; // Configurable if needed

  try {
    crxApp = await crx.start();
    page = await attachToActiveTab(crxApp, currentExecutionLogs);
    
    currentExecutionLogs.push('Capturing accessibility tree for AI Direct Command...');
    updateLogs(currentExecutionLogs);
    const accessibilitySnapshot = await page.accessibility.snapshot({interestingOnly: false}); // Get full tree
    const stringifiedTree = JSON.stringify(accessibilitySnapshot); // No need for pretty print for API

    currentExecutionLogs.push('Requesting action from LLM...');
    updateLogs(currentExecutionLogs);

    const llmApiPayload = {
      model: "gpt-4.1-2025-04-14", 
      messages: [
        { role: "system", content: LLM_SYSTEM_PROMPT_FOR_DIRECT_AI },
        { 
          role: "user", 
          content: `Accessibility Tree (JSON):
${stringifiedTree}

User Instruction:
"${prompt}"`
        }
      ],
      response_format: { type: "json_object" } // Request JSON output if model supports it
    };

    // Log the payload being sent to the LLM
    currentExecutionLogs.push(`LLM API Payload: ${JSON.stringify(llmApiPayload, null, 2)}`); // Pretty print for console
    updateLogs(currentExecutionLogs);
    // For more detailed inspection, especially of the tree, you might log stringifiedTree separately
    // console.log("Full Accessibility Tree for LLM:", stringifiedTree); // Potentially very large!

    const llmApiResponse = await fetch(openAiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(llmApiPayload)
    });

    if (!llmApiResponse.ok) {
      const errorBody = await llmApiResponse.text(); // Use text() first to see raw error
      currentExecutionLogs.push(`LLM API Raw Error Response: ${errorBody}`); // Log raw error body
      updateLogs(currentExecutionLogs);
      throw new Error(`LLM API request failed: ${llmApiResponse.status} ${llmApiResponse.statusText} - ${errorBody}`);
    }

    const llmRawResponseText = await llmApiResponse.text(); // Get raw text first
    currentExecutionLogs.push(`LLM API Raw Response Text: ${llmRawResponseText}`);
    updateLogs(currentExecutionLogs);
    
    // Check for content and parse it
    let actionJson;
    try {
      actionJson = JSON.parse(llmRawResponseText); // Try to parse the raw text directly if it's the JSON object
      // For OpenAI, the actual JSON content is often in llmResult.choices[0].message.content
      // Let's refine this part based on typical OpenAI structure
      const llmResultJson = JSON.parse(llmRawResponseText); // First parse the whole response
      if (llmResultJson.choices && llmResultJson.choices[0] && llmResultJson.choices[0].message && llmResultJson.choices[0].message.content) {
        actionJson = JSON.parse(llmResultJson.choices[0].message.content); // Then parse the content string
      } else if (llmResultJson.error) { // Handle cases where the top-level response IS the error object
        actionJson = llmResultJson;
      } else {
        throw new Error('LLM response did not contain expected content path (e.g., choices[0].message.content) or a direct error object.');
      }
    } catch (e) {
      throw new Error(`Failed to parse LLM JSON response: ${e instanceof Error ? e.message : String(e)}. Raw text was: ${llmRawResponseText}`);
    }

    currentExecutionLogs.push(`LLM Response (parsed action JSON): ${JSON.stringify(actionJson)}`);
    updateLogs(currentExecutionLogs);

    if (actionJson.error) {
      throw new Error(`LLM returned an error: ${actionJson.error}`);
    }

    if (!actionJson.actions || !Array.isArray(actionJson.actions) || actionJson.actions.length === 0) {
      throw new Error('LLM response missing "actions" array or actions array is empty.');
    }

    // Execute actions in sequence
    for (const step of actionJson.actions) {
      const { action, selector, value, url } = step;
      currentExecutionLogs.push(`Executing action: ${action} with params: ${JSON.stringify(step)}`);
      updateLogs(currentExecutionLogs);

      switch (action) {
        case 'click':
          if (!selector) throw new Error('Action "click" missing "selector".');
          await page.click(selector, { timeout: 15000 });
          currentExecutionLogs.push(`Clicked: ${selector}`);
          break;
        case 'fill':
          if (!selector || value === undefined) throw new Error('Action "fill" missing "selector" or "value".');
          await page.fill(selector, value, { timeout: 15000 });
          currentExecutionLogs.push(`Filled: ${selector} with "${value}"`);
          break;
        case 'navigate':
          if (!url) throw new Error('Action "navigate" missing "url".');
          await page.goto(url, { timeout: 30000, waitUntil: 'networkidle' });
          currentExecutionLogs.push(`Navigated to: ${url}`);
          break;
        default:
          throw new Error(`Unknown action type from LLM: "${action}".`);
      }
      updateLogs(currentExecutionLogs);
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between actions
    }

    currentExecutionLogs.push('AI Direct Command executed successfully.');
    sendResponse({ success: true, logs: currentExecutionLogs });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in handleExecuteAiDirectCommand:', error);
    currentExecutionLogs.push(`Error executing AI Direct Command: ${errorMessage}`);
    sendResponse({ success: false, error: errorMessage, logs: currentExecutionLogs });
  } finally {
    if (page && crxApp) {
      try {
        await crxApp.detach(page);
        currentExecutionLogs.push('Detached from tab.');
      } catch (detachError) { /* ignore */ }
    }
    if (crxApp) {
      try {
        await crxApp.close();
        currentExecutionLogs.push('CRX application closed.');
      } catch (closeError) { /* ignore */ }
    }
    isExecuting = false;
    updateLogs(currentExecutionLogs); // Send final logs if any changed in finally
  }
}
