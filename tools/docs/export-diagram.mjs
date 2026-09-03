#!/usr/bin/env node
/**
 * Export a diagram-design HTML file to a standalone .svg beside it.
 *
 *   npm run diagram:export docs/diagrams/slice-loop.html
 *   npm run diagram:export docs/diagrams/*.html
 *
 * Why this exists rather than a one-off command: arc42 references the .svg, not
 * the .html, so an un-exported or badly-exported diagram is invisible to exactly
 * the reader it was drawn for (METHODOLOGY.md §4). Getting it wrong is quiet.
 *
 * Two things are easy to miss and both were got wrong first time:
 *
 *  1. INTRINSIC SIZE. The skill's HTML gives the <svg> its size through CSS
 *     (`svg{width:100%}`). A standalone file referenced by a markdown `![](…)`
 *     has no CSS, and a viewBox-only SVG has no intrinsic dimensions — so it
 *     collapses or renders at a renderer-chosen default. width/height are
 *     copied from the viewBox here.
 *
 *  2. XML STRICTNESS. A standalone .svg is parsed as XML, where a bare `&`
 *     starts an entity reference and kills the whole file. The Google Fonts
 *     separators must be `&amp;`.
 *
 * External font loading is blocked when an SVG is rendered via <img>, so
 * typography falls back to the stacks declared in each font-family. That is
 * cosmetic and intended — the .html source is the styled version.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'node:path';

const FONT_IMPORT =
  "<defs>\n  <style>@import url('https://fonts.googleapis.com/css2?" +
  'family=Instrument+Serif:ital@0;1&amp;family=Geist:wght@400;500;600&amp;' +
  "family=Geist+Mono:wght@400;500;600&amp;display=swap');</style>";

const inputs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!inputs.length) {
  console.error('usage: npm run diagram:export <file.html> [more.html …]');
  process.exit(2);
}

let failed = 0;
for (const file of inputs) {
  const { dir, name } = parse(file);
  const out = `${dir}/${name}.svg`;

  let html;
  try {
    html = readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`FAIL ${file} — ${err.message}`);
    failed++;
    continue;
  }

  const m = html.match(/<svg\b[\s\S]*?<\/svg>/);
  if (!m) {
    console.error(`FAIL ${file} — no <svg> block; this is not a diagram file`);
    failed++;
    continue;
  }
  let svg = m[0];

  const vb = svg.match(/viewBox="([\d.\s-]+)"/);
  if (!vb) {
    console.error(`FAIL ${file} — no viewBox; refusing to guess a size`);
    failed++;
    continue;
  }
  const [, , w, h] = vb[1].trim().split(/\s+/).map(Number);

  if (!/<svg[^>]*\sxmlns=/.test(svg)) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  // Intrinsic size — without this the file renders blank or collapsed in <img>.
  if (!/<svg[^>]*\swidth=/.test(svg)) {
    svg = svg.replace('<svg', `<svg width="${w}" height="${h}"`);
  }
  // Merge the font import into the existing <defs>; never add a second.
  svg = svg.includes('<defs>')
    ? svg.replace('<defs>', FONT_IMPORT, 1)
    : svg.replace(/(<svg[^>]*>)/, `$1\n${FONT_IMPORT}\n</defs>`);

  writeFileSync(out, `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`, 'utf8');

  // Fail loudly rather than shipping a file no browser will parse.

  const written = readFileSync(out, 'utf8');
  const balanced = (written.match(/<svg\b/g) ?? []).length === (written.match(/<\/svg>/g) ?? []).length;
  const bareAmp = /&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(written);
  if (!balanced || bareAmp) {
    console.error(`FAIL ${out} — ${!balanced ? 'unbalanced <svg>' : 'bare & would break XML parsing'}`);
    failed++;
    continue;
  }

  console.log(`  ${out}  ${w}×${h}  ${written.length.toLocaleString()} bytes`);
}

process.exit(failed ? 1 : 0);
