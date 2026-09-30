import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { image, isWindows, runShell } from '../util.mjs';

const MAX_WIDTH = 1600;

// Captures every monitor as one picture, scaled down to MAX_WIDTH, saved as JPEG to keep it small.
const WINDOWS_CAPTURE = `
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class Dpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }'
[Dpi]::SetProcessDPIAware() | Out-Null
$area = [System.Windows.Forms.SystemInformation]::VirtualScreen
$shot = New-Object System.Drawing.Bitmap $area.Width, $area.Height
[System.Drawing.Graphics]::FromImage($shot).CopyFromScreen($area.Left, $area.Top, 0, 0, $shot.Size)
$width = [Math]::Min([int]$env:MYPC_MAX_WIDTH, $shot.Width)
$height = [int]($shot.Height * $width / $shot.Width)
$small = New-Object System.Drawing.Bitmap $width, $height
$g = [System.Drawing.Graphics]::FromImage($small)
$g.InterpolationMode = 'HighQualityBicubic'
$g.DrawImage($shot, 0, 0, $width, $height)
$small.Save($env:MYPC_OUT, [System.Drawing.Imaging.ImageFormat]::Jpeg)
`;

export const screenshot = {
  name: 'screenshot',
  description: 'Take a picture of the computer screen (all monitors) to see what is on it.',
  inputSchema: { type: 'object', properties: {} },
  summary: () => '',
  async run() {
    const out = join(tmpdir(), `mypc-${randomBytes(6).toString('hex')}.jpg`);
    try {
      await capture(out);
      return image((await readFile(out)).toString('base64'), 'image/jpeg');
    } finally {
      await rm(out, { force: true });
    }
  },
};

async function capture(out) {
  if (isWindows) {
    const r = await runShell(WINDOWS_CAPTURE, { timeoutMs: 30_000, env: { MYPC_OUT: out, MYPC_MAX_WIDTH: String(MAX_WIDTH) } });
    if (r.code !== 0) throw new Error(`Could not take a screenshot: ${(r.stderr || r.error || '').trim()}`);
    return;
  }
  if (process.platform === 'darwin') {
    await run('screencapture', ['-x', '-t', 'jpg', out],
      'Could not take a screenshot. On a Mac, allow it once in System Settings > Privacy & Security > Screen Recording (turn on the app that runs MPC-MyPC, for example Claude or Terminal).');
    await run('sips', ['-Z', String(MAX_WIDTH), out], 'Could not shrink the screenshot.');
    return;
  }
  const attempts = [['grim', [out]], ['gnome-screenshot', ['-f', out]], ['scrot', ['-o', out]], ['import', ['-window', 'root', out]]];
  for (const [cmd, args] of attempts) {
    if (await run(cmd, args).then(() => true, () => false)) return;
  }
  throw new Error('Could not take a screenshot. Install one of: grim, gnome-screenshot, scrot, or imagemagick.');
}

function run(cmd, args, message) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'ignore' });
    child.on('error', () => reject(new Error(message ?? `${cmd} is not installed`)));
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(message ?? `${cmd} failed`))));
  });
}
