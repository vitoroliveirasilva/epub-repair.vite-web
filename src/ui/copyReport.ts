import type { RepairResult, ValidationReport } from '../epub';

export function buildTextReport(report: ValidationReport, repair?: RepairResult): string {
  const lines = [
    `Arquivo: ${report.fileName}`,
    `OPF: ${report.opfPath ?? 'não encontrado'}`,
    `Versão EPUB: ${report.epubVersion ?? 'não identificada'}`,
    `Score Kindle: ${report.stats.kindleScore}`,
    `Fatais: ${report.stats.fatalCount} | Erros: ${report.stats.errorCount} | Avisos: ${report.stats.warningCount} | Informações: ${report.stats.infoCount}`,
    '',
    'Problemas:',
    ...report.issues.map(
      (issue) =>
        `- [${issue.severity.toUpperCase()}] ${issue.code}${issue.file ? ` em ${issue.file}` : ''}: ${issue.title} - ${issue.detail}`,
    ),
  ];

  if (repair) {
    lines.push(
      '',
      `Arquivo gerado: ${repair.fileName}`,
      `Depois do reparo: ${repair.after.stats.fatalCount} fatais, ${repair.after.stats.errorCount} erros, ${repair.after.stats.warningCount} avisos, score ${repair.after.stats.kindleScore}`,
      '',
      'Alterações aplicadas:',
      ...repair.actions.map(
        (action) => `- ${action.title}${action.file ? ` em ${action.file}` : ''}: ${action.detail}`,
      ),
    );
  }

  return lines.join('\n');
}
