import type { AppState } from '../../app/state';
import { button, el, downloadBlob } from '../dom';

export function renderControls(
  state: AppState,
  actions: {
    analyze: () => void;
    repair: () => void;
    copy: () => void;
    downloadTextReport: () => void;
    downloadJsonReport: () => void;
  },
): HTMLElement {
  const hasFile = Boolean(state.payload);
  const hasReport = Boolean(state.report);
  const hasRepair = Boolean(state.repairResult);
  const hasFatalIssues = Boolean(state.report?.stats.fatalCount);

  const primaryActionButtons = buildPrimaryActionButtons(state, actions, {
    hasFile,
    hasRepair,
    hasFatalIssues,
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
          renderFlowStep('2', 'Corrigir', 'Gerar uma nova cópia sem alterar o EPUB original', {
            active: hasReport && !hasRepair,
            done: hasRepair,
          }),
          renderFlowStep(
            '3',
            'Baixar',
            'Salvar o EPUB corrigido e se quiser, o relatório técnico',
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
        ? el('div', {
            className: 'working',
            attrs: { role: 'status' },
            children: [
              el('span', { attrs: { 'aria-hidden': 'true' } }),
              'Processando estrutura do EPUB...',
            ],
          })
        : undefined,
    ],
  });
}

function buildPrimaryActionButtons(
  state: AppState,
  actions: { analyze: () => void; repair: () => void },
  flags: { hasFile: boolean; hasRepair: boolean; hasFatalIssues: boolean },
): HTMLButtonElement[] {
  if (flags.hasRepair) {
    const downloadButton = button(
      'Baixar EPUB corrigido',
      'btn btn-primary btn-download-ready',
      () => {
        if (state.repairResult) downloadBlob(state.repairResult.blob, state.repairResult.fileName);
      },
    );
    downloadButton.disabled = state.busy;
    return [downloadButton];
  }

  const analyzeButton = button('Verificar EPUB', 'btn btn-secondary', actions.analyze);
  analyzeButton.disabled = !flags.hasFile || state.busy;

  const repairButton = button('Gerar EPUB corrigido', 'btn btn-primary', actions.repair);
  repairButton.disabled = !flags.hasFile || state.busy || flags.hasFatalIssues;

  return [analyzeButton, repairButton];
}

function controlsTitle(state: AppState): string {
  if (state.repairResult) return 'EPUB corrigido pronto para ser baixado';
  if (state.report) return 'Agora você pode gerar uma cópia corrigida';
  if (state.payload) return 'Verifique seu EPUB antes de enviar ao Kindle';
  return 'Escolha um EPUB para começar';
}

function controlsDescription(state: AppState): string {
  if (state.repairResult) {
    return 'Baixe a nova versão do arquivo, o relatório técnico fica separado abaixo caso você queira guardar o histórico';
  }
  if (state.report?.stats.fatalCount) {
    return 'Encontramos um problema fatal, o reparo automático fica bloqueado para evitar gerar um arquivo incompleto ou pior que o original. Você pode analisar novamente, reparar ou escolher outro arquivo quando quiser';
  }
  if (state.report) {
    return 'O diagnóstico terminou, quando houver correções seguras gere uma cópia corrigida do EPUB';
  }
  if (state.payload) {
    return 'A análise acontece localmente no navegador e prepara o arquivo para uma correção segura';
  }
  return 'Envie o arquivo, confira o diagnóstico e baixe uma cópia corrigida (O arquivo original não é alterado)';
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
