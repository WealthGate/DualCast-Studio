// Reproducible offline build of the vendored MIT-licensed DirectShow camera.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
if (process.platform !== 'win32') { console.log('Virtual camera native build is Windows only.'); process.exit(0); }
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'native/virtual-camera');
const output = path.join(root, 'assets/virtual-camera');
const vswhere = path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft Visual Studio/Installer/vswhere.exe');
const found = spawnSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8', windowsHide: true });
if (found.status !== 0 || !found.stdout.trim()) throw Error('Visual Studio C++ build tools are required for the virtual camera.');
const vcvars = path.join(found.stdout.trim(), 'VC/Auxiliary/Build/vcvarsall.bat');
for (const arch of ['x64', 'x86']) {
  const temp = path.join(root, 'tmp/native-virtual-camera', arch);
  const target = path.join(output, arch);
  fs.mkdirSync(temp, { recursive: true }); fs.mkdirSync(target, { recursive: true });
  const vendor = path.join(source, 'vendor');
  const files = ['baseclasses', 'softcamcore', 'softcam'].flatMap(dir => fs.readdirSync(path.join(vendor, dir)).filter(f => f.endsWith('.cpp')).map(f => path.join(vendor, dir, f)));
  const flags = ['/nologo', '/std:c++17', '/utf-8', '/EHsc', '/O2', '/MT', '/DNDEBUG', '/DWIN32', '/DUNICODE', '/D_UNICODE', '/D_CRT_SECURE_NO_WARNINGS', `/I"${vendor}"`, `/I"${path.join(vendor, 'baseclasses')}"`];
  const libraries = ['strmiids.lib', 'winmm.lib', 'ole32.lib', 'oleaut32.lib', 'uuid.lib', 'advapi32.lib', 'user32.lib', 'gdi32.lib'];
  // MSVC forwards /link arguments through the end of the physical response line.
  fs.writeFileSync(path.join(temp, 'camera.rsp'), [...flags, '/LD', ...files.map(f => `"${f}"`), `/Fe"${path.join(target, 'openchurch-camera.dll')}"`, '/link', `/DEF:"${path.join(vendor, 'softcam/softcam.def')}"`, ...libraries].join(' '));
  fs.writeFileSync(path.join(temp, 'host.rsp'), [...flags, `"${path.join(source, 'host.cpp')}"`, `/Fe"${path.join(target, 'openchurch-camera-host.exe')}"`, '/link', ...libraries].join(' '));
  fs.writeFileSync(path.join(temp, 'build.cmd'), ['@echo off', `call "%OC_CAMERA_VCVARS%" ${arch} >nul`, 'if errorlevel 1 exit /b %errorlevel%', 'cl.exe @camera.rsp', 'if errorlevel 1 exit /b %errorlevel%', 'cl.exe @host.rsp', 'exit /b %errorlevel%', ''].join('\r\n'));
  const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'build.cmd'], { cwd: temp, windowsHide: true, encoding: 'utf8', env: { ...process.env, OC_CAMERA_VCVARS: vcvars } });
  fs.writeFileSync(path.join(temp, 'build.log'), (result.stdout || '') + (result.stderr || ''));
  if (result.status !== 0) { process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || ''); throw Error(`Virtual camera ${arch} build failed.`); }
  console.log(`Built virtual camera ${arch}.`);
}
const hashes = {};
for (const arch of ['x64', 'x86']) for (const file of ['openchurch-camera.dll', 'openchurch-camera-host.exe']) {
  hashes[`${arch}/${file}`] = crypto.createHash('sha256').update(fs.readFileSync(path.join(output, arch, file))).digest('hex');
}
fs.writeFileSync(path.join(output, 'SOURCE.json'), JSON.stringify({ upstream: 'https://github.com/tshino/softcam', commit: '4d4e9d86467deee54208f0b58da9c1af8f75b1ee', format: 'RGBA 1280x720 30fps', hashes }, null, 2));
for (const name of ['README.md', 'THIRD_PARTY_NOTICES.txt']) fs.copyFileSync(path.join(source, name), path.join(output, name));
