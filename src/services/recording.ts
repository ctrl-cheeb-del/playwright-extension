import { crx } from 'playwright-crx';
import type { Page } from 'playwright-crx';
import type { RecordedAction, ScriptDefinition, ScriptContext } from '../core/types';
import { executeScript } from '../core/interpreter';

class RecordingService {
  private isRecording = false;
  private recordedActions: RecordedAction[] = [];
  private page: Page | null = null;
  private crxApp: any = null;
  private tabId: number | null = null;
  private recordingTabUrl: string | null = null;
  private recordingInterval: NodeJS.Timeout | null = null;

  async startRecording(useCurrentTab: boolean): Promise<boolean> {
    if (this.isRecording) {
      return false;
    }

    try {
      this.recordedActions = [];
      
      // Try to start CRX, handle already started error
      try {
        this.crxApp = await crx.start();
      } catch (error) {
        if (error instanceof Error && error.message.includes('crxApplication is already started')) {
          console.log('Detected lingering CRX instance, attempting to start new instance...');
          // Just try to start again - the error means no instance actually exists
          try {
            this.crxApp = await crx.start();
          } catch (startError) {
            console.error('Failed to start CRX:', startError);
            throw new Error('Failed to start recording: Could not start CRX instance');
          }
        } else {
          throw error;
        }
      }

      if (useCurrentTab) {
        // Get the current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          throw new Error('No active tab found');
        }
        
        this.tabId = tab.id;
        this.recordingTabUrl = tab.url || null;
        // Attach to the current tab
        this.page = await this.crxApp.attach(tab.id);
      } else {
        // Create a new tab
        this.page = await this.crxApp.newPage();
        
        // Store the tab ID for future reference
        const pages = await this.crxApp.context().pages();
        for (const p of pages) {
          if (p === this.page) {
            // Get the tab ID from the page
            const targets = await this.crxApp.browser().targets();
            for (const target of targets) {
              if (target.url() === p.url()) {
                this.tabId = target._targetId;
                this.recordingTabUrl = p.url();
                break;
              }
            }
            break;
          }
        }
      }

      if (!this.page) {
        throw new Error('Failed to create or attach to page');
      }

      // Start recording
      await this.setupRecording();
      this.isRecording = true;
      
      // Send status update
      this.sendStatusUpdate();
      
      // Set up an interval to periodically send status updates
      // This ensures the popup can always get the latest state
      this.recordingInterval = setInterval(() => {
        this.sendStatusUpdate();
      }, 5000); // Every 5 seconds
      
      return true;
    } catch (error) {
      console.error('Failed to start recording:', error);
      await this.cleanup();
      return false;
    }
  }

  async stopRecording(): Promise<RecordedAction[]> {
    if (!this.isRecording && this.recordedActions.length === 0) {
      return [];
    }

    try {
      this.isRecording = false;
      
      // Clear the interval
      if (this.recordingInterval) {
        clearInterval(this.recordingInterval);
        this.recordingInterval = null;
      }
      
      const actions = [...this.recordedActions];
      
      // Ensure cleanup is completed before proceeding
      await this.cleanup();
      
      // Add a small delay to ensure CRX is fully cleaned up
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Send status update
      this.sendStatusUpdate();
      
      // If no actions were recorded or we're explicitly discarding,
      // clear the recorded actions
      if (actions.length === 0) {
        this.recordedActions = [];
      }
      
      return actions;
    } catch (error) {
      console.error('Error stopping recording:', error);
      // Try cleanup one more time
      try {
        await this.cleanup();
      } catch (cleanupError) {
        console.error('Error during final cleanup:', cleanupError);
      }
      return this.recordedActions;
    }
  }

  // Add a method to explicitly discard the recording
  async discardRecording(): Promise<void> {
    this.isRecording = false;
    this.recordedActions = [];
    
    // Clear the interval
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }
    
    try {
      // Ensure cleanup is completed before proceeding
      await this.cleanup();
      
      // Add a small delay to ensure CRX is fully cleaned up
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Send status update
      this.sendStatusUpdate();
    } catch (error) {
      console.error('Error during discard cleanup:', error);
      // Try cleanup one more time
      try {
        await this.cleanup();
      } catch (cleanupError) {
        console.error('Error during final cleanup:', cleanupError);
      }
    }
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.recordingInterval) {
        clearInterval(this.recordingInterval);
        this.recordingInterval = null;
      }
      
      if (this.page) {
        try {
          // Remove all listeners
          this.page.removeAllListeners('framenavigated');
          
          // Remove page-level event listeners
          await this.page.evaluate(() => {
            // Remove any existing event listeners
            const oldClickHandler = (window as any).__recordClickHandler;
            const oldInputHandler = (window as any).__recordInputHandler;
            const oldKeyDownHandler = (window as any).__recordKeyDownHandler;
            const oldFocusHandler = (window as any).__recordFocusHandler;
            
            if (oldClickHandler) document.removeEventListener('click', oldClickHandler, true);
            if (oldInputHandler) {
              document.removeEventListener('change', oldInputHandler, true);
              document.removeEventListener('input', oldInputHandler, true);
            }
            if (oldKeyDownHandler) document.removeEventListener('keydown', oldKeyDownHandler, true);
            if (oldFocusHandler) document.removeEventListener('focus', oldFocusHandler, true);
            
            // Clear the stored handlers
            (window as any).__recordClickHandler = null;
            (window as any).__recordInputHandler = null;
            (window as any).__recordKeyDownHandler = null;
            (window as any).__recordFocusHandler = null;
          }).catch(err => console.error('Error removing page event listeners:', err));
        } catch (evalError) {
          console.error('Error during page cleanup:', evalError);
        }
        
        if (this.tabId) {
          try {
            await this.crxApp.detach(this.page);
          } catch (detachError) {
            console.error('Error detaching from page:', detachError);
          }
        }
      }
      
      if (this.crxApp) {
        try {
          await this.crxApp.close();
          // Add a small delay after closing to ensure it's fully cleaned up
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (closeError) {
          console.error('Error closing CRX:', closeError);
        }
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
      throw error; // Re-throw to handle in calling function
    } finally {
      this.page = null;
      this.crxApp = null;
      this.tabId = null;
    }
  }

  private async injectRecordingScript(): Promise<void> {
    if (!this.page) return;
    
    // Inject recording script
    await this.page.evaluate(() => {
      // Track focused element for keyboard events
      let focusedElement: HTMLElement | null = null;
      let lastInputValue: string = '';
      
      // Remove any existing event listeners first to prevent duplicates
      const oldClickHandler = (window as any).__recordClickHandler;
      const oldInputHandler = (window as any).__recordInputHandler;
      const oldKeyDownHandler = (window as any).__recordKeyDownHandler;
      const oldFocusHandler = (window as any).__recordFocusHandler;
      
      if (oldClickHandler) document.removeEventListener('click', oldClickHandler, true);
      if (oldInputHandler) {
        document.removeEventListener('change', oldInputHandler, true);
        document.removeEventListener('input', oldInputHandler, true);
      }
      if (oldKeyDownHandler) document.removeEventListener('keydown', oldKeyDownHandler, true);
      if (oldFocusHandler) document.removeEventListener('focus', oldFocusHandler, true);
      
      // Record click events
      const recordClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target) return;

        // Update focused element
        focusedElement = target;
        
        // Get the best selector for the element using a priority-based approach
        let selector = generateBestSelector(target);

        // @ts-ignore
        window.recordAction({
          type: 'click',
          selector,
          timestamp: Date.now()
        });
        
        // If it's an input element, store its current value
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          lastInputValue = target.value;
        }
      };

      // Record input changes
      const recordInput = (event: Event) => {
        const target = event.target as HTMLInputElement;
        if (!target) return;
        
        // Get the best selector for the element
        let selector = generateBestSelector(target);

        // Only record if the value has changed
        if (target.value !== lastInputValue) {
          // @ts-ignore
          window.recordAction({
            type: 'fill',
            selector,
            value: target.value,
            timestamp: Date.now()
          });
          
          lastInputValue = target.value;
        }
      };
      
      // Generate the best possible selector for an element
      const generateBestSelector = (element: HTMLElement): string => {
        // Priority 0: Check for associated label (highest priority for Playwright)
        if (element instanceof HTMLInputElement || 
            element instanceof HTMLSelectElement || 
            element instanceof HTMLTextAreaElement ||
            element.tagName.toLowerCase() === 'button') {
          
          // Check for explicit label using for/id relationship
          if (element.id) {
            const labels = document.querySelectorAll(`label[for="${element.id}"]`);
            if (labels.length > 0 && labels[0].textContent) {
              const labelText = labels[0].textContent.trim();
              if (labelText && labelText.length < 50) {
                return `getByLabel("${labelText}")`;
              }
            }
          }
          
          // Check for implicit label (input is a child of the label)
          let parent = element.parentElement;
          while (parent && parent.tagName.toLowerCase() !== 'form') {
            if (parent.tagName.toLowerCase() === 'label' && parent.textContent) {
              const labelText = parent.textContent.trim();
              if (labelText && labelText.length < 50) {
                return `getByLabel("${labelText}")`;
              }
            }
            parent = parent.parentElement;
          }
          
          // Check for button text (for button elements)
          if (element.tagName.toLowerCase() === 'button' && element.textContent) {
            const buttonText = element.textContent.trim();
            if (buttonText && buttonText.length < 50) {
              return `getByRole("button", { name: "${buttonText}" })`;
            }
          }
        }
        
        // Priority 1: Accessibility attributes
        // Check for aria-label
        const ariaLabel = element.getAttribute('aria-label');
        if (ariaLabel) {
          return `[aria-label="${ariaLabel}"]`;
        }
        
        // Check for aria-labelledby
        const ariaLabelledBy = element.getAttribute('aria-labelledby');
        if (ariaLabelledBy) {
          const labelElement = document.getElementById(ariaLabelledBy);
          if (labelElement && labelElement.textContent) {
            return `[aria-labelledby="${ariaLabelledBy}"]`;
          }
        }
        
        // Check for role
        const role = element.getAttribute('role');
        if (role) {
          // If element has both role and name, use both for precision
          const name = element.getAttribute('name');
          if (name) {
            return `role=${role}[name="${name}"]`;
          }
          
          // If element has text content, use role with text
          const text = element.textContent?.trim();
          if (text && text.length < 50) { // Avoid using very long text
            return `role=${role}:has-text("${text}")`;
          }
          
          return `role=${role}`;
        }
        
        // Priority 2: Standard HTML attributes
        // Check for id (most reliable)
        if (element.id) {
          return `#${element.id}`;
        }
        
        // Check for data attributes
        const dataAttributes = Array.from(element.attributes)
          .filter(attr => attr.name.startsWith('data-'));
        
        if (dataAttributes.length > 0) {
          const dataAttr = dataAttributes[0];
          return `[${dataAttr.name}="${dataAttr.value}"]`;
        }
        
        // Priority 3: Element type with text content
        const tag = element.tagName.toLowerCase();
        const text = element.textContent?.trim();
        
        if (text && text.length < 50) { // Avoid using very long text
          // For buttons, inputs, and links, text-based selectors are reliable
          if (tag === 'button' || tag === 'a' || element instanceof HTMLInputElement) {
            return `${tag}:has-text("${text}")`;
          }
        }
        
        // Priority 4: Element type with attributes
        if (element instanceof HTMLInputElement) {
          const type = element.type;
          const name = element.name;
          
          if (name) {
            return `${tag}[name="${name}"]`;
          }
          
          if (type) {
            return `${tag}[type="${type}"]`;
          }
        }
        
        // Priority 5: CSS classes (least reliable, but sometimes necessary)
        if (element.className && typeof element.className === 'string' && element.className.trim()) {
          // Use the most specific class to avoid overly complex selectors
          const classes = element.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) {
            // Prefer shorter class names as they're often more meaningful
            const shortestClass = classes.reduce((a, b) => a.length <= b.length ? a : b);
            return `${tag}.${shortestClass}`;
          }
        }
        
        // Fallback: Use tag name or XPath as last resort
        return tag;
      };

      // Record keyboard events
      const recordKeyDown = (event: KeyboardEvent) => {
        // Only record Enter, Tab, Escape and arrow keys as separate actions
        const specialKeys = ['Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        
        if (specialKeys.includes(event.key) && focusedElement) {
          const target = focusedElement;
          let selector = generateBestSelector(target);
          
          // @ts-ignore
          window.recordAction({
            type: 'press',
            selector,
            value: event.key,
            timestamp: Date.now()
          });
        }
      };

      // Track focus
      const recordFocus = (event: FocusEvent) => {
        focusedElement = event.target as HTMLElement;
      };

      // Store handlers on window so we can remove them later
      (window as any).__recordClickHandler = recordClick;
      (window as any).__recordInputHandler = recordInput;
      (window as any).__recordKeyDownHandler = recordKeyDown;
      (window as any).__recordFocusHandler = recordFocus;

      // Add event listeners
      document.addEventListener('click', recordClick, true);
      document.addEventListener('change', recordInput, true);
      document.addEventListener('input', recordInput, true); // Capture input events too
      document.addEventListener('keydown', recordKeyDown, true);
      document.addEventListener('focus', recordFocus, true);
    });
  }

  private async setupRecording(): Promise<void> {
    if (!this.page) return;

    // Track the last action to prevent duplicates and calculate timing
    let lastAction: { type: string; selector?: string; value?: string; timestamp: number } | null = null;
    const debounceTime = 300; // ms - increased to prevent duplicates but not miss inputs
    
    // Track the current URL to detect navigations
    let currentUrl = await this.page.url();

    // Listen for navigations
    this.page.on('framenavigated', async frame => {
      // Only track main frame navigations
      if (frame === this.page?.mainFrame()) {
        const newUrl = frame.url();
        
        // If this is a new URL (not just a hash change)
        if (this.isNewNavigation(currentUrl, newUrl)) {
          const timestamp = Date.now();
          const timeSincePrevious = lastAction ? timestamp - lastAction.timestamp : 0;
          
          // Record the navigation action
          const navigationAction: RecordedAction = {
            type: 'goto',
            value: newUrl,
            timestamp,
            timeSincePrevious
          };
          
          this.recordedActions.push(navigationAction);
          lastAction = navigationAction;
          
          // Update current URL
          currentUrl = newUrl;
          
          // Update the recording tab URL
          this.recordingTabUrl = newUrl;
          
          // Send status update
          this.sendStatusUpdate();
          
          // Re-attach event listeners on the new page
          await this.injectRecordingScript();
        }
      }
    });

    // Listen for actions
    await this.page.exposeFunction('recordAction', (action: RecordedAction) => {
      // Check if this is a duplicate action (same type, selector, and value within debounce time)
      const isDuplicate = lastAction && 
        action.type === lastAction.type && 
        action.selector === lastAction.selector && 
        action.value === lastAction.value &&
        action.timestamp - lastAction.timestamp < debounceTime;
      
      if (!isDuplicate) {
        // Calculate time since previous action
        if (lastAction) {
          action.timeSincePrevious = action.timestamp - lastAction.timestamp;
        }
        
        this.recordedActions.push(action);
        lastAction = action;
        // Send status update whenever an action is recorded
        this.sendStatusUpdate();
      }
    });

    // Inject initial recording script
    await this.injectRecordingScript();
  }

  private sendStatusUpdate(): void {
    chrome.runtime.sendMessage({
      type: 'RECORDING_STATUS_UPDATE',
      isRecording: this.isRecording,
      actions: this.recordedActions,
      tabUrl: this.recordingTabUrl
    });
  }

  generateScript(name: string, description: string): ScriptDefinition {
    const scriptId = `recorded_${Date.now()}`;
    const scriptCode = this.generateScriptString(name, description);
    
    return {
      id: scriptId,
      name,
      description,
      useCurrentTab: true,
      // Use the interpreter to execute the script code
      run: async (ctx: ScriptContext) => {
        try {
          ctx.log(`Starting recorded script: ${name}`);
          await executeScript(scriptCode, ctx);
          ctx.log(`Recorded script completed: ${name}`);
        } catch (error) {
          ctx.log(
            `Error executing script: ${error instanceof Error ? error.message : String(error)}`
          );
          throw error;
        }
      },
      source: 'local',
      lastUpdated: Date.now(),
      // Store the original script code for later use
      code: scriptCode
    };
  }

  generateScriptString(name: string, description: string): string {
    const actions = [...this.recordedActions];
    
    // Create a script that can be directly executed by the interpreter
    // The interpreter expects plain JavaScript code, not a module with imports/exports
    let scriptCode = `
// Script: ${name}
// Description: ${description}
// Generated: ${new Date().toLocaleString()}

const { page, log } = ctx;

log('Starting script execution');
`;

    // Add each action with appropriate logging and timing
    actions.forEach((action) => {
      // Add wait time if significant (more than 500ms)
      if (action.timeSincePrevious && action.timeSincePrevious > 500) {
        // Round to nearest 100ms for readability
        const waitTime = Math.round(action.timeSincePrevious / 100) * 100;
        scriptCode += `log('Waiting for ${waitTime}ms...');\n`;
        scriptCode += `await page.waitForTimeout(${waitTime});\n\n`;
      }
      
      if (action.type === 'click') {
        scriptCode += `log('Clicking on ${action.selector || 'element'}...');\n`;
        
        // Handle different selector formats
        if (action.selector) {
          if (action.selector.startsWith('getByLabel(')) {
            scriptCode += `await page.${action.selector}.click();\n\n`;
          } else if (action.selector.startsWith('getByRole(')) {
            scriptCode += `await page.${action.selector}.click();\n\n`;
          } else {
            scriptCode += `await page.click('${action.selector}');\n\n`;
          }
        } else {
          scriptCode += `// Warning: No selector available for this click action\n\n`;
        }
      } else if (action.type === 'fill' && action.value) {
        scriptCode += `log('Filling ${action.selector || 'element'} with text...');\n`;
        
        // Handle different selector formats
        if (action.selector) {
          if (action.selector.startsWith('getByLabel(')) {
            scriptCode += `await page.${action.selector}.fill('${action.value}');\n\n`;
          } else if (action.selector.startsWith('getByRole(')) {
            scriptCode += `await page.${action.selector}.fill('${action.value}');\n\n`;
          } else {
            scriptCode += `await page.fill('${action.selector}', '${action.value}');\n\n`;
          }
        } else {
          scriptCode += `// Warning: No selector available for this fill action\n\n`;
        }
      } else if (action.type === 'press' && action.value) {
        scriptCode += `log('Pressing ${action.value} key...');\n`;
        scriptCode += `await page.keyboard.press('${action.value}');\n\n`;
      } else if (action.type === 'goto' && action.value) {
        scriptCode += `log('Navigating to ${action.value}...');\n`;
        scriptCode += `await page.goto('${action.value}');\n\n`;
      }
    });

    scriptCode += `log('Script completed successfully');\n`;

    return scriptCode;
  }

  // This method generates a complete module script for copying to clipboard
  generateCompleteScriptString(name: string, description: string): string {
    const actions = [...this.recordedActions];
    
    // Create a formatted script in the same style as github.ts
    let scriptCode = `import type { ScriptDefinition } from '../core/types';

const script: ScriptDefinition = {
  id: '${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}',
  name: '${name}',
  description: '${description}',
  useCurrentTab: true,
  async run(ctx) {
    const { page, log } = ctx;
    
`;

    // Add each action with appropriate logging and timing
    actions.forEach((action) => {
      // Add wait time if significant (more than 500ms)
      if (action.timeSincePrevious && action.timeSincePrevious > 500) {
        // Round to nearest 100ms for readability
        const waitTime = Math.round(action.timeSincePrevious / 100) * 100;
        scriptCode += `    log('Waiting for ${waitTime}ms...');\n`;
        scriptCode += `    await page.waitForTimeout(${waitTime});\n\n`;
      }
      
      if (action.type === 'click') {
        scriptCode += `    log('Clicking on ${action.selector || 'element'}...');\n`;
        
        // Handle different selector formats
        if (action.selector) {
          if (action.selector.startsWith('getByLabel(')) {
            scriptCode += `    await page.${action.selector}.click();\n\n`;
          } else if (action.selector.startsWith('getByRole(')) {
            scriptCode += `    await page.${action.selector}.click();\n\n`;
          } else {
            scriptCode += `    await page.click('${action.selector}');\n\n`;
          }
        } else {
          scriptCode += `    // Warning: No selector available for this click action\n\n`;
        }
      } else if (action.type === 'fill' && action.value) {
        scriptCode += `    log('Filling ${action.selector || 'element'} with text...');\n`;
        
        // Handle different selector formats
        if (action.selector) {
          if (action.selector.startsWith('getByLabel(')) {
            scriptCode += `    await page.${action.selector}.fill('${action.value}');\n\n`;
          } else if (action.selector.startsWith('getByRole(')) {
            scriptCode += `    await page.${action.selector}.fill('${action.value}');\n\n`;
          } else {
            scriptCode += `    await page.fill('${action.selector}', '${action.value}');\n\n`;
          }
        } else {
          scriptCode += `    // Warning: No selector available for this fill action\n\n`;
        }
      } else if (action.type === 'press' && action.value) {
        scriptCode += `    log('Pressing ${action.value} key...');\n`;
        scriptCode += `    await page.keyboard.press('${action.value}');\n\n`;
      } else if (action.type === 'goto' && action.value) {
        scriptCode += `    log('Navigating to ${action.value}...');\n`;
        scriptCode += `    await page.goto('${action.value}');\n\n`;
      }
    });

    scriptCode += `    log('Script completed successfully');\n`;
    scriptCode += `  }\n};\n\nexport default script;`;

    return scriptCode;
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  getRecordedActions(): RecordedAction[] {
    return [...this.recordedActions];
  }

  getRecordingState(): { isRecording: boolean; actions: RecordedAction[]; tabId?: number; tabUrl?: string } {
    return {
      isRecording: this.isRecording,
      actions: [...this.recordedActions],
      tabId: this.tabId || undefined,
      tabUrl: this.recordingTabUrl || undefined
    };
  }

  // Helper to determine if a navigation is to a new page (not just a hash change)
  private isNewNavigation(oldUrl: string, newUrl: string): boolean {
    try {
      const oldUrlObj = new URL(oldUrl);
      const newUrlObj = new URL(newUrl);
      
      // Compare everything except the hash
      return oldUrlObj.origin !== newUrlObj.origin || 
             oldUrlObj.pathname !== newUrlObj.pathname ||
             oldUrlObj.search !== newUrlObj.search;
    } catch (e) {
      // If URLs can't be parsed, consider it a new navigation
      return oldUrl !== newUrl;
    }
  }
}

export const recordingService = new RecordingService(); 