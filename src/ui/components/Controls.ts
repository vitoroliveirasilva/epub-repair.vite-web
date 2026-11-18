import {
  canOptimizeReport,
  canRepairReport,
  getOptionalOptimizationCount,
  hasOptionalOptimizations,
  hasManualReviewIssues,
} from '../../epub';
import type { AppState } from '../../app/state';
import { getWorkflowState } from '../../app/workflowState';
import { button, el, downloadBlob } from '../dom';

export function renderControls(
  state: AppState,
  actions: {
    analyze: () => void;
    repair: () => void;
    copy: () => void;
    downloadTextReport: () => void;
    downloadJsonReport: () => void;
    onKindleSafeChange?: ((enabled: boolean) => void) | undefined;
    cancel?: (() => void) | undefined;
  },
): HTMLElement {
  const hasFile = Boolean(state.payload);
  const hasReport = Boolean(state.report);
  const pageTitle = controlsTitle(state);
  const pageDescription = controlsDescription(state);
  const hasRepair = Boolean(state.repairResult?.changed && state.repairResult.blob);
  const hasFatalIssues = Boolean(state.report?.stats.fatalCount);
  const canRepair = canRepairReport(state.report, state.options);
  const canOptimize = canOptimizeReport(state.report) ||
    Boolean(!canRepair && state.options.stripImageMetadata &&
      state.report?.validZip && state.report.stats.fatalCount === 0 &&
      state.report.issues.some((issue) => issue.code === 'IMAGE_EMBEDDED_METADATA'));

  const primaryActionButtons = buildPrimaryActionButtons(state, actions, {
    hasFile,
    hasRepair,
    hasFatalIssues,
    canRepair,
    canOptimize,
  });

  const copyButton = button('Copiar', 'btn btn-ghost', actions.copy);
  copyButton.disabled = !hasReport || state.busy;

  const textReportButton = button('TXT', 'btn btn-ghost', actions.downloadTextReport);
  textReportButton.disabled = !hasReport || state.busy;

  const jsonReportButton = button('JSON', 'btn btn-ghost', actions.downloadJsonReport);
  jsonReportButton.disabled = !hasReport || state.busy;

  return el('section', {
    className: hasRepair ? 'panel controls-panel controls-panel-ready' : 'panel controls-panel',
    attrs: { 'aria-busy': String(state.busy), 'aria-label': 'Verificação e correção do EPUB' },
    children: [
      el('div', {
        className: 'controls-copy',
        children: [
          el('p', { className: 'eyebrow', text: 'Verificação e correção' }),
          pageTitle === 'Escolha um EPUB para começar'
            ? el('h2', { children: [
              'Escolha um ',
              el('span', { className: 'editorial-epub-word', text: 'EPUB' }),
              ' para começar',
            ] })
            : el('h2', { text: pageTitle }),
          pageDescription
            ? el('p', { className: 'muted', text: pageDescription })
            : undefined,
        ],
      }),
      el('div', {
        className: 'flow-steps',
        attrs: { 'aria-label': 'Etapas principais' },
        children: [
          renderFlowStep(
            '1',
            'Verificar',
            'Encontrar problemas de estrutura, capa, sumário e Kindle',
            {
              active: hasFile && !hasReport,
              done: hasReport,
            },
          ),
          renderFlowStep(
            '2',
            'Corrigir, otimizar ou trocar capa',
            'Gerar uma nova cópia somente quando houver mudança real',
            {
              active: hasReport && !hasRepair,
              done: hasRepair,
            },
          ),
          renderFlowStep(
            '3',
            'Baixar',
            'Salvar o EPUB alterado e se quiser, o relatório técnico',
            {
              active: hasRepair,
              done: hasRepair,
            },
          ),
        ],
      }),
      renderKindleSafeOption(state, actions.onKindleSafeChange),
      el('div', {
        className: hasRepair
          ? 'primary-action-row primary-action-row-download'
          : 'primary-action-row',
        children: primaryActionButtons,
      }),
      renderTechnicalReportTools(hasReport, copyButton, textReportButton, jsonReportButton),
      state.busy
        ? renderProcessingStatus(state, actions.cancel)
        : undefined,
    ],
  });
}

