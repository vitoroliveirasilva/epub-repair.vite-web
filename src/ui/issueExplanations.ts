import type { Issue } from '../epub';

interface IssueExplanation {
  title: string;
  message: string;
}

const ISSUE_EXPLANATIONS: Partial<Record<Issue['code'], IssueExplanation>> = {
  OPF_COVER_META_MISSING: {
    title: 'A capa existe, mas não está marcada como capa oficial.',
    message:
      'O Kindle pode mostrar a imagem dentro do livro e ainda assim não usá-la na biblioteca. O reparo declara essa capa no OPF.',
  },
  OPF_LANGUAGE_INVALID: {
    title: 'O idioma do livro está indefinido ou inválido.',
    message:
      'Conversores Kindle usam o idioma do OPF para interpretar o conteúdo. O reparo normaliza para uma tag segura quando possível.',
  },
  OPF_DATE_INVALID_FORMAT: {
    title: 'A data do pacote está em formato frágil.',
    message:
      'Datas antigas geradas por conversores podem ter formato que alguns leitores rejeitam. O reparo tenta simplificar para YYYY-MM-DD.',
  },
  OPF_PACKAGE_VERSION_OLD: {
    title: 'O pacote EPUB usa uma versão antiga.',
    message:
      'EPUB 2.0 costuma ser uma base mais segura para ferramentas atuais. O reparo atualiza a declaração quando isso é compatível.',
  },
  NCX_PLAYORDER_DUPLICATE: {
    title: 'O sumário legado tem numeração repetida.',
    message:
      'Isso pode bagunçar a navegação em leitores antigos. O reparo renumera os itens do toc.ncx.',
  },
  NCX_PLAYORDER_OUT_OF_ORDER: {
    title: 'O sumário legado está fora de ordem.',
    message:
      'A ordem de navegação pode ficar estranha no Kindle. O reparo limpa a sequência de playOrder.',
  },
  NCX_SPINE_MISSING_ITEMS: {
    title: 'Alguns capítulos não aparecem no sumário legado.',
    message:
      'O livro pode abrir normalmente, mas a navegação fica incompleta. O reparo adiciona os itens ausentes quando seguro.',
  },
  XHTML_NBSP_ENTITY: {
    title: 'Há espaços especiais escritos de forma frágil no XHTML.',
    message:
      'A entidade &nbsp; pode quebrar parsing XML em alguns fluxos. O reparo troca por uma entidade numérica segura.',
  },
  XHTML_LANG_MISSING: {
    title: 'O conteúdo não declara idioma na tag html.',
    message:
      'Adicionar lang/xml:lang melhora compatibilidade, acessibilidade e interpretação por leitores.',
  },
  XHTML_CONTENT_TYPE_SUSPICIOUS: {
    title: 'Um metadado Content-Type parece suspeito.',
    message:
      'Alguns EPUBs antigos trazem Content-Type inválido. O reparo normaliza para XHTML UTF-8.',
  },
  IMAGE_PROGRESSIVE_JPEG: {
    title: 'Há JPEG progressivo no pacote.',
    message: 'Normalmente funciona, mas alguns conversores antigos preferem JPEG baseline.',
  },
  CONTENT_SCRIPTED: {
    title: 'O livro contém scripts ou comportamento interativo.',
    message:
      'Scripts não são desejáveis em EPUB para leitura. O modo Kindle Safe remove esses trechos quando possível.',
  },
  CONTENT_REMOTE_RESOURCE: {
    title: 'O conteúdo depende de recurso remoto.',
    message:
      'Recursos externos podem falhar offline e atrapalhar conversores. O reparo remove ou transforma em texto seguro.',
  },
};

export function explainIssue(issue: Issue): IssueExplanation {
  return (
    ISSUE_EXPLANATIONS[issue.code] ?? {
      title: issue.title,
      message: issue.detail,
    }
  );
}
