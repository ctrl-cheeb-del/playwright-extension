import type { RecordedAction, ScriptDefinition, ScriptExecutionResult } from './core/types';
import { getAvailableScripts, syncRemoteScripts } from './core/registry';
import { storageService } from './services/storage';

// Define AiActDataReadyMessage interface here for popup.ts to understand it
/*
interface AiActDataReadyMessage {
  type: 'AI_ACT_DATA_READY';
  llmPrompt: string;
  originalCommand: string;
}
*/

class PopupUI {
  private scriptsList: HTMLDivElement;
  private logsContainer: HTMLDivElement;
  private logsContent: HTMLPreElement;
  private logsToggle: HTMLDivElement;
  private syncButton: HTMLButtonElement;
  private recordButton: HTMLButtonElement;
  private recordingModal: HTMLDivElement;
  private recordingOptions: HTMLDivElement;
  private recordingStatus: HTMLDivElement;
  private saveRecordingForm: HTMLDivElement;
  private startRecordingBtn: HTMLButtonElement;
  private stopRecordingBtn: HTMLButtonElement;
  private copyScriptBtn: HTMLButtonElement;
  private saveScriptBtn: HTMLButtonElement;
  private closeRecordingModalBtn: HTMLButtonElement;
  private actionsCount: HTMLSpanElement;
  private actionsSummary: HTMLSpanElement;
  private scriptName: HTMLInputElement;
  private scriptDescription: HTMLInputElement;
  private recordingModalTitle: HTMLHeadingElement;
  private parametersModal: HTMLDivElement | null = null;
  private downloadTraceBtn: HTMLButtonElement;
  
  // New UI elements for AI Act -- REMOVING
  /*
  private aiCommandInput: HTMLInputElement;
  private prepareAiDataBtn: HTMLButtonElement;
  private aiLlmInteractionSection: HTMLDivElement;
  private llmPromptDisplay: HTMLTextAreaElement;
  private llmActionJsonInput: HTMLInputElement;
  private executeLlmActionBtn: HTMLButtonElement;
  */

  // New UI elements for AI Direct Mode
  private aiModeToggle: HTMLInputElement;
  private scriptsContainer: HTMLDivElement;
  private aiDirectModeSection: HTMLDivElement;
  // private aiActExperimentalSection: HTMLDivElement; -- REMOVING
  private aiDirectPromptInput: HTMLTextAreaElement;
  private executeAiDirectBtn: HTMLButtonElement;

  // Settings Elements
  private settingsButton: HTMLButtonElement;
  private settingsSection: HTMLDivElement;
  private apiKeyInput: HTMLInputElement;
  private saveApiKeyBtn: HTMLButtonElement;
  private closeSettingsBtn: HTMLButtonElement;
  private apiKeyStatus: HTMLParagraphElement;
  private settingsHint: HTMLParagraphElement;
  private goToSettingsBtn: HTMLButtonElement;
  
  private scripts: ScriptDefinition[] = [];
  private isSyncing = false;
  private isRecording = false;
  private recordedActions: RecordedAction[] = [];
  private isExecuting = false;

  constructor() {
    this.scriptsList = document.getElementById('scriptsList') as HTMLDivElement;
    this.logsContainer = document.getElementById('logsContainer') as HTMLDivElement;
    this.logsContent = document.getElementById('logsContent') as HTMLPreElement;
    this.logsToggle = document.getElementById('logsToggle') as HTMLDivElement;
    this.syncButton = document.getElementById('syncButton') as HTMLButtonElement;
    this.recordButton = document.getElementById('recordButton') as HTMLButtonElement;
    this.recordingModal = document.getElementById('recordingModal') as HTMLDivElement;
    this.recordingOptions = document.getElementById('recordingOptions') as HTMLDivElement;
    this.recordingStatus = document.getElementById('recordingStatus') as HTMLDivElement;
    this.saveRecordingForm = document.getElementById('saveRecordingForm') as HTMLDivElement;
    this.startRecordingBtn = document.getElementById('startRecordingBtn') as HTMLButtonElement;
    this.stopRecordingBtn = document.getElementById('stopRecordingBtn') as HTMLButtonElement;
    this.copyScriptBtn = document.getElementById('copyScriptBtn') as HTMLButtonElement;
    this.saveScriptBtn = document.getElementById('saveScriptBtn') as HTMLButtonElement;
    this.closeRecordingModalBtn = document.getElementById('closeRecordingModalBtn') as HTMLButtonElement;
    this.actionsCount = document.getElementById('actionsCount') as HTMLSpanElement;
    this.actionsSummary = document.getElementById('actionsSummary') as HTMLSpanElement;
    this.scriptName = document.getElementById('scriptName') as HTMLInputElement;
    this.scriptDescription = document.getElementById('scriptDescription') as HTMLInputElement;
    this.recordingModalTitle = document.getElementById('recordingModalTitle') as HTMLHeadingElement;
    this.downloadTraceBtn = document.getElementById('downloadTraceBtn') as HTMLButtonElement;

    // Initialize new AI Act UI elements -- REMOVING
    /*
    this.aiCommandInput = document.getElementById('aiCommandInput') as HTMLInputElement;
    this.prepareAiDataBtn = document.getElementById('prepareAiDataBtn') as HTMLButtonElement;
    this.aiLlmInteractionSection = document.getElementById('aiLlmInteractionSection') as HTMLDivElement;
    this.llmPromptDisplay = document.getElementById('llmPromptDisplay') as HTMLTextAreaElement;
    this.llmActionJsonInput = document.getElementById('llmActionJsonInput') as HTMLInputElement;
    this.executeLlmActionBtn = document.getElementById('executeLlmActionBtn') as HTMLButtonElement;
    */

    // Initialize new AI Direct Mode UI elements
    this.aiModeToggle = document.getElementById('aiModeToggle') as HTMLInputElement;
    this.scriptsContainer = document.getElementById('scriptsContainer') as HTMLDivElement;
    this.aiDirectModeSection = document.getElementById('aiDirectModeSection') as HTMLDivElement;
    // this.aiActExperimentalSection = document.getElementById('aiActExperimentalSection') as HTMLDivElement; -- REMOVING
    this.aiDirectPromptInput = document.getElementById('aiDirectPromptInput') as HTMLTextAreaElement;
    this.executeAiDirectBtn = document.getElementById('executeAiDirectBtn') as HTMLButtonElement;

    // Initialize Settings UI elements
    this.settingsButton = document.getElementById('settingsButton') as HTMLButtonElement;
    this.settingsSection = document.getElementById('settingsSection') as HTMLDivElement;
    this.apiKeyInput = document.getElementById('apiKeyInput') as HTMLInputElement;
    this.saveApiKeyBtn = document.getElementById('saveApiKeyBtn') as HTMLButtonElement;
    this.closeSettingsBtn = document.getElementById('closeSettingsBtn') as HTMLButtonElement;
    this.apiKeyStatus = document.getElementById('apiKeyStatus') as HTMLParagraphElement;
    this.settingsHint = document.querySelector('.settings-hint') as HTMLParagraphElement;
    this.goToSettingsBtn = document.getElementById('goToSettingsBtn') as HTMLButtonElement;

    this.initializeEventListeners();
    
    // Check if recording is in progress when popup opens
    this.checkRecordingState();
    
    // Always force sync when opening popup
    this.loadScripts(true);

    // Check for existing execution state when popup opens
    this.checkExecutionState();

    this.loadInitialSettings();
  }

