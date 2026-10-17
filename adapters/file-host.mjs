// Platform objects only. File policy, encoding, read/write loops and report
// sequencing are implemented by nodefiles/main.mbt and compiled to files.mjs.
import * as fs from 'node:fs';
import * as paths from 'node:path';
import { fileURLToPath } from 'node:url';
import { read_text, write_new, export_files, export_bundle } from './files.mjs';

function checked(source) {
  const result = JSON.parse(source);
  if (result.error) throw new Error(result.error);
  return result;
}
const path = value => value instanceof URL ? fileURLToPath(value) : value;
export const readText = (filename, limit = 8000000) => checked(read_text(fs, path(filename), limit)).text;
export const writeNew = (filename, text) => checked(write_new(fs, path(filename), text));
export const exportFiles = ({ input = '', output = '', json = '', htmlPath = '', html = '' }) =>
  checked(export_files(fs, paths, input, output, json, htmlPath, html));
export const exportBundle = (directory, history, result, html) =>
  checked(export_bundle(fs, paths, directory, history, result, html));
