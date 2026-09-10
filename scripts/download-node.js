const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const NODE_VERSION = '20.18.0';
const TOOLS_DIR = path.join(__dirname, '..', 'tools');
const NODE_DIR = path.join(TOOLS_DIR, 'node');
const ZIP_PATH = path.join(TOOLS_DIR, 'node-portable.zip');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        https.get(response.headers.location, (res) => {
          res.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        }).on('error', reject);
      } else if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      } else {
        reject(new Error(`HTTP ${response.statusCode} when downloading Node.js`));
      }
    }).on('error', reject);
  });
}

async function main() {
  const arch = process.arch === 'x64' ? 'win-x64' : 'win-arm64';
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${arch}.zip`;
  
  fs.mkdirSync(TOOLS_DIR, { recursive: true });
  
  const nodeExe = path.join(NODE_DIR, 'node.exe');
  if (fs.existsSync(nodeExe)) {
    console.log('Bundled Node.js already present at', NODE_DIR);
    console.log('Files:', fs.readdirSync(NODE_DIR).join(', '));
    return;
  }
  
  console.log(`Downloading Node.js v${NODE_VERSION} for ${arch}...`);
  
  try {
    await download(url, ZIP_PATH);
  } catch (err) {
    console.error('Failed to download Node.js:', err.message);
    console.error('Please download manually from:', url);
    process.exit(1);
  }
  
  console.log('Extracting...');
  try {
    execSync(`powershell -Command "Expand-Archive -Path '${ZIP_PATH}' -DestinationPath '${NODE_DIR}' -Force"`, { stdio: 'inherit' });
  } catch (err) {
    console.error('Failed to extract Node.js:', err.message);
    process.exit(1);
  }
  
  const extractedDir = fs.readdirSync(NODE_DIR).find(f => f.startsWith('node-v'));
  if (extractedDir) {
    const files = fs.readdirSync(path.join(NODE_DIR, extractedDir));
    for (const file of files) {
      const src = path.join(NODE_DIR, extractedDir, file);
      const dest = path.join(NODE_DIR, file);
      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
      }
      fs.renameSync(src, dest);
    }
    fs.rmSync(path.join(NODE_DIR, extractedDir), { recursive: true, force: true });
  }
  
  fs.unlinkSync(ZIP_PATH);
  console.log('Node.js portable downloaded to', NODE_DIR);
  console.log('Files:', fs.readdirSync(NODE_DIR).join(', '));
}

main().catch(err => {
  console.error('Failed to download Node.js:', err);
  process.exit(1);
});