function renderKindleSafeOption(
  state: AppState, onChange?: (enabled: boolean) => void,
): HTMLElement {
  const input = el('input', { attrs: {
    type: 'checkbox', id: 'kindle-safe-main', 'aria-describedby': 'kindle-safe-main-detail',
  } });
  input.checked = state.options.kindleSafeMode;
  input.disabled = state.busy;
  input.addEventListener('change', () => {
    if (state.busy) return;
    if (onChange) onChange(input.checked);
    else state.options.kindleSafeMode = input.checked;
  });
  return el('label', { className: 'kindle-safe-main-option', attrs: {
    for: 'kindle-safe-main',
  }, children: [
    input,
    el('span', { className: 'kindle-safe-main-option-copy', children: [
      el('strong', { text: 'Preparar para Kindle durante o reparo' }),
      el('small', { attrs: { id: 'kindle-safe-main-detail' },
        text: 'Kindle Safe ativado por padrão. Prioriza compatibilidade quando houver correções seguras, sem substituir a revisão do arquivo.' }),
    ] }),
    el('span', { className: 'kindle-safe-main-toggle', attrs: { 'aria-hidden': 'true' },
      children: [
        el('span', { className: 'kindle-safe-switch-track', children: [
          el('span', { className: 'kindle-safe-switch-thumb' }),
        ] }),
      ],
    }),
  ] });
}

function buildPrimaryActionButtons(
  state: AppState,
  actions: { analyze: () => void; repair: () => void },
  flags: {
    hasFile: boolean;
    hasRepair: boolean;
    hasFatalIssues: boolean;
    canRepair: boolean;
    canOptimize: boolean;
  },
): HTMLButtonElement[] {
  if (flags.hasRepair) {
    const downloadButton = button(
      hasManualReviewIssues(state.repairResult?.after ?? state.report)
        ? 'Baixar cópia parcial (revisar)'
        : state.repairResult?.operation === 'cover-replacement'
        ? 'Baixar EPUB com nova capa'
        : state.repairResult?.operation === 'optimization'
          ? 'Baixar EPUB otimizado'
          : 'Baixar EPUB corrigido',
      'btn btn-primary btn-download-ready',
      () => {
        if (state.repairResult?.blob)
          downloadBlob(state.repairResult.blob, state.repairResult.fileName);
      },
    );
    downloadButton.disabled = state.busy;
    downloadButton.dataset.focusKey = 'epub-download';

    if (flags.canRepair && !flags.hasFatalIssues) {
      const retryButton = button(
        'Aplicar reparos restantes',
        'btn btn-secondary',
        actions.repair,
      );
      retryButton.disabled = state.busy;
      retryButton.dataset.focusKey = 'epub-repair-remaining';
      retryButton.title = 'Reparar problemas ainda identificados na cópia atual, preservando o download anterior.';
      return [downloadButton, retryButton];
    }
    if (!flags.canOptimize) return [downloadButton];

    const optimizeButton = button(
      'Aplicar otimização opcional',
      'btn btn-secondary',
      actions.repair,
    );
    optimizeButton.disabled = state.busy;
    optimizeButton.dataset.focusKey = 'epub-optimize';
    optimizeButton.title = repairButtonTitle(state, false, true);

    return [downloadButton, optimizeButton];
  }

  const analyzeButton = button(
    state.busy ? 'Enfileirar verificação' : 'Verificar EPUB',
    'btn btn-secondary', actions.analyze,
  );
  const mayEnqueueAnalysis = !state.busy ||
    ((state.activeTask === 'Verificar EPUB' ||
      state.activeTask === 'Carregar e analisar EPUB') &&
      !state.hasPendingMutation);
  analyzeButton.disabled = !flags.hasFile ||
    !mayEnqueueAnalysis || (state.pendingTasks ?? 0) >= 8;
  analyzeButton.dataset.focusKey = 'epub-analyze';

  const repairButton = button(
    state.busy && (flags.canRepair || flags.canOptimize)
      ? 'Enfileirar reparo'
      : flags.canRepair
      ? 'Gerar EPUB corrigido'
      : flags.canOptimize
        ? 'Aplicar otimização opcional'
        : 'Nenhum reparo necessário',
    'btn btn-primary',
    actions.repair,
  );
  repairButton.dataset.focusKey = 'epub-repair';
  repairButton.disabled =
    !flags.hasFile ||
    (state.busy && (
      (state.pendingTasks ?? 0) >= 8 ||
      state.hasPendingMutation ||
      (state.activeTask !== 'Verificar EPUB' &&
       state.activeTask !== 'Carregar e analisar EPUB')
    )) ||
    flags.hasFatalIssues ||
    (!flags.canRepair && !flags.canOptimize);
  repairButton.title = repairButtonTitle(state, flags.canRepair, flags.canOptimize);

  return [analyzeButton, repairButton];
}

