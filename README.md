# Playwright Automation Chrome Extension

A Chrome extension that allows you to run Playwright automation scripts directly from your browser. This extension provides a clean, modern interface for managing and executing predefined scripts.

## Features

- Run Playwright automation scripts in your browser with a single click
- Support for both new tab and current tab automation
- Real-time execution logs

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

Scripts are stored in the `src/scripts` directory. Each script is a TypeScript file that exports a default `ScriptDefinition` object.

### Script Structure

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

### Script Context

Each script receives a `ctx` object with the following properties:

- `page`: A Playwright [Page](https://playwright.dev/docs/api/class-page) object for browser automation
- `log`: A function to log messages to the extension UI

### Script Options

- `id`: A unique identifier for the script
- `name`: The display name shown in the UI
- `description`: A brief description of what the script does
- `useCurrentTab`: If `true`, the script will run in the current tab; if `false`, it will open a new tab
- `run`: The async function containing the automation code

## Example Scripts

### GitHub Search Script

```typescript
import type { ScriptDefinition } from '../core/types';

const script: ScriptDefinition = {
  id: 'github-search',
  name: 'GitHub Search',
  description: 'Navigate to a GitHub repo and perform a search',
  useCurrentTab: true,
  async run(ctx) {
    const { page, log } = ctx;
    
    log('Navigating to GitHub repository...');
    await page.goto('https://github.com/ctrl-cheeb-del/resoled');
    
    log('Waiting for 2 seconds...');
    await page.waitForTimeout(2000);
    
    log('Pressing / key to open search...');
    await page.keyboard.press('/');
    
    log('Waiting another 2 seconds...');
    await page.waitForTimeout(2000);
    
    log('Typing search query...');
    await page.keyboard.type('hello world');
    
    log('Search completed');
  }
};

export default script;
```

### Simple Test Script

```typescript
import type { ScriptDefinition } from '../core/types';

const script: ScriptDefinition = {
  id: 'test',
  name: 'Test Script',
  description: 'A simple test script that demonstrates the script structure',
  useCurrentTab: false, // Opens in a new tab
  async run(ctx) {
    ctx.log('Starting test script...');
    await ctx.page.goto('https://example.com');
    ctx.log('Navigated to example.com');
    const title = await ctx.page.title();
    ctx.log(`Page title: ${title}`);
  }
};

export default script;
```

## Using the Extension

1. Click on the extension icon to open the popup
2. You'll see a list of available scripts with their descriptions
3. Click "Run" to execute a script
4. View real-time logs by clicking the logs button

## Troubleshooting

- If scripts aren't appearing in the UI, make sure they export a default `ScriptDefinition` object
- Check the browser console for any errors
- Ensure you've reloaded the extension after making changes to scripts
