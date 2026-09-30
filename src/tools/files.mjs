import { appendFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { expandPath, formatBytes, image, localTime, text } from '../util.mjs';

const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
const MAX_READ_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_LIST = 500;

const pathProperty = { type: 'string', description: 'Full path, or a path inside the home folder (for example Documents/notes.txt).' };

export const readFileTool = {
  name: 'read_file',
  description: 'Read a text file, or look at a picture (png, jpg, gif, webp), on the computer.',
  inputSchema: {
    type: 'object',
    properties: { path: pathProperty, max_characters: { type: 'number', description: 'Longest text to return. Default 100000.' } },
    required: ['path'],
  },
  summary: (args) => args.path,
  async run(args) {
    const path = expandPath(args.path);
    const info = await stat(path);
    if (info.isDirectory()) throw new Error(`${path} is a folder. Use list_folder to see what is in it.`);
    const type = IMAGE_TYPES[extname(path).toLowerCase()];
    if (type && info.size <= MAX_IMAGE_BYTES) return image((await readFile(path)).toString('base64'), type);
    if (info.size > MAX_READ_BYTES) throw new Error(`${path} is ${formatBytes(info.size)}, too big to read whole. Use run_command to look at part of it.`);
    const bytes = await readFile(path);
    if (bytes.subarray(0, 8000).includes(0)) return text(`${path} is not a text file (${formatBytes(info.size)}).`);
    const max = Number(args.max_characters) || 100_000;
    const content = bytes.toString('utf8');
    return text(content.length > max ? `${content.slice(0, max)}\n\n(Showing the first ${max} of ${content.length} characters.)` : content);
  },
};

export const writeFileTool = {
  name: 'write_file',
  description: 'Save text to a file on the computer, creating its folder if needed. Replaces the file unless append is true.',
  inputSchema: {
    type: 'object',
    properties: {
      path: pathProperty,
      content: { type: 'string', description: 'The text to save.' },
      append: { type: 'boolean', description: 'Add to the end of the file instead of replacing it.' },
    },
    required: ['path', 'content'],
  },
  summary: (args) => args.path,
  async run(args) {
    const path = expandPath(args.path);
    await mkdir(dirname(path), { recursive: true });
    await (args.append ? appendFile : writeFile)(path, String(args.content), 'utf8');
    return text(`${args.append ? 'Added' : 'Saved'} ${String(args.content).length} characters to ${path}.`);
  },
};

export const listFolder = {
  name: 'list_folder',
  description: 'List what is in a folder on the computer (the home folder if no path is given), folders first.',
  inputSchema: {
    type: 'object',
    properties: { path: pathProperty, show_hidden: { type: 'boolean', description: 'Include hidden files (names starting with a dot).' } },
  },
  summary: (args) => args.path ?? '~',
  async run(args) {
    const path = expandPath(args.path);
    const entries = (await readdir(path, { withFileTypes: true }))
      .filter((e) => args.show_hidden || !e.name.startsWith('.'))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    const lines = await Promise.all(entries.slice(0, MAX_LIST).map(async (e) => {
      if (e.isDirectory()) return `[folder] ${e.name}`;
      const info = await stat(join(path, e.name)).catch(() => null);
      return info ? `${e.name}  (${formatBytes(info.size)}, changed ${localTime(info.mtimeMs)})` : e.name;
    }));
    if (entries.length > MAX_LIST) lines.push(`... and ${entries.length - MAX_LIST} more.`);
    return text(`${path}\n${lines.join('\n') || '(empty)'}`);
  },
};
