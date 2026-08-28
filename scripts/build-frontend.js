const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs-extra');

const outDir = path.join(__dirname, '../public');

async function build() {
  await fs.ensureDir(outDir);

  await esbuild.build({
    entryPoints: ['src/frontend/main.jsx'],
    bundle: true,
    outfile: path.join(outDir, 'app.js'),
    format: 'iife',
    target: ['es2020'],
    minify: process.argv.includes('--prod'),
    sourcemap: !process.argv.includes('--prod'),
    define: {
      'process.env.NODE_ENV': process.argv.includes('--prod') ? '"production"' : '"development"'
    }
  });

  await fs.copy('src/frontend/index.html', path.join(outDir, 'index.html'));

  console.log('Frontend built to', outDir);
}

build().catch(e => { console.error(e); process.exit(1); });
