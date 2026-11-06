// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseXml } from '../src/epub/utils/xmlUtils';

describe('E-056: XML/DTD e entidades externas em EPUB', () => {
  it('aceita DTD pública DAISY NCX padronizada sem resolver dados externos', () => {
    const xml = '<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" ' +
      '"http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">' +
      '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"/>';
    expect(parseXml(xml).documentElement.localName).toBe('ncx');
  });
  it('aceita DTD XHTML 1.1 legada conhecida', () => {
    const xml = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" ' +
      '"http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">' +
      '<html xmlns="http://www.w3.org/1999/xhtml"/>';
    expect(parseXml(xml).documentElement.localName).toBe('html');
  });
  it('bloqueia entidade interna, expansion bomb e DTD externa arbitrária', () => {
    const bad = [
      '<!DOCTYPE root [<!ENTITY x "expansão">]><root>&x;</root>',
      '<!DOCTYPE root [<!ENTITY a "x"><!ENTITY b "&a;&a;">]><root>&b;</root>',
      '<!DOCTYPE root SYSTEM "file:///etc/passwd"><root/>',
      '<!DOCTYPE root PUBLIC "malicious" "https://example.net/evil.dtd"><root/>',
    ];
    for (const xml of bad) expect(() => parseXml(xml)).toThrow(/DOCTYPE|Entidades/u);
  });
  it('impede XInclude por namespace, sem bloquear namespaces XML legítimos', () => {
    const evil = '<root xmlns:xi="http://www.w3.org/2001/XInclude">' +
      '<xi:include href="file:///etc/passwd"/></root>';
    expect(() => parseXml(evil)).toThrow(/XInclude/u);
    expect(parseXml('<root xmlns:xi="http://www.w3.org/2001/XInclude"><p/></root>')
      .documentElement.localName).toBe('root');
  });
  it('não classifica como entidade ativa textos literais de comentários/CDATA', () => {
    const xml = '<root><!-- Exemplo <!ENTITY x "literal"> -->' +
      '<text><![CDATA[<!DOCTYPE evil> &xx;]]></text></root>';
    expect(parseXml(xml).documentElement.localName).toBe('root');
  });
});