function controlsTitle(state: AppState): string {
  const workflow = getWorkflowState(state);
  if (workflow === 'invalid') return 'EPUB inválido: revisão necessária';
  if (workflow === 'processing') return 'Analisando alterações com segurança';
  if (workflow === 'partial-output') return 'Cópia parcial gerada: revisão manual necessária';
  if (state.repairResult?.changed && state.repairResult.blob) {
    if (hasManualReviewIssues(state.repairResult.after)) return 'Cópia parcial gerada: revisão manual necessária';
    if (state.repairResult.operation === 'cover-replacement') return 'EPUB com nova capa pronto para baixar';
    if (state.repairResult.operation === 'optimization') return 'EPUB otimizado pronto para baixar';
    return 'EPUB corrigido pronto para ser baixado';
  }
  if (state.report && !canRepairReport(state.report) && hasManualReviewIssues(state.report)) {
    return 'Revisão manual necessária';
  }
  if (state.report && !canRepairReport(state.report) && hasOptionalOptimizations(state.report)) {
    return 'Seu EPUB está pronto para uso';
  }
  if (state.report && !canRepairReport(state.report)) return 'Seu EPUB já está pronto';
  if (state.report) return 'Agora você pode gerar uma cópia corrigida';
  if (state.payload) return 'Verifique seu EPUB antes de enviar ao Kindle';
  return 'Escolha um EPUB para começar';
}

function controlsDescription(state: AppState): string {
  if (state.repairResult?.changed && state.repairResult.blob &&
      hasManualReviewIssues(state.repairResult.after)) {
    return 'A cópia contém correções parciais, mas ainda há alertas que exigem revisão humana. ' +
      'Não considere o EPUB seguro ou pronto para distribuição.';
  }
  if (state.repairResult?.changed && state.repairResult.blob &&
      state.repairResult.operation === 'cover-replacement') {
    return 'Baixe a nova versão do arquivo com a capa aplicada. O relatório técnico fica separado abaixo';
  }
  if (state.repairResult?.changed && state.repairResult.blob &&
      state.repairResult.operation === 'optimization') {
    return 'Baixe a nova versão otimizada do arquivo. O relatório técnico mostra quais melhorias opcionais foram aplicadas';
  }
  if (state.repairResult?.changed && state.repairResult.blob) {
    return 'Baixe a nova versão do arquivo, o relatório técnico fica separado abaixo';
  }
  if (state.report?.stats.fatalCount) {
    return 'Encontramos um problema fatal, o reparo automático fica bloqueado para evitar gerar um arquivo incompleto ou pior que o original.';
  }
  if (state.report && !canRepairReport(state.report) && hasManualReviewIssues(state.report)) {
    return 'Há problemas sem correção automática. Confira o relatório antes de usar este EPUB.';
  }
  if (state.report && !canRepairReport(state.report) && hasOptionalOptimizations(state.report)) {
    const count = getOptionalOptimizationCount(state.report);
    return `Nenhuma correção obrigatória é necessária. Há ${formatCount(count, 'melhoria opcional', 'melhorias opcionais')} de compatibilidade. Use o botão de otimização para tentar aplicar esse ajuste, ou troque a capa abaixo se quiser alterar algo intencionalmente.`;
  }
  if (state.report && !canRepairReport(state.report)) {
    return 'Nenhuma correção técnica é necessária. Se quiser alterar algo intencionalmente, use a troca de capa abaixo.';
  }
  if (state.report) {
    return 'O diagnóstico terminou, quando houver correções seguras gere uma cópia corrigida do EPUB';
  }
  if (state.payload) {
    return 'A análise acontece localmente no navegador e prepara o arquivo para uma correção segura';
  }
  return '';
}

function repairButtonTitle(state: AppState, canRepair: boolean, canOptimize: boolean): string {
  if (canRepair) return 'Gerar uma cópia corrigida do EPUB';
  if (canOptimize) {
    return 'Aplicar otimizações opcionais, incluindo remoção de EXIF/XMP/Photoshop se selecionada, ou converter JPEG progressivo quando possível.';
  }
  if (hasOptionalOptimizations(state.report)) {
    return 'O EPUB tem somente notas opcionais, mas nenhuma delas pode ser aplicada automaticamente neste estado.';
  }
  return 'O EPUB validado não possui problemas corrigíveis.';
}

