import { execSync } from 'child_process';
import { readdirSync, statSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, relative } from 'path';

const srcDir = join(process.cwd(), 'src');
const distDir = join(process.cwd(), 'dist');

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);
  
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...getAllTsFiles(fullPath));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

console.log('Building with esbuild via tsx...');

// Get all TypeScript files
const tsFiles = getAllTsFiles(srcDir);
console.log(`Found ${tsFiles.length} TypeScript files`);

// Ensure dist directory exists
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Use esbuild to compile
try {
  execSync(`pnpm exec esbuild ${tsFiles.join(' ')} --outdir=${distDir} --platform=node --target=es2022 --format=cjs --sourcemap`, {
    stdio: 'inherit',
    cwd: process.cwd()
  });
  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
