// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { auditPreservation } from '../src/epub/repair/preservationAudit';
import type { LoadedEpub } from '../src/epub/model/epubTypes';
import type { PackageDocumentInfo } from '../src/epub/model/opfTypes';

const encode = (text: string) => new TextEncoder().encode(text);
const wrap = (body: string) => '<html xmlns="http://www.w3.org/1999/xhtml"><body>' +
  body + '</body></html>';
function fixture(oldMarkup: string, newMarkup: string, resources: string[] = [],
  cover?: {path:string; bytes:Uint8Array; previousPath?:string; allowedPages?:ReadonlySet<string>},
  remoteRemoval = false) {
  const path = 'OPS/Text/chapter.xhtml';
  const chapter = { id: 'chapter', resolvedPath: path, mediaType: 'application/xhtml+xml',
    exists: true };
  const pkg = { manifest: [chapter], spine: [{ idref: 'chapter',
    manifestItem: chapter }] } as unknown as PackageDocumentInfo;
  const files = new Map([[path, {bytes:encode(oldMarkup)}],
    ...resources.map((item) => [item, {bytes:Uint8Array.of(1,2,3)}] as const)]);
  const loaded = { files } as unknown as LoadedEpub;
  const output = new Map<string, Uint8Array>([[path, encode(newMarkup)],
    ...resources.map((item) => [item, Uint8Array.of(1,2,3)] as const)]);
  if (cover) output.set(cover.path,cover.bytes);
  return () => auditPreservation(loaded, output, pkg, pkg, new Set(), cover,
    new Set(), remoteRemoval);
}