function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function renderFlowStep(
  number: string,
  title: string,
  description: string,
  state: { active: boolean; done: boolean },
): HTMLElement {
  const status = state.done ? 'done' : state.active ? 'active' : 'pending';
  const statusText = state.done
    ? number === '3' ? 'Pronto para baixar' : 'Concluída'
    : state.active ? 'Etapa atual' : 'A seguir';
  const kicker = number === '1'
    ? 'INSPEÇÃO DETALHADA'
    : number === '2' ? 'REPARO SEGURO' : 'SUA NOVA CÓPIA';

  return el('article', {
    className: `flow-step flow-step-${number} flow-step-${status}`,
    children: [
      el('span', { className: 'flow-step-number',
        text: number.padStart(2, '0'),
        attrs: { 'aria-hidden': 'true' } }),
      el('span', { className: 'flow-step-visual', attrs: { 'aria-hidden': 'true' },
        children: [
          el('span', { className: 'flow-step-orbit' }),
          el('span', { className: 'flow-step-book', children: [
            el('span', { className: 'flow-step-book-pages' }),
            el('span', { className: 'flow-step-book-cover', children: [
              el('span', { className: 'flow-step-book-ornament' }),
            ] }),
          ] }),
          el('span', { className: 'flow-step-visual-glyph',
            children: [workflowStepGlyph(number)] }),
        ],
      }),
      el('div', { className: 'flow-step-content', children: [
        el('span', { className: 'flow-step-kicker', text: kicker }),
        el('strong', { text: title }),
        el('small', { text: description }),
      ] }),
      el('div', { className: 'flow-step-bottom', children: [
        el('span', { className: 'flow-step-bottom-status', text: statusText }),
        el('span', { className: 'flow-step-bottom-detail',
          attrs: { 'aria-hidden': 'true' } }),
      ] }),
    ],
  });
}

function workflowStepGlyph(number: string): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', 'flow-step-glyph');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', 'true');

  const paths: Record<string, string[]> = {
    '1': [
      'M10.4 17.9a6.4 6.4 0 1 0 0-12.8 6.4 6.4 0 0 0 0 12.8Z',
      'm15.1 15.1 4.4 4.4',
      'M8.2 11.5h4.4',
    ],
    '2': [
      'm4.5 16.8-.8 3.5 3.5-.8L19 7.7a2.1 2.1 0 0 0-3-3L4.5 16.8Z',
      'm13.6 7.2 3.2 3.2',
      'm5 20 2.2-.5',
    ],
    '3': [
      'M12 3.5v10.5',
      'm7.7 10.3 4.3 4.3 4.3-4.3',
      'M4.2 16.7V19a2 2 0 0 0 2 2h11.6a2 2 0 0 0 2-2v-2.3',
    ],
  };
  for (const d of paths[number] ?? []) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function technicalReportGlyph(kind: 'report' | 'copy' | 'txt' | 'json'): SVGSVGElement {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('class', `technical-report-glyph technical-report-glyph-${kind}`);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const paths: Record<typeof kind, Array<[string, boolean?]>> = {
    report: [
      ['M14 2.75H6.5a2 2 0 0 0-2 2v14.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8.25L14 2.75Z'],
      ['M14 2.75v5.5h5.5'],
      ['M8.75 17v-2.2', true],
      ['M12 17v-5.3', true],
      ['M15.25 17v-3.7', true],
    ],
    copy: [
      ['M8.5 7.5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2Z'],
      ['M16.5 7.5v-3a2 2 0 0 0-2-2h-10a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2'],
    ],
    txt: [
      ['M14 2.75H6.5a2 2 0 0 0-2 2v14.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8.25L14 2.75Z'],
      ['M14 2.75v5.5h5.5'],
      ['M8.5 12.5h7'],
      ['M8.5 16.5h7'],
    ],
    json: [
      ['M9 3.5H7.5A2.5 2.5 0 0 0 5 6v3a2.5 2.5 0 0 1-2.5 2.5A2.5 2.5 0 0 1 5 14v3a2.5 2.5 0 0 0 2.5 2.5H9'],
      ['M15 3.5h1.5A2.5 2.5 0 0 1 19 6v3a2.5 2.5 0 0 0 2.5 2.5A2.5 2.5 0 0 0 19 14v3a2.5 2.5 0 0 1-2.5 2.5H15'],
      ['M11.5 9.5l-1 5', true],
      ['M14 9.5l-1 5', true],
    ],
  };

  for (const [d, accent] of paths[kind]) {
    const path = document.createElementNS(namespace, 'path');
    path.setAttribute('d', d);
    if (accent) path.setAttribute('class', 'technical-report-icon-accent');
    if (kind === 'report' && d === paths.report[0]?.[0]) {
      path.setAttribute('class', 'technical-report-paper-front');
    }
    svg.append(path);
  }

  return svg;
}

