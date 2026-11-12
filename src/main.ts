import './styles/main.css';
import './styles/reportUx.css';
import './styles/coverActions.css';
import './styles/mobile.css';
import './styles/layout-polish.css';
import './styles/converter.css';
import './styles/reportLayoutFixes.css';
import './styles/mobileNavigation.css';
import './styles/optionalTools.css';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('Elemento #app não encontrado.');
}

const route = window.location.pathname.replace(/\/+$/u, '') || '/';

if (route === '/converter') {
  document.title = 'Converter PDF para EPUB — EPUB Repair';
  document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute(
    'content',
    'Converta PDF em EPUB com reconstrução editorial, OCR local, revisão e validação no navegador.',
  );
  const { createConverterApp } = await import('./converter/createConverterApp');
  createConverterApp(root);
} else {
  const { createApp } = await import('./app/createApp');
  createApp(root);
}