describe('auditoria visual não destrutiva', () => {
  it('não troca tabela por parágrafo mesmo com texto idêntico', () => {
    const before = wrap('<table><tr><td>Preço 10</td><td>Preço 20</td></tr></table>');
    const after = wrap('<p>Preço 10Preço 20</p>');
    expect(fixture(before, after)).toThrow(/estrutura de tabelas/u);
  });
  it('bloqueia a perda de colspan e cabeçalhos com texto preservado', () => {
    const original = wrap('<table><tr><th colspan="2">Itens</th></tr></table>');
    expect(fixture(original, original.replace('colspan="2"','colspan="1"')))
      .toThrow(/células|mesclagens/u);
  });
  it('bloqueia troca de conteúdo de células sem alterar texto total', () => {
    const original = wrap('<table><tr><td>Gato</td><td>Cachorro</td></tr></table>');
    const changed = wrap('<table><tr><td>Cachorro</td><td>Gato</td></tr></table>');
    expect(fixture(original,changed)).toThrow();
  });
  it('aceita tabela com mesclagens e texto preservados', () => {
    const original = wrap('<table><tr><th rowspan="2">Tipo</th><td>Um</td></tr>' +
      '<tr><td>Dois</td></tr></table>');
    expect(fixture(original,original)()).toEqual([]);
  });
  it('não permite apagar imagem local válida se o texto do capítulo for igual', () => {
    const original = wrap('<p>Capítulo</p><img src="../Images/capa%20nova.png" alt="Capa"/>');
    const changed = wrap('<p>Capítulo</p>');
    expect(fixture(original,changed,['OPS/Images/capa nova.png']))
      .toThrow(/imagem, mídia ou fonte CSS/u);
  });
  it('permite substituir por marcador apenas quando a imagem realmente falta', () => {
    const original=wrap('<p>Texto</p><img src="../Images/ausente.png"/>');
    const changed=wrap('<p>Texto </p><span>[Imagem indisponível]</span>');
    expect(fixture(original,changed)()).toEqual(expect.arrayContaining([
      expect.stringMatching(/acréscimos/u),
    ]));
  });
  it('mantém a multiplicidade e a ordem de imagens locais', () => {
    const original=wrap('<img src="../Images/1.png"/><img src="../Images/2.png"/>');
    const changed=wrap('<img src="../Images/2.png"/><img src="../Images/1.png"/>');
    expect(fixture(original,changed,['OPS/Images/1.png','OPS/Images/2.png']))
      .toThrow(/imagem, mídia ou fonte CSS/u);
  });
  it('aceita troca de referência de capa somente na página aprovada', () => {
    const original=wrap('<img src="../Images/old.png"/>');
    const changed=wrap('<img src="../Images/new.jpg"/>');
    const approval={path:'OPS/Images/new.jpg',bytes:Uint8Array.of(7),
      previousPath:'OPS/Images/old.png',allowedPages:new Set(['OPS/Text/chapter.xhtml'])};
    expect(fixture(original,changed,['OPS/Images/old.png'],approval)()).toEqual([]);
    expect(fixture(original,changed,['OPS/Images/old.png'],
      {...approval,allowedPages:new Set(['OPS/Text/elsewhere.xhtml'])}))
      .toThrow(/imagem, mídia ou fonte CSS/u);
  });
  it('impede apagar folha de estilo local anexada via link', () => {
    const before=wrap('<link rel="stylesheet" href="../Styles/book.css"/><p>Texto</p>');
    const after=wrap('<p>Texto</p>');
    expect(fixture(before,after,['OPS/Styles/book.css']))
      .toThrow(/imagem, mídia ou fonte CSS/u);
  });
  it('permite clonar CSS da capa apenas nas páginas autorizadas', () => {
    const original=wrap('<link rel="stylesheet" href="../Styles/book.css"/>');
    const changed=wrap('<link rel="stylesheet" href="../Styles/book.epub-cover.css"/>');
    const cover={path:'OPS/Images/cover.jpg',bytes:Uint8Array.of(1),
      allowedPages:new Set(['OPS/Text/chapter.xhtml']),
      styleAliases:new Map([['OPS/Styles/book.css','OPS/Styles/book.epub-cover.css']])};
    const sources=['OPS/Styles/book.css','OPS/Styles/book.epub-cover.css'];
    expect(fixture(original,changed,sources,cover)()).toEqual([]);
    expect(fixture(original,changed,sources,
      {...cover,allowedPages:new Set<string>()})).toThrow(/fonte CSS/u);
  });
  it('preserva link HTTP(S) externo que não é risco e não teve remoção autorizada', () => {
    const original=wrap('<p>Veja <a href="https://example.org/reference?q=1&amp;p=2">a referência</a>.</p>');
    const changed=wrap('<p>Veja <a>a referência</a>.</p>');
    expect(fixture(original,changed)).toThrow(/mídia|referenciada/u);
    // Consentimento explícito de remover recursos remotos autoriza o resultado.
    expect(fixture(original,changed,[],undefined,true)()).toEqual([]);
  });
  it('protege fontes CSS externas HTTPS vinculadas ao XHTML', () => {
    const original=wrap('<link rel="stylesheet" href="https://cdn.example.org/book.css"/>' +
      '<p>Capítulo</p>');
    const changed=wrap('<p>Capítulo</p>');
    expect(fixture(original,changed)).toThrow(/fonte CSS/u);
    expect(fixture(original,changed,[],undefined,true)()).toEqual([]);
  });
  it('não perde imagem remota segura por engano, sem confundir com malware', () => {
    const original=wrap('<p>Foto</p><img src="https://cdn.example.org/photo.png"/>');
    const changed=wrap('<p>Foto</p><img/>');
    expect(fixture(original,changed)).toThrow(/imagem/u);
  });
  it('preserva links mailto e tel salvo remoção externa voluntária', () => {
    const original=wrap('<p><a href="mailto:editor@example.org">Contato</a>' +
      '<a href="tel:+551100000000">Ligar</a></p>');
    const changed=wrap('<p><a>Contato</a><a>Ligar</a></p>');
    expect(fixture(original,changed)).toThrow(/referenciada/u);
    expect(fixture(original,changed,[],undefined,true)()).toEqual([]);
  });
  it('aceita neutralizar javascript: em href sem preservar esquema executável', () => {
    const original=wrap('<p><a href="javascript:alert(1)">Link</a></p>');
    const changed=wrap('<p><a>Link</a></p>');
    expect(fixture(original,changed)()).toEqual([]);
  });
  it('não altera referência interna de símbolo SVG enquanto mantém geometria', () => {
    const original=wrap('<svg xmlns="http://www.w3.org/2000/svg">' +
      '<symbol id="icon"><rect width="2"/></symbol><use href="#icon"/></svg>');
    const changed=original.replace('href="#icon"','href="#not-found"');
    expect(fixture(original,changed)).toThrow(/imagem, mídia ou fonte CSS/u);
  });
  it('protege a geometria de SVG embutido e aceita remover script ativo', () => {
    const root=wrap('<p>Figura</p><svg xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M0 0L2 2"/></svg>');
    expect(fixture(root,root.replace('M0 0L2 2','M0 0L3 3')))
      .toThrow(/geometria/u);
    const active=wrap('<p>Figura</p><svg xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M0 0L2 2"/><script>alert(1)</script></svg>');
    expect(fixture(active,root)()).toEqual([]);
  });
  it('recusa apagar SVG embutido mesmo se não havia texto', () => {
    const old=wrap('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1"/></svg>');
    expect(fixture(old,wrap(''))).toThrow(/SVG editorial/u);
  });
});

