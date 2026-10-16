import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { StringDecoder } from 'node:string_decoder';

const maxReadBytes = 64_000;

interface FileCursor {
  path: string;
  offset: number;
  identity: string;
  decoder: StringDecoder;
}

interface FileRead {
  cursor: FileCursor;
  text: string;
  lossy: boolean;
  error?: string;
}

/** Independent byte cursors. Reopening detects replacement and truncation. */
export function logFiles(paths: string[]) {
  let cursors = [...new Set(paths)].map(createCursor);
  return () => {
    const reads = cursors.map(readLogFile);
    cursors = reads.map((read) => read.cursor);
    return {
      text: reads.map((read) => read.text).join(''),
      lossy: reads.some((read) => read.lossy),
      errors: reads.flatMap((read) => (read.error ? [read.error] : [])),
    };
  };
}

function createCursor(path: string): FileCursor {
  if (!isAbsolute(path)) throw new Error('log_paths must contain absolute paths');
  return { path, offset: 0, identity: '', decoder: new StringDecoder('utf8') };
}

function readLogFile(previous: FileCursor): FileRead {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(previous.path, 'r');
    return readOpenFile(descriptor, previous);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'unreadable';
    return {
      cursor: previous,
      text: '',
      lossy: false,
      error: `${previous.path}: ${code}`,
    };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readOpenFile(descriptor: number, previous: FileCursor): FileRead {
  const stat = fstatSync(descriptor);
  if (!stat.isFile()) throw new Error('not a regular file');

  const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
  const replaced = previous.identity !== identity || stat.size < previous.offset;
  const cursor = replaced ? createCursor(previous.path) : previous;
  const skippedBytes = Math.max(0, stat.size - cursor.offset - maxReadBytes);
  const offset = cursor.offset + skippedBytes;
  const decoder = skippedBytes ? new StringDecoder('utf8') : cursor.decoder;

  const buffer = Buffer.alloc(stat.size - offset);
  const count = readSync(descriptor, buffer, 0, buffer.length, offset);
  const chunk = decoder.write(buffer.subarray(0, count));
  return {
    cursor: { path: previous.path, identity, offset: offset + count, decoder },
    text: chunk ? `\n[log file: ${previous.path}]\n${chunk}` : '',
    lossy: skippedBytes > 0 || (replaced && Boolean(previous.identity)),
  };
}
