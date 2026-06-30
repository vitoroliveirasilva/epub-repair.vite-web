import type { RepairAction } from '../model/repairTypes';
import { escapeXml } from '../utils/xmlUtils';

export function buildContainerXml(opfPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n  <rootfiles>\n    <rootfile full-path="${escapeXml(opfPath)}" media-type="application/oebps-package+xml"/>\n  </rootfiles>\n</container>\n`;
}

export function ensureContainerFile(files: Map<string, Uint8Array>, opfPath: string): RepairAction {
  files.set('META-INF/container.xml', new TextEncoder().encode(buildContainerXml(opfPath)));
  return {
    type: 'normalized',
    title: 'container.xml normalizado',
    detail: `O container agora aponta de forma explícita para ${opfPath}.`,
    file: 'META-INF/container.xml',
  };
}
