import { describe, expect, it } from 'vitest';
import { inferDocumentIdentity, inferPublicationMetadata } from '../src/converter/pdfEngine';

describe('metadados editoriais extraídos do PDF', () => {
  it('identifica ISBN, tradutor, editora e ano em ficha catalográfica brasileira', () => {
    const metadata = inferPublicationMetadata(`
McFadden, Freida
A inquilina [recurso eletrônico] / Freida McFadden ; tradução Irinêo Baptista Netto. - 1. ed.
ISBN 978-85-01-92500-8 (recurso eletrônico)
Copyright © 2025 by Freida McFadden
Direitos exclusivos de publicação em língua portuguesa somente para o Brasil adquiridos pela
EDITORA RECORD LTDA.
Rua Argentina, 171 – Rio de Janeiro
`);
    expect(metadata).toEqual({
      publisher: 'Editora Record',
      publicationDate: '2025',
      isbn: '9788501925008',
      translator: 'Irinêo Baptista Netto',
      description: '',
    });
  });

  it('prioriza os dados da edição brasileira e recupera título e organizadores', () => {
    const source = `
Copyright versão original: © 2018 The Guilford Press.
Copyright da tradução: 2020 Editora Hogrefe CETEPP, São Paulo
Tradução: Dr. Thomas Haunold
Programa DBT® para o comer emocional e compulsivo /
organizadores Debra L. Safer, Sarah Adler, Philip C. Masson ; tradução
Thomas Haunold. - 1. ed. - São Paulo : Hogrefe, 2020.
ISBN 978-65-990257-3-0
Todos os direitos desta edição reservados à
Editora Hogrefe CETEPP
`;
    expect(inferDocumentIdentity(source, 'Programa Dbt')).toEqual({
      title: 'Programa DBT® para o comer emocional e compulsivo',
      author: 'Debra L. Safer, Sarah Adler, Philip C. Masson',
    });
    expect(inferPublicationMetadata(source)).toMatchObject({
      publisher: 'Editora Hogrefe CETEPP',
      publicationDate: '2020',
      isbn: '9786599025730',
      translator: 'Dr. Thomas Haunold',
    });
  });
});
