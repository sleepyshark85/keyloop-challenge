/** Minimal YAML frontmatter reader: scalars, inline arrays, quoted strings. */
export function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let [, k, v] = kv;
    v = v.replace(/\s+#.*$/, '').trim();
    if (v === '' || v === 'null') { out[k] = null; continue; }
    if (v.startsWith('[')) {
      out[k] = v.slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      continue;
    }
    out[k] = v.replace(/^["']|["']$/g, '');
  }
  return out;
}

/** Everything after the closing --- of the frontmatter block. */
export function body(text) {
  const m = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  return m ? m[1] : text;
}
