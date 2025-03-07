import type { ScriptExecutionResult } from './core/types';
import { availableScripts } from './core/registry';

class PopupUI {
  private scriptsList: HTMLDivElement;
  private logsContainer: HTMLDivElement;
  private logsContent: HTMLPreElement;
  private logsToggle: HTMLDivElement;

  constructor() {
    this.scriptsList = document.getElementById('scriptsList') as HTMLDivElement;
    this.logsContainer = document.getElementById('logsContainer') as HTMLDivElement;
    this.logsContent = document.getElementById('logsContent') as HTMLPreElement;
    this.logsToggle = document.getElementById('logsToggle') as HTMLDivElement;

    this.initializeEventListeners();
    this.renderScriptsList();
  }

  private renderScriptsList() {
    this.scriptsList.innerHTML = '';
    
    availableScripts.forEach((script, index) => {
      // Add a small delay to each item for a staggered animation effect
      setTimeout(() => {
        const scriptElement = document.createElement('div');
        scriptElement.className = 'script-item';
        scriptElement.innerHTML = `
          <div class="script-info">
            <strong>${script.name}</strong>
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
    this.logsContent.textContent = logs.join('\n');
    this.logsContent.scrollTop = this.logsContent.scrollHeight;
    
    // Show the logs toggle button if not already visible
    if (!this.logsToggle.classList.contains('visible')) {
      this.logsToggle.classList.add('visible');
    }
    
    // If logs are complete and container is not active, show a notification effect
    if (isComplete && !this.logsContainer.classList.contains('active')) {
      this.logsToggle.classList.add('pulse');
      setTimeout(() => this.logsToggle.classList.remove('pulse'), 1000);
    }
  }

  private toggleLogs() {
    this.logsContainer.classList.toggle('active');
  }

  private initializeEventListeners() {
    // Listen for script execution updates
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'SCRIPT_LOG_UPDATE') {
        this.showLogs(message.logs);
      }
      return true;
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

      if (target.matches('.run-script')) {
        // Add a running indicator to the button
        const button = target as HTMLButtonElement;
        const originalText = button.textContent;
        button.innerHTML = '<span class="status-indicator running"></span>Running...';
        button.disabled = true;
        
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
      const result = await chrome.runtime.sendMessage({
        type: 'EXECUTE_SCRIPT',
        scriptId
      }) as ScriptExecutionResult;

      this.showLogs(result.logs, true);
      return result;
    } catch (error) {
      console.error('Failed to execute script:', error);
      return {
        success: false,
        error: String(error),
        logs: [`Error: ${error}`]
      };
    }
  }
}

// Initialize the UI when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupUI();
});