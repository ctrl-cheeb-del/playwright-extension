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
  private lastUserInteractionTime: number = 0;
  private navigationThreshold: number = 2000; // 2 second threshold

  // Helper function to properly escape strings for script generation
  private escapeString(str: string): string {
    if (!str) return '';
    
    // Replace backslashes first to avoid double escaping
    return str
      .replace(/\\/g, '\\\\')      // Escape backslashes
      .replace(/'/g, "\\'")        // Escape single quotes
      .replace(/\n/g, '\\n')       // Escape newlines
      .replace(/\r/g, '\\r')       // Escape carriage returns
      .replace(/\t/g, '\\t')       // Escape tabs
      .replace(/\f/g, '\\f')       // Escape form feeds
      .replace(/\v/g, '\\v')       // Escape vertical tabs
      .replace(/\0/g, '\\0');      // Escape null characters
  }

  // Helper function to properly escape selectors for script generation
  private escapeSelector(selector: string): string {
    if (!selector) return '';
    
    // If it's a complex selector (getByLabel, getByRole), don't escape it
    if (selector.startsWith('getByLabel(') || selector.startsWith('getByRole(')) {
      return selector;
    }
    
    // For CSS selectors, escape any quotes
    return selector
      .replace(/\\/g, '\\\\')  // Escape backslashes
      .replace(/'/g, "\\'");   // Escape single quotes
  }

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
      this.lastUserInteractionTime = 0;
      
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
    this.lastUserInteractionTime = 0;
    
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
            const oldPasteHandler = (window as any).__recordPasteHandler;
            const oldCopyHandler = (window as any).__recordCopyHandler;
            const oldSubmitHandler = (window as any).__recordSubmitHandler;
            
            if (oldClickHandler) document.removeEventListener('click', oldClickHandler, true);
            if (oldInputHandler) {
              document.removeEventListener('change', oldInputHandler, true);
              document.removeEventListener('input', oldInputHandler, true);
            }
            if (oldKeyDownHandler) document.removeEventListener('keydown', oldKeyDownHandler, true);
            if (oldFocusHandler) document.removeEventListener('focus', oldFocusHandler, true);
            if (oldPasteHandler) document.removeEventListener('paste', oldPasteHandler, true);
            if (oldCopyHandler) document.removeEventListener('copy', oldCopyHandler, true);
            if (oldSubmitHandler) document.removeEventListener('submit', oldSubmitHandler, true);
            
            // Clear the stored handlers
            (window as any).__recordClickHandler = null;
            (window as any).__recordInputHandler = null;
            (window as any).__recordKeyDownHandler = null;
            (window as any).__recordFocusHandler = null;
            (window as any).__recordPasteHandler = null;
            (window as any).__recordCopyHandler = null;
            (window as any).__recordSubmitHandler = null;
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
      const oldPasteHandler = (window as any).__recordPasteHandler;
      const oldCopyHandler = (window as any).__recordCopyHandler;
      const oldSubmitHandler = (window as any).__recordSubmitHandler;
      
      if (oldClickHandler) document.removeEventListener('click', oldClickHandler, true);
      if (oldInputHandler) {
        document.removeEventListener('change', oldInputHandler, true);
        document.removeEventListener('input', oldInputHandler, true);
      }
      if (oldKeyDownHandler) document.removeEventListener('keydown', oldKeyDownHandler, true);
      if (oldFocusHandler) document.removeEventListener('focus', oldFocusHandler, true);
      if (oldPasteHandler) document.removeEventListener('paste', oldPasteHandler, true);
      if (oldCopyHandler) document.removeEventListener('copy', oldCopyHandler, true);
      if (oldSubmitHandler) document.removeEventListener('submit', oldSubmitHandler, true);
      
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
        
        // Skip if this is a paste event (we'll handle it separately)
        if (event.type === 'input' && (event as InputEvent).inputType === 'insertFromPaste') {
          return;
        }
        
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
          
          // Update the last known value
          lastInputValue = target.value;
        }
      };
      
      // Record paste events directly
      const recordPaste = (event: ClipboardEvent) => {
        if (!focusedElement) return;
        
        const target = event.target as HTMLElement;
        if (!target) return;
        
        let selector = generateBestSelector(target);
        
        // @ts-ignore
        window.recordAction({
          type: 'paste',
          selector,
          timestamp: Date.now()
        });
        
        // Prevent recording the pasted text as a separate fill action
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          setTimeout(() => {
            lastInputValue = target.value;
          }, 100);
        }
      };
      
      // Record copy events directly
      const recordCopy = (event: ClipboardEvent) => {
        if (!focusedElement) return;
        
        const target = event.target as HTMLElement;
        if (!target) return;
        
        let selector = generateBestSelector(target);
        
        // @ts-ignore
        window.recordAction({
          type: 'copy',
          selector,
          timestamp: Date.now()
        });
      };
      
      // Record form submissions
      const recordSubmit = () => {
        // @ts-ignore
        window.recordAction({
          type: 'submit',
          timestamp: Date.now()
        });
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
        // Detect clipboard paste events (Cmd+V on Mac, Ctrl+V on Windows/Linux)
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
          // We'll handle this with the paste event listener instead
          // This prevents duplicate recording
          return;
        }
        
        // Detect clipboard copy events (Cmd+C on Mac, Ctrl+C on Windows/Linux)
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
          // We'll handle this with the copy event listener instead
          // This prevents duplicate recording
          return;
        }
        
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

      // Add event listeners
      document.addEventListener('click', recordClick, true);
      document.addEventListener('change', recordInput, true);
      document.addEventListener('input', recordInput, true);
      document.addEventListener('keydown', recordKeyDown, true);
      document.addEventListener('focus', recordFocus, true);
      document.addEventListener('paste', recordPaste, true);
      document.addEventListener('copy', recordCopy, true);
      document.addEventListener('submit', recordSubmit, true);
      
      // Store references to event handlers for later cleanup
      (window as any).__recordClickHandler = recordClick;
      (window as any).__recordInputHandler = recordInput;
      (window as any).__recordKeyDownHandler = recordKeyDown;
      (window as any).__recordFocusHandler = recordFocus;
      (window as any).__recordPasteHandler = recordPaste;
      (window as any).__recordCopyHandler = recordCopy;
      (window as any).__recordSubmitHandler = recordSubmit;
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
          
          // Check if this navigation happened shortly after a user interaction
          const timeSinceLastInteraction = timestamp - this.lastUserInteractionTime;
          
          // Only record the navigation if it didn't happen right after a user interaction
          // or if it's been more than our threshold since the last interaction
          if (this.lastUserInteractionTime === 0 || timeSinceLastInteraction > this.navigationThreshold) {
            // Record the navigation action
            const navigationAction: RecordedAction = {
              type: 'goto',
              value: newUrl,
              timestamp,
              timeSincePrevious
            };
            
            this.recordedActions.push(navigationAction);
            lastAction = navigationAction;
            
            // Send status update
            this.sendStatusUpdate();
          } else {
            console.log(`Navigation to ${newUrl} occurred ${timeSinceLastInteraction}ms after user interaction - skipping recording`);
          }
          
          // Update current URL
          currentUrl = newUrl;
          
          // Update the recording tab URL
          this.recordingTabUrl = newUrl;
          
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
        
        // Update the last user interaction time for click, press, and fill actions
        if (action.type === 'click' || action.type === 'press' || action.type === 'fill') {
          this.lastUserInteractionTime = action.timestamp;
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
    
    // Check if there are any paste or copy actions in the recorded actions
    const hasPasteActions = actions.some(action => action.type === 'paste');
    const hasCopyActions = actions.some(action => action.type === 'copy');
    const hasClipboardActions = hasPasteActions || hasCopyActions;
    
    // Create a script that can be directly executed by the interpreter
    // The interpreter expects plain JavaScript code, not a module with imports/exports
    let scriptCode = `
// Script: ${this.escapeString(name)}
// Description: ${this.escapeString(description)}
// Generated: ${new Date().toLocaleString()}

const { page, log } = ctx;

log('Starting script execution');
`;

    // Add clipboard helper functions if needed
    if (hasClipboardActions) {
      scriptCode += `
// Use a cross-platform approach for clipboard operations
`;

      if (hasPasteActions) {
        scriptCode += `
// Helper function for paste operations
const tryPaste = async (selector) => {
  try {
    // Try Mac shortcut first
    await page.focus(selector);
    await page.keyboard.press('Meta+V');
  } catch (error) {
    // If that fails, try Windows/Linux shortcut
    await page.focus(selector);
    await page.keyboard.press('Control+V');
  }
};
`;
      }

      if (hasCopyActions) {
        scriptCode += `
// Helper function for copy operations
const tryCopy = async (selector) => {
  try {
    // Try Mac shortcut first
    await page.focus(selector);
    await page.keyboard.press('Meta+C');
  } catch (error) {
    // If that fails, try Windows/Linux shortcut
    await page.focus(selector);
    await page.keyboard.press('Control+C');
  }
};
`;
      }
    }

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
            scriptCode += `await page.click('${this.escapeSelector(action.selector)}');\n\n`;
          }
        } else {
          scriptCode += `// Warning: No selector available for this click action\n\n`;
        }
      } else if (action.type === 'fill' && action.value) {
        scriptCode += `log('Filling ${action.selector || 'element'} with text...');\n`;
        
        if (action.selector) {
          if (action.selector.startsWith('getByLabel(')) {
            scriptCode += `await page.${action.selector}.fill('${this.escapeString(action.value)}');\n\n`;
          } else if (action.selector.startsWith('getByRole(')) {
            scriptCode += `await page.${action.selector}.fill('${this.escapeString(action.value)}');\n\n`;
          } else {
            scriptCode += `await page.fill('${this.escapeSelector(action.selector)}', '${this.escapeString(action.value)}');\n\n`;
          }
        } else {
          scriptCode += `// Warning: No selector available for this fill action\n\n`;
        }
      } else if (action.type === 'paste') {
        scriptCode += `log('Pasting clipboard content into ${action.selector || 'element'}...');\n`;
        
        if (action.selector) {
          if (action.selector.startsWith('getByLabel(')) {
            scriptCode += `await page.${action.selector}.focus();\n`;
            scriptCode += `try {\n`;
            scriptCode += `  await page.keyboard.press('Meta+V');\n`;
            scriptCode += `} catch (error) {\n`;
            scriptCode += `  await page.keyboard.press('Control+V');\n`;
            scriptCode += `}\n\n`;
          } else if (action.selector.startsWith('getByRole(')) {
            scriptCode += `await page.${action.selector}.focus();\n`;
            scriptCode += `try {\n`;
            scriptCode += `  await page.keyboard.press('Meta+V');\n`;
            scriptCode += `} catch (error) {\n`;
            scriptCode += `  await page.keyboard.press('Control+V');\n`;
            scriptCode += `}\n\n`;
          } else {
            scriptCode += `await tryPaste('${this.escapeSelector(action.selector)}');\n\n`;
          }
        } else {
          scriptCode += `// Warning: No selector available for this paste action\n\n`;
        }
      } else if (action.type === 'copy') {
        scriptCode += `log('Copying content from ${action.selector || 'element'}...');\n`;
        
        if (action.selector) {
          if (action.selector.startsWith('getByLabel(')) {
            scriptCode += `await page.${action.selector}.focus();\n`;
            scriptCode += `try {\n`;
            scriptCode += `  await page.keyboard.press('Meta+C');\n`;
            scriptCode += `} catch (error) {\n`;
            scriptCode += `  await page.keyboard.press('Control+C');\n`;
            scriptCode += `}\n\n`;
          } else if (action.selector.startsWith('getByRole(')) {
            scriptCode += `await page.${action.selector}.focus();\n`;
            scriptCode += `try {\n`;
            scriptCode += `  await page.keyboard.press('Meta+C');\n`;
            scriptCode += `} catch (error) {\n`;
            scriptCode += `  await page.keyboard.press('Control+C');\n`;
            scriptCode += `}\n\n`;
          } else {
            scriptCode += `await tryCopy('${this.escapeSelector(action.selector)}');\n\n`;
          }
        } else {
          scriptCode += `// Warning: No selector available for this copy action\n\n`;
        }
      } else if (action.type === 'press' && action.value) {
        scriptCode += `log('Pressing ${action.value} key...');\n`;
        scriptCode += `await page.keyboard.press('${this.escapeString(action.value)}');\n\n`;
      } else if (action.type === 'goto' && action.value) {
        scriptCode += `log('Navigating to ${action.value}...');\n`;
        scriptCode += `await page.goto('${this.escapeString(action.value)}');\n\n`;
      }
    });

    scriptCode += `log('Script completed successfully');\n`;

    return scriptCode;
  }

  // This method generates a complete module script for copying to clipboard
  generateCompleteScriptString(name: string, description: string): string {
    const actions = [...this.recordedActions];
    
    // Check if there are any paste or copy actions in the recorded actions
    const hasPasteActions = actions.some(action => action.type === 'paste');
    const hasCopyActions = actions.some(action => action.type === 'copy');
    const hasClipboardActions = hasPasteActions || hasCopyActions;
    
    // Create a formatted script in the same style as github.ts
    let scriptCode = `import type { ScriptDefinition } from '../core/types';

const script: ScriptDefinition = {
  id: '${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}',
  name: '${this.escapeString(name)}',
  description: '${this.escapeString(description)}',
  useCurrentTab: true,
  async run(ctx) {
    const { page, log } = ctx;
    `;
    
    // Add platform detection code at the beginning if there are paste actions
    if (hasClipboardActions) {
      scriptCode += `
    // Use a cross-platform approach for clipboard operations
`;

      if (hasPasteActions) {
        scriptCode += `
    // Helper function for paste operations
    const tryPaste = async (selector) => {
      try {
        // Try Mac shortcut first
        await page.focus(selector);
        await page.keyboard.press('Meta+V');
      } catch (error) {
        // If that fails, try Windows/Linux shortcut
        await page.focus(selector);
        await page.keyboard.press('Control+V');
      }
    };
`;
      }

      if (hasCopyActions) {
        scriptCode += `
    // Helper function for copy operations
    const tryCopy = async (selector) => {
      try {
        // Try Mac shortcut first
        await page.focus(selector);
        await page.keyboard.press('Meta+C');
      } catch (error) {
        // If that fails, try Windows/Linux shortcut
        await page.focus(selector);
        await page.keyboard.press('Control+C');
      }
    };
`;
      }
    }

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
            scriptCode += `    await page.click('${this.escapeSelector(action.selector)}');\n\n`;
          }
        } else {
          scriptCode += `    // Warning: No selector available for this click action\n\n`;
        }
      } else if (action.type === 'fill' && action.value) {
        scriptCode += `    log('Filling ${action.selector || 'element'} with text...');\n`;
        
        if (action.selector) {
          if (action.selector.startsWith('getByLabel(')) {
            scriptCode += `    await page.${action.selector}.fill('${this.escapeString(action.value)}');\n\n`;
          } else if (action.selector.startsWith('getByRole(')) {
            scriptCode += `    await page.${action.selector}.fill('${this.escapeString(action.value)}');\n\n`;
          } else {
            scriptCode += `    await page.fill('${this.escapeSelector(action.selector)}', '${this.escapeString(action.value)}');\n\n`;
          }
        } else {
          scriptCode += `    // Warning: No selector available for this fill action\n\n`;
        }
      } else if (action.type === 'paste') {
        scriptCode += `    log('Pasting clipboard content into ${action.selector || 'element'}...');\n`;
        
        if (action.selector) {
          if (action.selector.startsWith('getByLabel(')) {
            scriptCode += `    await page.${action.selector}.focus();\n`;
            scriptCode += `    try {\n`;
            scriptCode += `      await page.keyboard.press('Meta+V');\n`;
            scriptCode += `    } catch (error) {\n`;
            scriptCode += `      await page.keyboard.press('Control+V');\n`;
            scriptCode += `    }\n\n`;
          } else if (action.selector.startsWith('getByRole(')) {
            scriptCode += `    await page.${action.selector}.focus();\n`;
            scriptCode += `    try {\n`;
            scriptCode += `      await page.keyboard.press('Meta+V');\n`;
            scriptCode += `    } catch (error) {\n`;
            scriptCode += `      await page.keyboard.press('Control+V');\n`;
            scriptCode += `    }\n\n`;
          } else {
            scriptCode += `    await tryPaste('${this.escapeSelector(action.selector)}');\n\n`;
          }
        } else {
          scriptCode += `    // Warning: No selector available for this paste action\n\n`;
        }
      } else if (action.type === 'copy') {
        scriptCode += `    log('Copying content from ${action.selector || 'element'}...');\n`;
        
        if (action.selector) {
          if (action.selector.startsWith('getByLabel(')) {
            scriptCode += `    await page.${action.selector}.focus();\n`;
            scriptCode += `    try {\n`;
            scriptCode += `      await page.keyboard.press('Meta+C');\n`;
            scriptCode += `    } catch (error) {\n`;
            scriptCode += `      await page.keyboard.press('Control+C');\n`;
            scriptCode += `    }\n\n`;
          } else if (action.selector.startsWith('getByRole(')) {
            scriptCode += `    await page.${action.selector}.focus();\n`;
            scriptCode += `    try {\n`;
            scriptCode += `      await page.keyboard.press('Meta+C');\n`;
            scriptCode += `    } catch (error) {\n`;
            scriptCode += `      await page.keyboard.press('Control+C');\n`;
            scriptCode += `    }\n\n`;
          } else {
            scriptCode += `    await tryCopy('${this.escapeSelector(action.selector)}');\n\n`;
          }
        } else {
          scriptCode += `    // Warning: No selector available for this copy action\n\n`;
        }
      } else if (action.type === 'press' && action.value) {
        scriptCode += `    log('Pressing ${action.value} key...');\n`;
        scriptCode += `    await page.keyboard.press('${this.escapeString(action.value)}');\n\n`;
      } else if (action.type === 'goto' && action.value) {
        scriptCode += `    log('Navigating to ${action.value}...');\n`;
        scriptCode += `    await page.goto('${this.escapeString(action.value)}');\n\n`;
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