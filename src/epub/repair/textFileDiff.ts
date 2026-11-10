export interface TextFileDiff {
  path: string;
  kind: 'added' | 'removed' | 'modified';
  beforeLines: number;
  afterLines: number;
  preview: string;
  truncated: boolean;
}

const TEXT_EXTENSION = /\.(?:xhtml?|css|opf|ncx)$/iu;
const MAX_PREVIEW_BYTES = 256 * 1024;
const MAX_PREVIEW_CHARS = 12_000;
const MAX_FILE_DIFFS = 60;

function equalBytes(left: Uint8Array | undefined, right: Uint8Array | undefined): boolean {
  if (!left || !right) return left === right;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}




export function createTextFileDiffs(
  before: ReadonlyMap<string, Uint8Array>,
  after: ReadonlyMap<string, Uint8Array>,
): TextFileDiff[] {
  const paths = Array.from(new Set([...before.keys(), ...after.keys()]))
    .filter((path) => TEXT_EXTENSION.test(path))
    .sort((left, right) => left.localeCompare(right));
  const changed = paths.filter((path) => !equalBytes(before.get(path), after.get(path)));
  return changed.slice(0, MAX_FILE_DIFFS).map((path): TextFileDiff => {
    const oldBytes = before.get(path);
    const newBytes = after.get(path);
    const kind = !oldBytes ? 'added' : !newBytes ? 'removed' : 'modified';
    if ((oldBytes?.length ?? 0) > MAX_PREVIEW_BYTES ||
        (newBytes?.length ?? 0) > MAX_PREVIEW_BYTES) {
      return { path, kind, beforeLines: 0, afterLines: 0, truncated: true,
        preview: 'Prévia omitida: arquivo de texto grande demais para diff seguro. ' +
          'A alteração foi registrada; compare os arquivos completos em editor local.' };
    }
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const left = oldBytes ? decoder.decode(oldBytes).replace(/\r\n/gu, '\n').split('\n') : [];
    const right = newBytes ? decoder.decode(newBytes).replace(/\r\n/gu, '\n').split('\n') : [];
    const { preview, truncated } = lineDiff(left, right);
    return {
      path, kind, beforeLines: left.length, afterLines: right.length,
      preview, truncated,
    };
  });
}

 
function lineDiff(left: string[], right: string[]): { preview: string; truncated: boolean } {
  if (left.length > 180 || right.length > 180 || left.length * right.length > 20_000) {
    return { truncated: true,
      preview: 'Alteração extensa: prévia não calculada para preservar memória. ' +
        'Os arquivos originais e corrigidos devem ser comparados em um editor.' };
  }
  const n = left.length;
  const m = right.length;
  const stride = m + 1;
  const dp = new Uint16Array((n + 1) * stride);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * stride + j] = left[i] === right[j]
        ? 1 + dp[(i + 1) * stride + j + 1]!
        : Math.max(dp[(i + 1) * stride + j]!, dp[i * stride + j + 1]!);
    }
  }
  const operations: Array<{ type: ' ' | '+' | '-'; text: string }> = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && left[i] === right[j]) {
      operations.push({ type: ' ', text: left[i]! }); i++; j++;
    } else if (j < m && (i === n || dp[i * stride + j + 1]! >= dp[(i + 1) * stride + j]!)) {
      operations.push({ type: '+', text: right[j]! }); j++;
    } else {
      operations.push({ type: '-', text: left[i]! }); i++;
    }
  }
  
  const wanted = new Set<number>();
  operations.forEach((operation, index) => {
    if (operation.type === ' ') return;
    for (let pos = Math.max(0, index - 3); pos <= Math.min(operations.length - 1, index + 3); pos++) {
      wanted.add(pos);
    }
  });
  const lines = ['--- original', '+++ corrigido'];
  let skipping = false;
  for (const [index, op] of operations.entries()) {
    if (!wanted.has(index)) {
      if (!skipping) lines.push('@@ ... linhas idênticas omitidas ...');
      skipping = true;
      continue;
    }
    skipping = false;
    lines.push(op.type + op.text);
  }
  let preview = lines.join('\n');
  const truncated = preview.length > MAX_PREVIEW_CHARS;
  if (truncated) preview = preview.slice(0, MAX_PREVIEW_CHARS) + '\n@@ ... prévia truncada ...';
  return { preview, truncated };
}
