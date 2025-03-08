import type { ScriptDefinition, ScriptExecutionResult } from './core/types';
import { getAvailableScripts, syncRemoteScripts } from './core/registry';

class PopupUI {
  private scriptsList: HTMLDivElement;
  private logsContainer: HTMLDivElement;
  private logsContent: HTMLPreElement;
  private logsToggle: HTMLDivElement;
  private syncButton: HTMLButtonElement;
  private scripts: ScriptDefinition[] = [];
  private isSyncing = false;

  constructor() {
    this.scriptsList = document.getElementById('scriptsList') as HTMLDivElement;
    this.logsContainer = document.getElementById('logsContainer') as HTMLDivElement;
    this.logsContent = document.getElementById('logsContent') as HTMLPreElement;
    this.logsToggle = document.getElementById('logsToggle') as HTMLDivElement;
    this.syncButton = document.getElementById('syncButton') as HTMLButtonElement;

    this.initializeEventListeners();
    // Always force sync when opening popup
    this.loadScripts(true);
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
        
        scriptElement.innerHTML = `
          <div class="script-info">
            <strong>${script.name} ${sourceBadge}</strong>
            <small>${script.description}</small>
          </div>
          <div class="script-actions">
            <button class="primary-button run-script" data-id="${script.id}">Run</button>
          </div>
        `;
        this.scriptsList.appendChild(scriptElement);
      }, index * 50); // Stagger each item by 50ms
    });
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
    if (isComplete) {
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
      console.error('Error syncing scripts:', error);
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
        this.showLogs(message.logs);
      }
      return true;
    });

    // Sync button
    this.syncButton.addEventListener('click', () => {
      this.syncScripts();
    });

    // Logs toggle button
    this.logsToggle.addEventListener('click', () => {
      this.toggleLogs();
    });

    // Close logs button
    document.getElementById('closeLogsBtn')?.addEventListener('click', () => {
      this.logsContainer.classList.remove('active');
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
    });
  }

  private async runScript(scriptId: string): Promise<ScriptExecutionResult> {
    try {
      console.log(`Sending message to execute script: ${scriptId}`);
      
      const result = await chrome.runtime.sendMessage({
        type: 'EXECUTE_SCRIPT',
        scriptId
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
}

// Initialize the UI when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupUI();
});