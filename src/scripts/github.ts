import type { ScriptDefinition } from '../core/types';

const script: ScriptDefinition = {
  id: 'github-search',
  name: 'GitHub Search',
  description: 'Navigate to a GitHub repo and perform a search',
  useCurrentTab: true,
  parameters: [
    {
      name: 'searchQuery',
      description: 'The text to search for on GitHub',
      type: 'string',
      default: 'hello world',
      required: true
    }
  ],
  async run(ctx) {
    const { page, log, parameters } = ctx;
    
    // Get the search query parameter or use default
    const searchQuery = parameters?.searchQuery || 'hello world';
    
    log('Navigating to GitHub repository...');
    await page.goto('https://github.com/ctrl-cheeb-del/');
    
    log('Waiting for 2 seconds...');
    await page.waitForTimeout(2000);
    
    log('Pressing / key to open search...');
    await page.keyboard.press('/');
    
    log('Waiting another 2 seconds...');
    await page.waitForTimeout(2000);
    
    log(`Typing search query: "${searchQuery}"...`);
    await page.keyboard.type(searchQuery);
    
    log('Search completed');
  }
};

export default script; 