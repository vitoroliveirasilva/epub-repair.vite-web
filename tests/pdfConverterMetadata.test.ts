import { describe, expect, it } from 'vitest';
import { inferPublicationMetadata } from '../src/converter/pdfEngine';

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
});
