# Segurança, privacidade e limites do EPUB Repair

## Objetivo

A aplicação valida e repara estruturas de EPUB **localmente no navegador**. O usuário escolhe
um arquivo, analisa as falhas e pode gerar uma cópia reparada sem enviar o EPUB para um servidor
da aplicação. Este documento distingue integridade ZIP, conformidade EPUB, compatibilidade
Kindle, revisão editorial e inspeção antimalware. São objetivos diferentes.

## Modelo de ameaças

| Entrada ou comportamento | Proteção existente | Risco residual |
| --- | --- | --- |
| ZIP bomb / expansão excessiva | Limites de bytes, entradas, proporção e streaming com CRC | Picos de memória no navegador ainda exigem teste real |
| Path traversal e offsets falsos | Validação de caminhos, cabeçalhos locais e diretório central | ZIPs codificados de forma incomum exigem corpus adversarial |
| XML / DTD / entidades | Parser sem entidades personalizadas | Casos com DOCTYPE ou codificação legada devem ser testados |
| XHTML, SVG, CSS e URL executável | Sanitização DOM e filtros, quando habilitados | Sintaxes adversariais e modos conservadores podem manter sinais ativos |
| Executáveis/binários no ZIP | Alerta por extensão e assinaturas MZ/ELF | Não é antivírus nem determina se arquivo está infectado |
| Recursos HTTP/HTTPS | Preservados por padrão | Leitor com internet pode fazer requisições externas, prejudicando privacidade/offline |
| Alterações editoriais e layout | Checagem de ordem, texto e preservação de imagens/fontes | Diferença visual entre leitores ainda pode ocorrer |
| Dependências do site e CI | `npm audit`, CSP do deploy, EPUBCheck fixado | Auditoria de supply chain e browsers deve ser contínua |

## Regras do aplicativo

1. **Não tratar fontes HTTP/HTTPS ou links externos legítimos como código perigoso por si só.**
   O aplicativo os preserva por padrão. Essa decisão não significa que tais recursos estejam
   disponíveis offline, sejam privados ou representem conteúdo confiável.
2. **Não inventar idioma, ordem editorial nem capítulos.** Se faltarem evidências, exigir
   revisão manual.
3. **Não alterar imagens ausentes para texto sem opt-in** do usuário.
4. **Não aceitar sumário NCX seletivo como erro** só porque não lista todos os itens do spine.
5. Ao término, **comparar diagnósticos antes/depois**. Um EPUB com novos erros ou avisos
   não será liberado pelo reparador automático.
6. O modo conservador pode preservar conteúdo ativo: **mostrar pendência manual** quando
   forem detectados scripts, CSS perigoso ou binários suspeitos.
7. Não abrir, executar nem enviar binários extraídos do EPUB.
8. Não adicionar ao repositório público obras comerciais completas usadas em testes.

## O que o score de segurança não significa

O score é somente uma métrica heurística sobre **classes de problemas detectadas**.
`100/100` não certifica arquivo livre de vírus, malware, rastreamento, DRM ou defeitos
editoriais. EPUBCheck valida conformidade técnica e **não é antivírus**.

## Inspeção antivírus opcional

Para arquivos de procedência desconhecida, use um antivírus local confiável antes de
abrir o EPUB em programas que executem conteúdo ativo. Não faça upload de obras privadas
a serviços públicos de escaneamento sem considerar privacidade e direitos de distribuição.
Não há integração antivírus embutida no site e nenhuma alegação de limpeza antimalware.

## Política de revisão de problemas

- **Fatal:** interromper reparo/exportação, exigindo correção manual se não houver solução segura.
- **Erro/aviso reparável:** informar a transformação e revalidar antes de liberar.
- **Erro/aviso sem correção automática:** registrar pendência manual sem declarar o EPUB pronto.
- **Otimização opcional:** jamais misturar silenciosamente com reparo obrigatório.
- **Alteração potencialmente destrutiva:** exigir opt-in ou revisão humana.

## Procedimento em caso de regressão

1. Preservar o arquivo original sem modificar.
2. Anotar versão/commit, opção escolhida, navegador e código de problema.
3. Criar uma fixture mínima sem conteúdo protegido.
4. Reproduzir a diferença antes/depois no Vitest e, se aplicável, EPUBCheck.
5. Corrigir na `dev`; executar CI e verificar integridade antes de atualizar `prod`.

## Complementos da execução 3

- Conteúdo `data:image/png/jpeg/gif/webp` passivo em contexto de imagem é preservado.
  Esquemas `data:image/svg+xml` e `data:text/html` permanecem bloqueados.
- `encryption.xml` com somente o algoritmo
  `http://www.idpf.org/2008/embedding` e fontes existentes indica
  ofuscação IDPF, não prova de DRM. Algoritmos desconhecidos seguem alertados.
- Relatórios TXT e JSON incluem versão do aplicativo, SHA-256 do EPUB original
  (preservado em memória mesmo após troca de capa), opções atuais e, quando houve
  reparo, um snapshot das opções efetivamente aplicadas. Não são assinaturas
  digitais nem certificam conformidade ou segurança.
- O reparo recusa entregar cópia quando detecta perda de palavras originais.
  Essa proteção não substitui revisão de formatação e semântica.

## Complementos da execução 4

- ZIPs com entradas duplicadas ou sobreposição de offsets/payloads são recusados,
  porque não é possível escolher de modo seguro qual versão de um recurso manter.
- DTD pública tradicional NCX e XHTML1.1 é permitida com padrão estrito; subsets
  internos, DTD externa arbitrária, entidades personalizadas e XInclude são barrados.
- XHTML e SVG têm inspeção adicional após decodificação DOM para detectar URLs
  executáveis com entidades, mantendo recursos HTTP/HTTPS legítimos.
- Arquivos JavaScript órfãos são preservados, assinalados para revisão manual e não
  registrados automaticamente no manifest.
- Alterações sensíveis (remover recursos externos, substituir imagens por texto e
  neutralizar conteúdo ativo) exigem confirmação antes do reparo.
- O inventário informativo de licenças complementa `npm audit`, mas não substitui
  revisão de obrigações legais e dependências transitivas ausentes.