  private async loadScripts(forceSync = false) {
    try {
      // Get all scripts (local + remote)
      this.scripts = await getAvailableScripts(forceSync);
      this.renderScriptsList(this.scripts);
    } catch (error) {
      this.showLogs([`Error loading scripts: ${error instanceof Error ? error.message : String(error)}`], true);
    }
  }

  private renderScriptsList(scripts: ScriptDefinition[]) {
    this.scriptsList.innerHTML = '';
    
    scripts.forEach((script, index) => {
      // Add a small delay to each item for a staggered animation effect
      setTimeout(() => {
        const scriptElement = document.createElement('div');
        scriptElement.className = 'script-item';
        
        // Add a badge for remote scripts
        const sourceBadge = script.source === 'remote' 
          ? '<span class="badge remote-badge">Remote</span>' 
          : '';
        
        // Only show delete button for locally recorded scripts (not remote scripts or built-in scripts)
        const deleteButton = script.source === 'local' && !script.isRemote
          ? `<button class="secondary-button delete-script" data-id="${script.id}" title="Delete script">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"></path>
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
              </svg>
            </button>`
          : '';
        
        scriptElement.innerHTML = `
          <div class="script-info">
            <strong>${script.name} ${sourceBadge}</strong>
            <small>${script.description}</small>
          </div>
          <div class="script-actions">
            <button class="primary-button run-script" data-id="${script.id}">Run</button>
            ${deleteButton}
          </div>
        `;
        this.scriptsList.appendChild(scriptElement);
      }, index * 50); // Stagger each item by 50ms
    });
    
    // Add event listeners for delete buttons
    setTimeout(() => {
      const deleteButtons = document.querySelectorAll('.delete-script');
      deleteButtons.forEach(button => {
        button.addEventListener('click', (event) => {
          event.stopPropagation(); // Prevent bubbling to parent elements
          const scriptId = (button as HTMLElement).dataset.id;
          if (scriptId) {
            this.deleteScript(scriptId);
          }
        });
      });
    }, scripts.length * 50 + 100); // Add a little extra time to ensure all items are rendered
  }

  private showLogs(logs: string[], isComplete = false) {
    // Make sure logs are not empty
    if (!logs || logs.length === 0) {
      logs = ['No logs available'];
    }
    
    this.logsContent.textContent = logs.join('\n');
    this.logsContent.scrollTop = this.logsContent.scrollHeight;
    
    // Show the logs toggle button if not already visible
    if (!this.logsToggle.classList.contains('visible')) {
      this.logsToggle.classList.add('visible');
    }
    
    // Always show logs container when logs are updated
    this.logsContainer.classList.add('active');
    
    // If logs are complete and container is not active, show a notification effect
    if (isComplete && !this.isExecuting) {
      this.logsToggle.classList.add('pulse');
      setTimeout(() => this.logsToggle.classList.remove('pulse'), 1000);
    }
  }

  private toggleLogs() {
    this.logsContainer.classList.toggle('active');
  }

  private async syncScripts() {
    if (this.isSyncing) return;
    
    this.isSyncing = true;
    this.syncButton.classList.add('syncing');
    
    try {
      await syncRemoteScripts();
      this.scripts = await getAvailableScripts(true);
      this.renderScriptsList(this.scripts);
    } catch (error) {
      this.showLogs([`Error syncing scripts: ${error instanceof Error ? error.message : String(error)}`], true);
    } finally {
      this.isSyncing = false;
      this.syncButton.classList.remove('syncing');
    }
  }

