import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = readFileSync('netlify.toml', 'utf8');
const csp = /Content-Security-Policy\s*=\s*"([^"]+)"/u.exec(config)?.[1] ?? '';
const directives = new Map<string, string[]>();
for (const fragment of csp.split(';')) {
  const [name, ...args] = fragment.trim().split(/\s+/u);
  if (name) directives.set(name, args);
}
const values = (name: string): string[] => directives.get(name) ?? [];

describe('E-062: proteção CSP/Netlify compatível com app EPUB 100% local', () => {
  it('nega scripts remotos, inline e código avaliado dinamicamente', () => {
    expect(values('default-src')).toEqual(["'none'"]);
    expect(values('script-src')).toEqual(["'self'"]);
    expect(values('script-src')).not.toContain("'unsafe-eval'");
    expect(values('script-src')).not.toContain('blob:');
    expect(values('script-src')).not.toContain('data:');
    expect(values('object-src')).toEqual(["'none'"]);
  });
  it('permite somente os blobs e dados exigidos por imagens/EPUBs locais', () => {
    expect(values('img-src')).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:']));
    expect(values('media-src')).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:']));
    expect(values('font-src')).toEqual(expect.arrayContaining(["'self'", 'data:']));
  });
  it('bloqueia conexões remotas e incorporações de terceiros', () => {
    expect(values('connect-src')).toEqual(["'self'"]);
    expect(values('base-uri')).toEqual(["'none'"]);
    expect(values('form-action')).toEqual(["'none'"]);
    expect(values('frame-ancestors')).toEqual(["'none'"]);
    expect(values('worker-src')).toEqual(["'none'"]);
  });
  it('declara proteções básicas de cabeçalho no deploy Netlify', () => {
    expect(config).toMatch(/Strict-Transport-Security\s*=\s*"max-age=31536000"/u);
    expect(config).toMatch(/X-Content-Type-Options\s*=\s*"nosniff"/u);
    expect(config).toMatch(/Referrer-Policy\s*=\s*"strict-origin-when-cross-origin"/u);
    expect(config).toMatch(/for\s*=\s*"\/\*"/u);
  });
});
