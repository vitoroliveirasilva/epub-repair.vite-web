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
    cancel?: (() => void) | undefined;
  },
): HTMLElement {
  const hasFile = Boolean(state.payload);
  const hasReport = Boolean(state.report);
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
          el('h2', { text: controlsTitle(state) }),
          el('p', { className: 'muted', text: controlsDescription(state) }),
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
  return 'Envie o arquivo, confira o diagnóstico e baixe uma cópia corrigida. O arquivo original não é alterado';
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
  return el('article', {
    className: `flow-step flow-step-${status}`,
    children: [
      el('span', { className: 'flow-step-number', text: state.done ? '✓' : number }),
      el('div', {
        children: [el('strong', { text: title }), el('small', { text: description })],
      }),
    ],
  });
}

function renderTechnicalReportTools(
  hasReport: boolean,
  copyButton: HTMLButtonElement,
  textReportButton: HTMLButtonElement,
  jsonReportButton: HTMLButtonElement,
): HTMLElement {
  const details = el('details', { className: 'technical-report-tools' });
  details.open = false;

  details.append(
    el('summary', {
      children: [
        el('span', { text: 'Relatório técnico' }),
        el('small', {
          text: hasReport
            ? 'Copiar ou baixar detalhes da análise'
            : 'Disponível após verificar o EPUB',
        }),
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
