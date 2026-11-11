import { readFile, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const ocrAssets = new Map([
  ['worker.min.js', 'node_modules/tesseract.js/dist/worker.min.js'],
  ['tesseract-core-lstm.wasm.js', 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js'],
  ['tesseract-core-lstm.wasm', 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm'],
  ['por.traineddata.gz', 'node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz'],
  ['eng.traineddata.gz', 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'],
]);

function buildOcrAssets(): Plugin {
  return {
    name: 'build-local-ocr-assets',
    apply: 'build',
    buildStart() {
      for (const [fileName, source] of ocrAssets) {
        this.emitFile({
          type: 'asset',
          fileName: `ocr/${fileName}`,
          source: readFileSync(resolve(source)),
        });
      }
    },
  };
}

function serveOcrAssets(): Plugin {
  return {
    name: 'serve-local-ocr-assets',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/ocr', (request, response, next) => {
        const fileName = basename((request.url ?? '').split('?')[0] ?? '');
        const source = ocrAssets.get(fileName);
        if (!source) {
          next();
          return;
        }
        readFile(resolve(source), (error, data) => {
          if (error) {
            next(error);
            return;
          }
          response.statusCode = 200;
          response.setHeader('Content-Type', fileName.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
          response.end(data);
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [buildOcrAssets(), serveOcrAssets()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
