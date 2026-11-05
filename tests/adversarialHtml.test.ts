// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeActiveContentMarkup } from '../src/epub/sanitize/sanitizeActiveContent';
import { sanitizeHtmlDocument } from '../src/epub/sanitize/sanitizeHtml';

const filePath = 'OEBPS/Text/capitulo.xhtml';
const options = {
  sanitizeScripts: true,
  kindleSafeMode: true,
  removeRemoteResourceLinks: true,
} as const;

function xhtml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:xlink="http://www.w3.org/1999/xlink">
  <head><title>Teste de segurança</title></head>
  <body>${body}</body>
</html>`;
}

function parse(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xhtml+xml');
}

describe('testes adversariais de sanitização XHTML no DOM', () => {
  it('E-057: preserva imagens raster data: sem permitir data:svg ou HTML executável', () => {
    const input = xhtml(
      '<img id="safe" src="data:image/png;base64,AAECAw=="/>' +
      '<img id="unsafe" src="data:image/svg+xml;base64,PHN2Zz4="/>' +
      '<a id="link" href="data:text/html;base64,PHNjcmlwdD4=">Texto</a>',
    );
    const clean = sanitizeActiveContentMarkup(input, filePath, {
      ...options, removeRemoteResourceLinks: true,
    });
    const doc = parse(clean.text);
    expect(doc.getElementById('safe')?.getAttribute('src')).toBe('data:image/png;base64,AAECAw==');
    expect(doc.getElementById('unsafe')?.hasAttribute('src')).toBe(false);
    expect(doc.getElementById('link')?.hasAttribute('href')).toBe(false);
  });

  it('E-057: srcset não divide a vírgula dentro de data:image e mantém imagem segura', () => {
    const input = xhtml('<img srcset="data:image/png;base64,AAECAw== 1x, javascript:alert(1) 2x" />');
    const clean = sanitizeActiveContentMarkup(input, filePath, options);
    const node = parse(clean.text).getElementsByTagName('img')[0]!;
    expect(node.getAttribute('srcset')).toBe('data:image/png;base64,AAECAw== 1x');
    expect(node.getAttribute('srcset')).not.toContain('javascript');
  });


  it('E-016/E-054: neutraliza expression e behavior sem descartar outras declarações', () => {
    const markup = xhtml(
      '<style>p{color:blue;width:expression(alert(1));font-weight:bold}</style>' +
      '<p style="color:red;behavior:url(#plugin);font-style:italic">Conteúdo</p>',
    );
    const result = sanitizeActiveContentMarkup(markup, filePath, options);
    const doc = parse(result.text);
    const style = doc.getElementsByTagName('style')[0];
    expect(style?.textContent).toContain('color:blue');
    expect(style?.textContent).toContain('font-weight:bold');
    expect(style?.textContent).not.toContain('expression(');
    const inline = doc.getElementsByTagName('p')[0]?.getAttribute('style') ?? '';
    expect(inline).toContain('color:red');
    expect(inline).toContain('font-style:italic');
    expect(inline).not.toContain('behavior:');
  });

  it('E-016: CSS perigoso não elimina regras e estilos legítimos do XHTML', () => {
    const original = xhtml(
      '<style>p{color:blue}.bad{background:url("javascript:alert(1)")}</style>' +
      '<p style="color:red;background:url(&quot;javascript:alert(2)&quot;)">Texto preservado</p>',
    );
    const result = sanitizeActiveContentMarkup(original, filePath, {
      ...options, removeRemoteResourceLinks: false,
    });
    const doc = parse(result.text);
    expect(result.changed).toBe(true);
    expect(doc.getElementsByTagName('style')).toHaveLength(1);
    expect(doc.getElementsByTagName('style')[0]?.textContent).toContain('color:blue');
    expect(doc.getElementsByTagName('style')[0]?.textContent).not.toContain('javascript:');
    expect(doc.getElementsByTagName('p')[0]?.getAttribute('style')).toContain('color:red');
    expect(doc.getElementsByTagName('p')[0]?.getAttribute('style')).not.toContain('javascript:');
    expect(doc.getElementsByTagName('p')[0]?.textContent).toBe('Texto preservado');
  });

  it('remove javascript ofuscado por entidade HTML, handlers e scripts sem perder o texto', () => {
    const input = xhtml(
      '<p id="texto">Capítulo válido</p><a href="java&#x73;cript:alert(1)" onclick="alert(2)">Continuar</a>' +
      '<script>globalThis.pwned=true</script><img src="capa.jpg" onerror="alert(3)" />',
    );
    const result = sanitizeActiveContentMarkup(input, filePath, options);
    const doc = parse(result.text);
    expect(result.changed).toBe(true);
    expect(doc.getElementsByTagName('script')).toHaveLength(0);
    const link = doc.getElementsByTagName('a')[0]!;
    expect(link.hasAttribute('href')).toBe(false);
    expect(link.hasAttribute('onclick')).toBe(false);
    expect(doc.getElementsByTagName('img')[0]?.hasAttribute('onerror')).toBe(false);
    expect(doc.getElementById('texto')?.textContent).toBe('Capítulo válido');
    expect(link.textContent).toBe('Continuar');
  });

  it('remove SVG interativo, href namespaced, iframe e meta refresh', () => {
    const input = xhtml(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">' +
      '<a xlink:href="javascript:alert(2)"><text>Legenda</text></a>' +
      '<foreignObject><p xmlns="http://www.w3.org/1999/xhtml">Ativo</p></foreignObject></svg>' +
      '<iframe src="https://evil.invalid" />' +
      '<meta http-equiv="refresh" content="0; url=https://evil.invalid" />',
    );
    const doc = parse(sanitizeActiveContentMarkup(input, filePath, options).text);
    const svg = doc.getElementsByTagNameNS('http://www.w3.org/2000/svg', 'svg')[0]!;
    expect(svg.hasAttribute('onload')).toBe(false);
    expect(doc.getElementsByTagNameNS('http://www.w3.org/2000/svg', 'a')[0]?.hasAttribute('xlink:href')).toBe(false);
    expect(doc.getElementsByTagName('foreignObject')).toHaveLength(0);
    expect(doc.getElementsByTagName('iframe')).toHaveLength(0);
    expect(doc.getElementsByTagName('meta')).toHaveLength(0);
  });

  it('remove URLs externas e data URI em srcset, preservando recursos internos', () => {
    const input = xhtml('<img src="../Images/cover.jpg" srcset="../Images/cover.jpg 1x, https://x.invalid/img 2x" />' +
      '<a href="mailto:attacker@invalid">Contato</a>');
    const doc = parse(sanitizeActiveContentMarkup(input, filePath, options).text);
    expect(doc.getElementsByTagName('img')[0]?.getAttribute('src')).toBe('../Images/cover.jpg');
    expect(doc.getElementsByTagName('img')[0]?.getAttribute('srcset')).toBe('../Images/cover.jpg 1x');
    expect(doc.getElementsByTagName('a')[0]?.hasAttribute('href')).toBe(false);
  });

  it('preserva XHTML benigno byte a byte quando nenhuma alteração é necessária', () => {
    const original = xhtml('<h1>Olá, leitor</h1><p>Português: café, ação e coração.</p>');
    const result = sanitizeActiveContentMarkup(original, filePath, options);
    expect(result.changed).toBe(false);
    expect(result.text).toBe(original);
  });

  it('não tenta reparar XHTML malformado como se fosse seguro', () => {
    const broken = xhtml('<p><strong>texto não fechado</p>');
    expect(() => sanitizeActiveContentMarkup(broken, filePath, options)).toThrow(/XHTML inválido/u);
  });

  it('também aplica o parser estrutural ao fluxo completo de sanitização', () => {
    const original = xhtml('<a href="java&#x73;cript:alert(1)">Livro</a>');
    const result = sanitizeHtmlDocument(original, {
      ...options,
      filePath,
      existingFiles: new Set([filePath]),
    });
    expect(result.changed).toBe(true);
    const link = parse(result.text).getElementsByTagName('a')[0]!;
    expect(link.hasAttribute('href')).toBe(false);
    expect(link.textContent).toBe('Livro');
  });

  it('permite URLs HTTPS legítimas se links remotos forem autorizados, sem liberar javascript', () => {
    const result = sanitizeActiveContentMarkup(
      xhtml('<a href="https://example.org">Referência</a>' +
        '<a href="javascript:alert(1)">Ataque</a>'),
      filePath,
      { ...options, removeRemoteResourceLinks: false },
    );
    const links = parse(result.text).getElementsByTagName('a');
    expect(links[0]?.getAttribute('href')).toBe('https://example.org');
    expect(links[1]?.hasAttribute('href')).toBe(false);
  });
});
