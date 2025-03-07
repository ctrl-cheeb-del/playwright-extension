import type { ScriptDefinition } from '../core/types';

const script: ScriptDefinition = {
  id: 'test',
  name: 'Test Script',
  description: 'A simple test script that demonstrates the script structure (opens new tab)',
  useCurrentTab: false,  // explicitly set to false to show it opens a new tab
  async run(ctx) {
    ctx.log('Starting test script...');
    await ctx.page.goto('https://example.com');
    ctx.log('Navigated to example.com');
    const title = await ctx.page.title();
    ctx.log(`Page title: ${title}`);
  }
};

export default script; 