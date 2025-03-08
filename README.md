# Playwright Automation Chrome Extension

A Chrome extension that allows you to run Playwright automation scripts directly from your browser. This extension provides a clean, modern interface for managing and executing predefined scripts.

## Features

- Run Playwright automation scripts in your browser with a single click
- Support for both new tab and current tab automation
- Real-time execution logs
- **NEW: Dynamic JavaScript Execution for Remote Scripts**
- Sync scripts from GitHub repository

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [Bun](https://bun.sh/) or npm

### Setup

1. Clone this repository:
   ```bash
   git clone <repository-url>
   cd playwright-extension
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Build the extension:
   ```bash
   bun run build
   ```

4. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in the top-right corner)
   - Click "Load unpacked" and select the `dist` folder from this project

## Creating Scripts

Scripts are stored in the `src/scripts` directory for local scripts, or can be hosted in a GitHub repository for remote scripts.

### Local Scripts

Create a new file in the `src/scripts` directory (e.g., `myScript.ts`) with the following structure:

```typescript
import type { ScriptDefinition } from '../core/types';

const script: ScriptDefinition = {
  id: 'unique-script-id',
  name: 'My Script Name',
  description: 'What this script does',
  useCurrentTab: true, // Set to false to open in a new tab
  async run(ctx) {
    const { page, log } = ctx;
    
    // Your automation code goes here
    log('Starting script...');
    await page.goto('https://example.com');
    
    // Use Playwright commands to automate the page
    await page.fill('input[name="search"]', 'search term');
    await page.click('button[type="submit"]');
    
    log('Script completed');
  }
};

export default script;
```

### Remote Scripts (GitHub)

You can host scripts in a GitHub repository and sync them to your extension. The extension includes a dynamic JavaScript execution system that can safely execute these scripts without violating Chrome's Content Security Policy.

1. Create a GitHub repository (e.g., `playwright-script-examples`)
2. Add TypeScript files with the same structure as local scripts
3. Update the `GITHUB_REPO` constant in `src/services/scriptSync.ts` to point to your repository
4. Click the sync button in the extension to fetch and parse the scripts

Example remote script:

```typescript
// File: google-search.ts

import type { ScriptDefinition } from '../core/types';

const script: ScriptDefinition = {
  id: 'google-search',
  name: 'Google Search',
  description: 'Navigate to Google and perform a search',
  useCurrentTab: true,
  async run(ctx) {
    const { page, log } = ctx;
    
    log('Navigating to Google...');
    await page.goto('https://www.google.com');
    
    log('Waiting for page to load...');
    await page.waitForTimeout(1000);
    
    log('Typing search query...');
    await page.fill('input[name="q"]', 'playwright automation');
    
    log('Pressing Enter to search...');
    await page.press('input[name="q"]', 'Enter');
    
    log('Waiting for search results...');
    await page.waitForTimeout(2000);
    
    log('Search completed successfully!');
  }
};

export default script;
```

## How the Dynamic JavaScript Execution Works

The extension includes a dynamic JavaScript execution system that can safely execute remote scripts without violating Chrome's Content Security Policy:

1. **Script Extraction**: When you sync scripts from GitHub, the extension fetches the TypeScript files and extracts the script information and function body.

2. **Dynamic Proxy**: The system creates a dynamic proxy around the Playwright `page` object that intercepts all method calls.

3. **Method Forwarding**: Any method call on the proxied `page` object is automatically forwarded to the real Playwright API.

4. **Safe Execution**: Instead of using `eval()` directly, the system uses a controlled execution environment with access only to the provided context.

5. **Full JavaScript Support**: This approach allows scripts to use any Playwright method, not just predefined ones, while still complying with Chrome's security restrictions.

This approach is similar to implementing a lightweight JavaScript engine that bridges to the real Playwright API, allowing for maximum flexibility while maintaining security.

## Using the Extension

1. Click on the extension icon to open the popup
2. You'll see a list of available scripts with their descriptions
3. Click "Run" to execute a script
4. View real-time logs by clicking the logs button
5. Click the sync button to fetch remote scripts from GitHub

## Troubleshooting

- If scripts aren't appearing in the UI, make sure they export a default `ScriptDefinition` object
- Check the browser console for any errors
- Ensure you've reloaded the extension after making changes to scripts

## License

ISC