function ncxFixture(before: string, after: string) {
  const ncxPath='OPS/toc.ncx';
  const chapterPath='OPS/ch.xhtml';
  const chapter={id:'chapter',exists:true,resolvedPath:chapterPath,
    mediaType:'application/xhtml+xml'};
  const ncx={id:'ncx',exists:true,resolvedPath:ncxPath,mediaType:'application/x-dtbncx+xml'};
  const pkg={manifest:[chapter,ncx],ncxItem:ncx,spine:[{idref:'chapter',manifestItem:chapter}]} as unknown as PackageDocumentInfo;
  const html=wrap('<p>Capítulo</p>');
  const source={files:new Map([[chapterPath,{bytes:encode(html)}],
    [ncxPath,{bytes:encode(before)}]])} as unknown as LoadedEpub;
  const target=new Map([[chapterPath,encode(html)],[ncxPath,encode(after)]]);
  return () => auditPreservation(source,target,pkg,pkg);
}
const baseNcx='<ncx><navMap><navPoint id="p1" playOrder="3">' +
  '<navLabel><text>Parte um</text></navLabel><content src="ch.xhtml"/>' +
  '<navPoint id="p2" playOrder="9"><navLabel><text>Capítulo</text></navLabel>' +
  '<content src="ch.xhtml#start"/></navPoint></navPoint></navMap></ncx>';
describe('auditoria de navegação NCX', () => {
  it('aceita normalização de playOrder sem mudar hierarquia e labels', () => {
    expect(ncxFixture(baseNcx,baseNcx.replace('playOrder="3"','playOrder="1"')
      .replace('playOrder="9"','playOrder="2"'))()).toEqual([]);
  });
  it('não perde o título do capítulo se links permanecerem intactos', () => {
    expect(ncxFixture(baseNcx,baseNcx.replace('Parte um','Parte 1')))
      .toThrow(/títulos editoriais do NCX/u);
  });
  it('não achata hierarquia editorial preservando mesmos links', () => {
    // Deslocar p2 para irmão de p1, mantendo mesma ordem e destinos.
    const renamed=baseNcx.replace(
      '<navPoint id="p2"',
      '</navPoint><navPoint id="p2"').replace(
      '</navPoint></navPoint></navMap>',
      '</navPoint></navMap>');
    expect(ncxFixture(baseNcx,renamed)).toThrow(/hierarquia/u);
  });
});
