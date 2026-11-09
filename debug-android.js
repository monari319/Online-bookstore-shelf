const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const sdkPath = process.env.ANDROID_SDK_ROOT
    || process.env.ANDROID_HOME
    || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
const adbPath = path.join(sdkPath, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const npmCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

if (!fs.existsSync(adbPath)) {
    throw new Error(`Android Debug Bridge was not found at ${adbPath}. Install Android SDK Platform Tools.`);
}

function run(command, args) {
    const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
}

async function main() {
    const response = await fetch('http://127.0.0.1:3000/');
    if (!response.ok) {
        throw new Error(`The bookstore API returned HTTP ${response.status}. Start it with "npm start" first.`);
    }

    const devices = spawnSync(adbPath, ['devices'], { encoding: 'utf8' });
    if (devices.error) throw devices.error;
    if (devices.status !== 0) throw new Error('Could not query Android devices.');

    const connectedDevices = devices.stdout
        .split(/\r?\n/)
        .slice(1)
        .map(line => line.trim().split(/\s+/))
        .filter(parts => parts.length > 1 && parts[1] === 'device')
        .map(parts => parts[0]);
    if (connectedDevices.length !== 1) {
        throw new Error(`Expected one authorized Android device over USB; found ${connectedDevices.length}. Check "adb devices".`);
    }

    const device = connectedDevices[0];
    run(adbPath, ['-s', device, 'reverse', 'tcp:3000', 'tcp:3000']);
    run(npmCommand, ['cap', 'sync', 'android']);
    run(npmCommand, ['cap', 'run', 'android', '--target', device]);
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