function renderTechnicalReportTools(
  hasReport: boolean,
  copyButton: HTMLButtonElement,
  textReportButton: HTMLButtonElement,
  jsonReportButton: HTMLButtonElement,
): HTMLElement {
  const details = el('details', { className: 'technical-report-tools' });
  details.open = false;
  copyButton.classList.add('technical-report-action-copy');
  textReportButton.classList.add('technical-report-action-txt');
  jsonReportButton.classList.add('technical-report-action-json');
  for (const [actionButton, kind, label] of [
    [copyButton, 'copy', 'Copiar'],
    [textReportButton, 'txt', 'TXT'],
    [jsonReportButton, 'json', 'JSON'],
  ] as const) {
    actionButton.replaceChildren(
      el('span', { className: 'technical-report-action-icon',
        attrs: { 'aria-hidden': 'true' }, children: [technicalReportGlyph(kind)] }),
      el('span', { className: 'technical-report-action-label', text: label }),
    );
  }

  details.append(
    el('summary', {
      children: [
        el('span', { className: 'technical-report-mark',
          attrs: { 'aria-hidden': 'true' }, children: [
            el('span', { className: 'technical-report-sheet' }),
            technicalReportGlyph('report'),
          ] }),
        el('span', { className: 'technical-report-heading', children: [
          el('strong', { text: 'Relatório técnico' }),
          el('small', {
            text: hasReport
              ? 'Copiar ou baixar detalhes da análise'
              : 'Disponível após verificar o EPUB',
          }),
        ] }),
        el('span', { className: 'technical-report-disclosure',
          attrs: { 'aria-hidden': 'true' }, children: [
            el('span', { className: 'technical-report-chevron' }),
          ] }),
      ],
    }),
    el('div', {
      className: 'technical-report-body',
      children: [
        el('p', {
          className: 'muted',
          text: 'Use esta área para salvar evidências, comparar antes/depois ou investigar códigos técnicos do diagnóstico',
        }),
        el('div', {
          className: 'technical-report-actions',
          children: [copyButton, textReportButton, jsonReportButton],
        }),
      ],
    }),
  );

  return details;
}


function renderProcessingStatus(state: AppState, cancel?: () => void): HTMLElement {
  const progress = state.processingProgress;
  const haveCount = progress?.completed !== undefined && Boolean(progress.total);
  const current = progress?.completed ?? 0;
  const total = progress?.total ?? 0;
  const cancelButton = cancel ? button(
    (state.pendingTasks ?? 0) > 0 ? 'Cancelar operação e fila' : 'Cancelar operação',
    'btn btn-ghost', cancel,
  ) : undefined;
  if (cancelButton) {
    cancelButton.dataset.focusKey = 'epub-cancel-processing';
    cancelButton.disabled = state.processingController?.signal.aborted ?? false;
  }
  return el('div', {
    className: 'working processing-status',
    attrs: { role: 'status', 'aria-live': 'polite' },
    children: [
      el('span', { attrs: { 'aria-hidden': 'true' } }),
      el('div', {
        className: 'processing-status-content',
        children: [
          el('strong', { text: progress?.phase ?? 'Processando estrutura do EPUB...' }),
          haveCount ? el('progress', {
            attrs: { max: String(total), value: String(current),
              'aria-label': progress?.unit === 'percent'
                ? 'Porcentagem do ZIP recompactado'
                : 'Arquivos EPUB descompactados' },
          }) : undefined,
          haveCount ? el('small', { text: progress?.unit === 'percent'
            ? Math.min(100, Math.max(0, current)) + '% recompactado'
            : current + ' de ' + total + ' entradas do ZIP descompactadas' }) : undefined,
        ],
      }),
      (state.pendingTasks ?? 0) > 0
        ? el('small', {
            className: 'muted',
            text: state.pendingTasks + ' ação(ões) agendada(s) para este EPUB',
            attrs: { 'aria-live': 'polite' },
          }) : undefined,
      cancelButton,
    ],
  });
}
