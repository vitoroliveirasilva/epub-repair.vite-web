#!/usr/bin/env node
// Varredura de AV opcional: nunca envia o EPUB à rede nem altera seu conteúdo.
// Requer clamscan instalado e assinaturas atualizadas pelo administrador.
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const args = process.argv.slice(2);
if (args.length !== 1 || extname(args[0] ?? '').toLowerCase() !== '.epub') {
  console.error('Uso: npm run scan:av -- caminho/para/livro.epub');
  process.exitCode = 64;
} else {
  const filePath = resolve(args[0]);
  let readable = false;
  try {
    readable = statSync(filePath).isFile();
  } catch {
    // Não executar scanner em diretórios ou caminhos inexistentes.
  }
  if (!readable) {
    console.error('Arquivo EPUB não encontrado ou não é um arquivo regular.');
    process.exitCode = 64;
  } else {
    const scanner = process.env.CLAMSCAN_BIN || 'clamscan';
    // Nenhum shell: caracteres especiais nos nomes não viram comandos.
    // O scanner recebe um caminho absoluto que não inicia com hifen.
    // Suporte a scanners com wrapper Node (.js/.cjs/.mjs) configurados
    // explicitamente, inclusive para testes portáveis em Windows.
    // Nunca usar shell para interpretar nomes de arquivos ou comandos.
    const isNodeWrapper = /\.(?:c|m)?js$/iu.test(scanner);
    const command = isNodeWrapper ? process.execPath : scanner;
    const scannerArgs = isNodeWrapper
      ? [scanner, '--no-summary', filePath]
      : ['--no-summary', filePath];
    const result = spawnSync(command, scannerArgs, {
      shell: false, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    if (result.error || result.signal) {
      console.error('ClamAV indisponível ou execução interrompida. ' +
        'Instale o clamscan e atualize as assinaturas para uma verificação real.');
      process.exitCode = 2;
    } else if (result.status === 0) {
      console.log('ClamAV: nenhuma assinatura conhecida detectada. ' +
        'Isto NÃO garante ausência de malware.');
      process.exitCode = 0;
    } else if (result.status === 1) {
      console.error('ClamAV: assinatura suspeita detectada. Não abra este EPUB.');
      process.exitCode = 1;
    } else {
      console.error('ClamAV retornou erro operacional: análise inconclusiva.');
      process.exitCode = 2;
    }
  }
}
