import type { ScriptDefinition } from '../core/types';

const script: ScriptDefinition = {
  id: 'github-search',
  name: 'GitHub Search',
  description: 'Navigate to a GitHub repo and perform a search',
  useCurrentTab: true,
  async run(ctx) {
    const { page, log } = ctx;
    
    log('Navigating to GitHub repository...');
    await page.goto('https://github.com/ctrl-cheeb-del/');
    
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