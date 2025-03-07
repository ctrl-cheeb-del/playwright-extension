/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'fs';

// Copy static assets to dist
function copyStaticFiles() {
  // Ensure dist directory exists
  mkdirSync('dist', { recursive: true });
  
  // Copy icons
  copyFileSync('icons/icon16.png', 'dist/icon16.png');
  copyFileSync('icons/icon48.png', 'dist/icon48.png');
  copyFileSync('icons/icon128.png', 'dist/icon128.png');
  
  // Copy manifest and other static files
  copyFileSync('public/manifest.json', 'dist/manifest.json');
  copyFileSync('public/popup.html', 'dist/popup.html');
  copyFileSync('public/popup.css', 'dist/popup.css');
}

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        popup: resolve(__dirname, 'src/popup.ts')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  plugins: [{
    name: 'copy-static-files',
    closeBundle() {
      copyStaticFiles();
    }
  }]
});