  private initializeEventListeners() {
    // Listen for script execution updates
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'SCRIPT_LOG_UPDATE') {
        this.isExecuting = message.isExecuting;
        this.showLogs(message.logs, !message.isExecuting);
      }
      // Add listener for AI_ACT_DATA_READY -- REMOVING
      /*
      else if (message.type === 'AI_ACT_DATA_READY') {
        const aiMessage = message as AiActDataReadyMessage; // Cast to the correct type
        this.handleAiActDataReady(aiMessage.llmPrompt, aiMessage.originalCommand);
      }
      */
      return true;
    });

    // Sync button
    this.syncButton.addEventListener('click', () => {
      this.syncScripts();
    });

    // Record button
    this.recordButton.addEventListener('click', () => {
      this.openRecordingModal();
    });

    // Close recording modal
    this.closeRecordingModalBtn.addEventListener('click', () => {
      if (this.isRecording) {
        this.stopRecording();
      } else {
        // Clear the recorded actions
        this.recordedActions = [];
        
        // Reset the recording state in the background service
        chrome.runtime.sendMessage({
          type: 'DISCARD_RECORDING'
        });
        
        // Close the modal
        this.closeRecordingModal();
      }
    });

    // Start recording button
    this.startRecordingBtn.addEventListener('click', () => {
      const useCurrentTab = (document.querySelector('input[name="tabOption"]:checked') as HTMLInputElement)?.value === 'current';
      this.startRecording(useCurrentTab);
    });

    // Stop recording button
    this.stopRecordingBtn.addEventListener('click', () => {
      this.stopRecording();
    });

    // Copy script button
    this.copyScriptBtn.addEventListener('click', () => {
      this.copyScriptToClipboard();
    });

    // Save script button
    this.saveScriptBtn.addEventListener('click', () => {
      this.saveRecordedScript();
    });

    // Download trace button
    this.downloadTraceBtn.addEventListener('click', () => {
      this.downloadTraceFile();
    });

    // Listen for recording status updates
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'RECORDING_STATUS_UPDATE') {
        this.isRecording = message.isRecording;
        this.recordedActions = message.actions;
        this.updateRecordingUI();
        
        // Update the tab URL if available
        if (message.tabUrl) {
          this.updateRecordingTabInfo(message.tabUrl);
        }
      } else if (message.type === 'SCRIPT_LOG_UPDATE') {
        this.showLogs(message.logs);
      }
    });

    // Close logs button
    document.getElementById('closeLogsBtn')?.addEventListener('click', () => {
      this.logsContainer.classList.remove('active');
    });

    // Logs toggle
    this.logsToggle.addEventListener('click', () => {
      this.toggleLogs();
    });

    // Delegate click events for script actions
    this.scriptsList.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      if (!target.matches('button')) return;

      const scriptId = target.getAttribute('data-id');
      if (!scriptId) return;

      console.log(`Running script with ID: ${scriptId}`);
      
      if (target.matches('.run-script')) {
        // Add a running indicator to the button
        const button = target as HTMLButtonElement;
        const originalText = button.textContent;
        
        // Find the script
        const script = this.scripts.find(s => s.id === scriptId);
        
        if (script && script.parameters && script.parameters.length > 0) {
          // If the script has parameters, show the parameters modal
          this.showParametersModal(script, button);
        } else {
          // If no parameters, run the script directly
          button.innerHTML = '<span class="status-indicator running"></span>Running...';
          button.disabled = true;
          
          // Show logs container immediately with initial message
          this.showLogs([`Starting script execution for script ID: ${scriptId}...`]);
          
          try {
            const result = await this.runScript(scriptId);
            
            // Update button to show success/error
            if (result.success) {
              button.innerHTML = '<span class="status-indicator success"></span>Success';
            } else {
              button.innerHTML = '<span class="status-indicator error"></span>Failed';
            }
            
            // Reset button after 2 seconds
            setTimeout(() => {
              button.innerHTML = originalText || 'Run';
              button.disabled = false;
            }, 2000);
            
          } catch (error) {
            console.error('Error running script:', error);
            this.showLogs([`Error running script: ${error instanceof Error ? error.message : String(error)}`], true);
            
            button.innerHTML = '<span class="status-indicator error"></span>Error';
            setTimeout(() => {
              button.innerHTML = originalText || 'Run';
              button.disabled = false;
            }, 2000);
          }
        }
      }
    });

    // AI Act Button Listeners -- REMOVING
    /*
    if (this.prepareAiDataBtn) {
      this.prepareAiDataBtn.addEventListener('click', () => {
        this.prepareAiActData();
      });
    }

    if (this.executeLlmActionBtn) {
      this.executeLlmActionBtn.addEventListener('click', () => {
        this.executeLlmAction();
      });
    }
    */

    // AI Mode Toggle Listener
    if (this.aiModeToggle) {
      this.aiModeToggle.addEventListener('change', () => {
        this.toggleAiModeDisplay(this.aiModeToggle.checked);
      });
    }

    // AI Direct Mode Button Listener
    if (this.executeAiDirectBtn) {
      this.executeAiDirectBtn.addEventListener('click', () => {
        this.executeAiDirectCommand();
      });
    }

    // Settings Button Listener
    if (this.settingsButton) {
      this.settingsButton.addEventListener('click', () => {
        this.showSettingsSection();
      });
    }

    // Go To Settings Button (in hint) Listener
    if (this.goToSettingsBtn) {
      this.goToSettingsBtn.addEventListener('click', () => {
        this.showSettingsSection();
      });
    }

    // Save API Key Button Listener
    if (this.saveApiKeyBtn) {
      this.saveApiKeyBtn.addEventListener('click', async () => {
        await this.saveApiKey();
      });
    }

    // Close Settings Button Listener
    if (this.closeSettingsBtn) {
      this.closeSettingsBtn.addEventListener('click', () => {
        this.hideSettingsSection();
      });
    }
  }

  private openRecordingModal() {
    // Reset the modal state
    this.recordingOptions.style.display = 'block';
    this.recordingStatus.style.display = 'none';
    this.saveRecordingForm.style.display = 'none';
    this.recordingModalTitle.textContent = 'Start Recording';
    this.downloadTraceBtn.style.display = 'none';
    
    // Reset recording tab info
    const recordingTabInfo = document.getElementById('recordingTabInfo');
    if (recordingTabInfo) {
      recordingTabInfo.textContent = '';
      recordingTabInfo.style.display = 'none';
    }
    
    // Show the modal
    this.recordingModal.classList.add('active');
  }

  private closeRecordingModal() {
    this.recordingModal.classList.remove('active');
  }

  private async startRecording(useCurrentTab: boolean) {
    try {
      const success = await chrome.runtime.sendMessage({
        type: 'START_RECORDING',
        useCurrentTab
      });

      if (success) {
        this.isRecording = true;
        this.recordedActions = [];
        this.updateRecordingUI();
        
        // If using current tab, close the popup to let the user interact with the page
        if (useCurrentTab) {
          window.close();
        }
      } else {
        // Show error in the UI instead of an alert
        this.startRecordingBtn.textContent = 'Failed to start';
        this.startRecordingBtn.classList.add('error');
        
        // Reset button after 2 seconds
        setTimeout(() => {
          this.startRecordingBtn.textContent = 'Start Recording';
          this.startRecordingBtn.classList.remove('error');
        }, 2000);
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      // Show error in the UI instead of an alert
      this.startRecordingBtn.textContent = 'Error';
      this.startRecordingBtn.classList.add('error');
      
      // Reset button after 2 seconds
      setTimeout(() => {
        this.startRecordingBtn.textContent = 'Start Recording';
        this.startRecordingBtn.classList.remove('error');
      }, 2000);
    }
  }

  private async stopRecording() {
    try {
      const actions = await chrome.runtime.sendMessage({
        type: 'STOP_RECORDING'
      });

      this.isRecording = false;
      this.recordedActions = actions;
      this.updateRecordingUI();
      
      // Set default name and description
      const timestamp = new Date().toLocaleString();
      this.scriptName.value = `Recorded Script ${timestamp}`;
      this.scriptDescription.value = `Script recorded on ${timestamp}`;
    } catch (error) {
      console.error('Error stopping recording:', error);
      // Show error in the UI instead of an alert
      this.stopRecordingBtn.textContent = 'Error';
      this.stopRecordingBtn.classList.add('error');
      
      // Reset button after 2 seconds
      setTimeout(() => {
        this.stopRecordingBtn.textContent = 'Stop Recording';
        this.stopRecordingBtn.classList.remove('error');
      }, 2000);
    }
  }

  private updateRecordingUI() {
    // Reset recording tab info display
    const recordingTabInfo = document.getElementById('recordingTabInfo');
    if (recordingTabInfo) {
      recordingTabInfo.style.display = this.isRecording ? 'block' : 'none';
    }
    
    if (this.isRecording) {
      // Show recording status
      this.recordingOptions.style.display = 'none';
      this.recordingStatus.style.display = 'block';
      this.saveRecordingForm.style.display = 'none';
      this.recordingModalTitle.textContent = 'Recording in Progress';
      this.downloadTraceBtn.style.display = 'none';
    } else if (this.recordedActions.length > 0) {
      // Show copy form
      this.recordingOptions.style.display = 'none';
      this.recordingStatus.style.display = 'none';
      this.saveRecordingForm.style.display = 'block';
      this.recordingModalTitle.textContent = 'Recording Complete';
      this.downloadTraceBtn.style.display = 'block';
    } else {
      // Show options
      this.recordingOptions.style.display = 'block';
      this.recordingStatus.style.display = 'none';
      this.saveRecordingForm.style.display = 'none';
      this.recordingModalTitle.textContent = 'Start Recording';
      this.downloadTraceBtn.style.display = 'none';
    }
    
    // Update action counts
    this.actionsCount.textContent = this.recordedActions.length.toString();
    this.actionsSummary.textContent = this.recordedActions.length.toString();
  }

  private async runScript(scriptId: string, parameters?: Record<string, any>): Promise<ScriptExecutionResult> {
    try {
      console.log(`Sending message to execute script: ${scriptId}`);
      
      const result = await chrome.runtime.sendMessage({
        type: 'EXECUTE_SCRIPT',
        scriptId,
        parameters
      }) as ScriptExecutionResult;

      console.log(`Received execution result:`, result);
      
      // If logs are empty, add a default message
      if (!result.logs || result.logs.length === 0) {
        result.logs = result.success 
          ? ['Script executed successfully but no logs were generated.'] 
          : [`Script failed: ${result.error || 'Unknown error'}`];
      }
      
      this.showLogs(result.logs, true);
      return result;
    } catch (error) {
      console.error('Failed to execute script:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.showLogs([`Error: ${errorMessage}`], true);
      
      return {
        success: false,
        error: errorMessage,
        logs: [`Error: ${errorMessage}`]
      };
    }
  }

  private async checkRecordingState() {
    try {
      const state = await chrome.runtime.sendMessage({
        type: 'GET_RECORDING_STATE'
      });
      
      if (state) {
        this.isRecording = state.isRecording;
        this.recordedActions = state.actions;
        
        // Update UI based on recording state
        if (this.isRecording || this.recordedActions.length > 0) {
          this.openRecordingModal();
          this.updateRecordingUI();
          
          // If recording is in progress, show the tab URL
          if (this.isRecording && state.tabUrl) {
            this.updateRecordingTabInfo(state.tabUrl);
          }
        }
      }
    } catch (error) {
      console.error('Error checking recording state:', error);
    }
  }
  
  private updateRecordingTabInfo(url: string) {
    const recordingTabInfo = document.getElementById('recordingTabInfo');
    if (recordingTabInfo) {
      recordingTabInfo.textContent = `Recording in: ${url}`;
      recordingTabInfo.style.display = 'block';
    }
  }

  private async copyScriptToClipboard() {
    try {
      const name = this.scriptName.value.trim() || `Recorded Script ${new Date().toLocaleString()}`;
      const description = this.scriptDescription.value.trim() || `Script recorded on ${new Date().toLocaleString()}`;
      
      // Get the script code from the background service
      const scriptCode = await chrome.runtime.sendMessage({
        type: 'GET_SCRIPT_CODE',
        scriptName: name,
        scriptDescription: description
      });
      
      // Copy to clipboard
      await navigator.clipboard.writeText(scriptCode);
      
      // Show success message in the UI (not an alert)
      const copyBtn = this.copyScriptBtn;
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      copyBtn.disabled = true;
      
      // Reset button after 2 seconds
      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.disabled = false;
      }, 2000);
    } catch (error) {
      console.error('Error copying script to clipboard:', error);
      // Show error in the UI instead of an alert
      const copyBtn = this.copyScriptBtn;
      copyBtn.textContent = 'Error!';
      copyBtn.classList.add('error');
      
      // Reset button after 2 seconds
      setTimeout(() => {
        copyBtn.textContent = 'Copy Script';
        copyBtn.classList.remove('error');
      }, 2000);
    }
  }

  private async saveRecordedScript() {
    try {
      const name = this.scriptName.value.trim() || `Recorded Script ${new Date().toLocaleString()}`;
      const description = this.scriptDescription.value.trim() || `Script recorded on ${new Date().toLocaleString()}`;
      
      // Save the script via the background service
      const success = await chrome.runtime.sendMessage({
        type: 'SAVE_RECORDED_SCRIPT',
        scriptName: name,
        scriptDescription: description
      });
      
      if (success) {
        // Show success message in the UI
        const saveBtn = this.saveScriptBtn;
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'Saved!';
        saveBtn.disabled = true;
        
        // Reset button after 2 seconds
        setTimeout(() => {
          saveBtn.textContent = originalText;
          saveBtn.disabled = false;
          
          // Close the recording modal and refresh the scripts list
          this.closeRecordingModal();
          this.loadScripts(true);
        }, 2000);
      }
    } catch (error) {
      console.error('Error saving script:', error);
      
      // Show error in the UI
      const saveBtn = this.saveScriptBtn;
      const originalText = saveBtn.textContent;
      saveBtn.textContent = 'Error!';
      saveBtn.classList.add('error');
      
      // Reset button after 2 seconds
      setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.classList.remove('error');
      }, 2000);
    }
  }

  private async deleteScript(scriptId: string) {
    try {
      // Find the script element in the DOM
      const scriptElement = document.querySelector(`.script-item button[data-id="${scriptId}"]`)?.closest('.script-item') as HTMLElement;
      if (!scriptElement) return;
      
      // Show deletion in progress
      const deleteButton = scriptElement.querySelector('.delete-script') as HTMLButtonElement;
      if (!deleteButton) return;
      
      const originalContent = deleteButton.innerHTML;
      deleteButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="deleting-icon">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
        </svg>
      `;
      deleteButton.disabled = true;
      
      // Send delete request to background
      const success = await chrome.runtime.sendMessage({
        type: 'DELETE_SCRIPT',
        scriptId
      });

      if (success) {
        // Animate the removal of the script element
        scriptElement.style.transition = 'all 0.3s ease';
        scriptElement.style.opacity = '0';
        scriptElement.style.height = '0';
        scriptElement.style.overflow = 'hidden';
        
        // After animation, remove the element and refresh the list
        setTimeout(() => {
          scriptElement.remove();
          this.loadScripts(true);
        }, 300);
      } else {
        // Show error state
        deleteButton.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        `;
        deleteButton.classList.add('error');
        
        // Reset after 2 seconds
        setTimeout(() => {
          deleteButton.innerHTML = originalContent;
          deleteButton.classList.remove('error');
          deleteButton.disabled = false;
        }, 2000);
      }
    } catch (error) {
      console.error('Error deleting script:', error);
      
      // Find the script element and show error state
      const deleteButton = document.querySelector(`.script-item button[data-id="${scriptId}"]`) as HTMLButtonElement;
      if (deleteButton) {
        deleteButton.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        `;
        deleteButton.classList.add('error');
        
        // Reset after 2 seconds
        setTimeout(() => {
          deleteButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            </svg>
          `;
          deleteButton.classList.remove('error');
          deleteButton.disabled = false;
        }, 2000);
      }
    }
  }

  // Create and show a modal for entering script parameters
  private showParametersModal(script: ScriptDefinition, runButton: HTMLButtonElement) {
    // Create the modal if it doesn't exist
    if (!this.parametersModal) {
      this.parametersModal = document.createElement('div');
      this.parametersModal.className = 'modal parameters-modal';
      document.body.appendChild(this.parametersModal);
    }
    
    // Clear any existing content
    this.parametersModal.innerHTML = '';
    
    // Create the modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    // Add a header
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
      <h3>Configure Parameters for "${script.name}"</h3>
      <button class="close-button" id="closeParametersBtn">&times;</button>
    `;
    modalContent.appendChild(header);
    
    // Add a form for the parameters
    const form = document.createElement('form');
    form.id = 'parametersForm';
    
    // Add fields for each parameter
    script.parameters?.forEach(param => {
      const formGroup = document.createElement('div');
      formGroup.className = 'form-group';
      
      const label = document.createElement('label');
      label.setAttribute('for', `param-${param.name}`);
      label.textContent = param.name;
      
      const description = document.createElement('small');
      description.textContent = param.description;
      
      const input = document.createElement('input');
      input.id = `param-${param.name}`;
      input.name = param.name;
      
      // Set input type based on parameter type
      if (param.type === 'number') {
        input.type = 'number';
      } else if (param.type === 'boolean') {
        input.type = 'checkbox';
      } else {
        input.type = 'text';
      }
      
      // Set default value if available
      if (param.default !== undefined) {
        if (param.type === 'boolean') {
          (input as HTMLInputElement).checked = Boolean(param.default);
        } else {
          input.value = String(param.default);
        }
      }
      
      // Mark required fields
      if (param.required) {
        input.required = true;
        label.innerHTML += ' <span class="required">*</span>';
      }
      
      formGroup.appendChild(label);
      formGroup.appendChild(description);
      formGroup.appendChild(input);
      form.appendChild(formGroup);
    });
    
    // Add buttons
    const buttons = document.createElement('div');
    buttons.className = 'modal-buttons';
    
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'secondary-button';
    cancelButton.textContent = 'Cancel';
    cancelButton.id = 'cancelParametersBtn';
    
    const runWithParamsButton = document.createElement('button');
    runWithParamsButton.type = 'submit';
    runWithParamsButton.className = 'primary-button';
    runWithParamsButton.textContent = 'Run Script';
    
    buttons.appendChild(cancelButton);
    buttons.appendChild(runWithParamsButton);
    form.appendChild(buttons);
    
    modalContent.appendChild(form);
    this.parametersModal.appendChild(modalContent);
    
    // Show the modal
    this.parametersModal.classList.add('active');
    
    // Add event listeners
    document.getElementById('closeParametersBtn')?.addEventListener('click', () => {
      this.parametersModal?.classList.remove('active');
    });
    
    document.getElementById('cancelParametersBtn')?.addEventListener('click', () => {
      this.parametersModal?.classList.remove('active');
    });
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Collect parameter values
      const parameters: Record<string, any> = {};
      
      script.parameters?.forEach(param => {
        const input = document.getElementById(`param-${param.name}`) as HTMLInputElement;
        
        if (param.type === 'number') {
          parameters[param.name] = input.value ? Number(input.value) : undefined;
        } else if (param.type === 'boolean') {
          parameters[param.name] = input.checked;
        } else {
          parameters[param.name] = input.value;
        }
      });
      
      // Close the modal
      this.parametersModal?.classList.remove('active');
      
      // Update the run button
      const originalText = runButton.textContent;
      runButton.innerHTML = '<span class="status-indicator running"></span>Running...';
      runButton.disabled = true;
      
      // Show logs container with initial message
      this.showLogs([`Starting script execution for script ID: ${script.id} with parameters: ${JSON.stringify(parameters)}...`]);
      
      try {
        const result = await this.runScript(script.id, parameters);
        
        // Update button to show success/error
        if (result.success) {
          runButton.innerHTML = '<span class="status-indicator success"></span>Success';
        } else {
          runButton.innerHTML = '<span class="status-indicator error"></span>Failed';
        }
        
        // Reset button after 2 seconds
        setTimeout(() => {
          runButton.innerHTML = originalText || 'Run';
          runButton.disabled = false;
        }, 2000);
        
      } catch (error) {
        console.error('Error running script:', error);
        this.showLogs([`Error running script: ${error instanceof Error ? error.message : String(error)}`], true);
        
        runButton.innerHTML = '<span class="status-indicator error"></span>Error';
        setTimeout(() => {
          runButton.innerHTML = originalText || 'Run';
          runButton.disabled = false;
        }, 2000);
      }
    });
  }

  private async checkExecutionState() {
    try {
      const state = await chrome.runtime.sendMessage({
        type: 'GET_EXECUTION_STATE'
      });
      
      if (state) {
        this.isExecuting = state.isExecuting;
        if (state.logs && state.logs.length > 0) {
          this.showLogs(state.logs, !state.isExecuting);
        }
      }
    } catch (error) {
      console.error('Error checking execution state:', error);
    }
  }

  private async downloadTraceFile() {
    this.downloadTraceBtn.disabled = true;
    this.downloadTraceBtn.textContent = 'Downloading...';

    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_TRACE_DATA' });

      if (response && response.success && response.data) {
        const traceDataArray = response.data as number[];
        const traceDataUint8Array = new Uint8Array(traceDataArray);
        const blob = new Blob([traceDataUint8Array], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'trace.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.downloadTraceBtn.textContent = 'Downloaded!';
        setTimeout(() => {
          this.downloadTraceBtn.textContent = 'Download Trace';
          this.downloadTraceBtn.disabled = false;
        }, 2000);
      } else {
        console.error('Failed to download trace data:', response?.error);
        this.downloadTraceBtn.textContent = 'Error!';
        this.downloadTraceBtn.classList.add('error');
        setTimeout(() => {
          this.downloadTraceBtn.textContent = 'Download Trace';
          this.downloadTraceBtn.classList.remove('error');
          this.downloadTraceBtn.disabled = false;
        }, 2000);
      }
    } catch (error) {
      console.error('Error downloading trace file:', error);
      this.downloadTraceBtn.textContent = 'Error!';
      this.downloadTraceBtn.classList.add('error');
      setTimeout(() => {
        this.downloadTraceBtn.textContent = 'Download Trace';
        this.downloadTraceBtn.classList.remove('error');
        this.downloadTraceBtn.disabled = false;
      }, 2000);
    }
  }

  // --- AI Act Methods --- -- REMOVING ENTIRE BLOCK
  /*
  private prepareAiActData() {
    const command = this.aiCommandInput.value.trim();
    if (!command) {
      this.showLogs(['Please enter a command for the AI.'], true);
      // Optionally, briefly highlight the input field or show a small error message next to it.
      this.aiCommandInput.focus();
      return;
    }

    this.prepareAiDataBtn.disabled = true;
    this.prepareAiDataBtn.textContent = 'Preparing...';
    this.aiLlmInteractionSection.style.display = 'none'; // Hide section while preparing
    this.showLogs([`Sending command to background for AI preparation: "${command}"`]);

    chrome.runtime.sendMessage({
      type: 'PREPARE_AI_ACT_DATA',
      command
    });
  }

  private handleAiActDataReady(llmPrompt: string, _originalCommand: string) {
    this.llmPromptDisplay.value = llmPrompt;
    // Store original command if needed for executeLlmAction, e.g., on a data attribute or a class member
    // For simplicity, executeLlmAction can re-read from aiCommandInput or we can pass it along.
    // Let's assume originalCommand is mainly for context in logs from background.

    this.aiLlmInteractionSection.style.display = 'block';
    this.llmActionJsonInput.value = ''; // Clear previous JSON
    this.prepareAiDataBtn.disabled = false;
    this.prepareAiDataBtn.textContent = 'Prepare for AI';
    this.showLogs(['Data ready for LLM. Please copy the prompt, get the action JSON, and paste it below.'], true);
    this.llmPromptDisplay.focus(); // Focus on prompt for easy copying
  }

  private executeLlmAction() {
    const actionJsonString = this.llmActionJsonInput.value.trim();
    const originalCommand = this.aiCommandInput.value.trim(); // Get command again for context

    if (!actionJsonString) {
      this.showLogs(['Please paste the LLM Action JSON.'], true);
      this.llmActionJsonInput.focus();
      return;
    }

    let actionJson;
    try {
      actionJson = JSON.parse(actionJsonString);
    } catch (error) {
      this.showLogs([`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`], true);
      this.llmActionJsonInput.focus();
      return;
    }

    this.executeLlmActionBtn.disabled = true;
    this.executeLlmActionBtn.textContent = 'Executing...';
    this.showLogs([`Sending LLM action to background: ${actionJsonString}`]);

    chrome.runtime.sendMessage({
      type: 'EXECUTE_PLAYWRIGHT_ACTION',
      actionJson,
      originalCommand // Pass original command for logging context in background
    }, (response) => {
      // Callback for EXECUTE_PLAYWRIGHT_ACTION if background sends one (e.g. final status)
      // The primary logging is handled by SCRIPT_LOG_UPDATE, but a direct response can be useful.
      if (chrome.runtime.lastError) {
        this.showLogs([`Error sending action to background: ${chrome.runtime.lastError.message}`], true);
      } else if (response) {
        // Assuming response is ScriptExecutionResult like object
        // this.showLogs(response.logs, !response.success); // Already handled by SCRIPT_LOG_UPDATE
      }
      this.executeLlmActionBtn.disabled = false;
      this.executeLlmActionBtn.textContent = 'Execute AI Action';
    });
  }
  */
  // --- End AI Act Methods -- REMOVING

  // --- AI Direct Mode Methods ---
  private async executeAiDirectCommand() {
    const prompt = this.aiDirectPromptInput.value.trim();

    if (!prompt) {
      this.showLogs(['Please enter your AI prompt.'], true);
      this.aiDirectPromptInput.focus();
      return;
    }

    // Retrieve token from storage
    let token: string | undefined;
    try {
      token = await storageService.getApiKey();
    } catch (error) {
      console.error("Error retrieving API key:", error);
      this.showLogs(['Error retrieving API key from storage.'], true);
      this.executeAiDirectBtn.disabled = false;
      this.executeAiDirectBtn.textContent = 'Run AI Command';
      return;
    }

    if (!token) {
      this.showLogs(['API Key not set. Please set it in the Settings menu.'], true);
      this.settingsHint.style.display = 'block'; // Ensure hint is shown
      return;
    }
    
    // If we reach here, token exists
    this.settingsHint.style.display = 'none'; // Hide hint if we have the token
    this.executeAiDirectBtn.disabled = true;
    this.executeAiDirectBtn.textContent = 'Running AI...';
    this.showLogs([`Sending to AI: \"${prompt}\" (using stored token)`]);

    // Send to background script
    chrome.runtime.sendMessage({
      type: 'EXECUTE_AI_DIRECT_COMMAND',
      prompt,
      token // Send the retrieved token
    }, (response) => {
      if (chrome.runtime.lastError) {
        this.showLogs([`Error sending AI Direct command: ${chrome.runtime.lastError.message}`], true);
        console.error("AI Direct Send Error:", chrome.runtime.lastError);
      } else if (response && !response.success) {
        // Assuming background might send back an immediate failure response structure
        this.showLogs(response.logs || [`AI Direct command failed: ${response.error || 'Unknown error'}`], true);
      } else if (response && response.success) {
        this.showLogs(response.logs || ['AI Direct command acknowledged.'], true);
      }
      // Logs will also be updated via SCRIPT_LOG_UPDATE from background during execution
      this.executeAiDirectBtn.disabled = false;
      this.executeAiDirectBtn.textContent = 'Run AI Command';
    });
  }
  // --- End AI Direct Mode Methods ---

  private toggleAiModeDisplay(isAiModeActive: boolean) {
    // Ensure settings are hidden unless explicitly shown
    this.settingsSection.style.display = 'none'; 

    if (isAiModeActive) {
      this.scriptsContainer.style.display = 'none';
      // this.aiActExperimentalSection.style.display = 'none'; // Keep hidden when AI mode is ON -- REMOVING
      this.aiDirectModeSection.style.display = 'block';
      // Check if API key is set when activating AI mode
      this.checkApiKeyForAiMode(); 
    } else {
      this.scriptsContainer.style.display = 'block';
      // this.aiActExperimentalSection.style.display = 'none'; // Hide when AI mode is OFF -- REMOVING
      this.aiDirectModeSection.style.display = 'none';
      this.settingsHint.style.display = 'none'; // Hide hint when not in AI mode
    }
  }

  private async checkApiKeyForAiMode() {
    const apiKey = await storageService.getApiKey();
    if (!apiKey) {
      this.settingsHint.style.display = 'block'; // Show hint if key is missing
    } else {
      this.settingsHint.style.display = 'none'; // Hide hint if key exists
    }
  }

  private showSettingsSection() {
    // Hide other main content sections
    this.scriptsContainer.style.display = 'none';
    this.aiDirectModeSection.style.display = 'none';
    // this.aiActExperimentalSection.style.display = 'none'; -- REMOVING
    // Show settings
    this.settingsSection.style.display = 'block';
    // Load current key into input when showing
    this.loadInitialSettings(); 
  }

  private hideSettingsSection() {
    this.settingsSection.style.display = 'none';
    // Restore visibility based on AI mode toggle state
    this.toggleAiModeDisplay(this.aiModeToggle.checked);
  }

  private async saveApiKey() {
    const apiKey = this.apiKeyInput.value.trim();
    this.saveApiKeyBtn.disabled = true;
    this.saveApiKeyBtn.textContent = 'Saving...';
    this.apiKeyStatus.textContent = '';

    try {
      await storageService.saveApiKey(apiKey);
      this.apiKeyStatus.textContent = 'API Key saved successfully!';
      this.apiKeyStatus.className = 'status-message'; // Success style
      // Hide hint in AI Direct mode if key is now set
      if (apiKey) {
        this.settingsHint.style.display = 'none'; 
      } else {
        this.settingsHint.style.display = 'block'; 
      }
    } catch (error) {
      console.error("Error saving API key:", error);
      this.apiKeyStatus.textContent = 'Failed to save API key.';
      this.apiKeyStatus.className = 'status-message error'; // Error style
    } finally {
      this.saveApiKeyBtn.disabled = false;
      this.saveApiKeyBtn.textContent = 'Save API Key';
      // Optionally hide the status message after a delay
      setTimeout(() => { this.apiKeyStatus.textContent = ''; }, 3000);
    }
  }

  private async loadInitialSettings() {
    try {
      const apiKey = await storageService.getApiKey();
      if (apiKey) {
        this.apiKeyInput.value = apiKey;
        this.apiKeyStatus.textContent = 'API Key is set.';
        this.apiKeyStatus.className = 'status-message'; // Reset class
        this.settingsHint.style.display = 'none'; // Hide hint if key is set
      } else {
        this.apiKeyStatus.textContent = 'API Key not set.';
        this.apiKeyStatus.className = 'status-message error'; // Error class
        this.settingsHint.style.display = 'block'; // Show hint if key is not set
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      this.apiKeyStatus.textContent = 'Error loading API key.';
      this.apiKeyStatus.className = 'status-message error';
    }
  }
}

// Initialize the UI when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupUI();
});