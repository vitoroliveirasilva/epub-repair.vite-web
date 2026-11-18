import './styles/main.css';
import './styles/reportUx.css';
import './styles/coverActions.css';
import './styles/mobile.css';
import './styles/layout-polish.css';
import './styles/converter.css';
import './styles/reportLayoutFixes.css';
import './styles/optionalTools.css';
import './styles/editorialIdentity.css';
import './styles/navbarRefinement.css';
import './styles/desktopNavbar.css';
import './styles/mobileNavigation.css';
import './styles/homeShowcase.css';
import './styles/homeDesktopLayout.css';
import './styles/homeHeroMotion.css';
import './styles/homeWorkspace.css';
import './styles/portfolioInspired.css';
import './styles/uploadStudio.css';
import './styles/coverStudio.css';
import './styles/batchWorkspace.css';
import './styles/workspaceModePolish.css';
import './styles/pageAtmosphere.css';
import './styles/scrollReveals.css';
import './styles/workspaceCardsPolish.css';

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
import './styles/footerEditorial.css';
import './styles/cardMotionRefinement.css';
import './styles/sectionHeaderPolish.css';
import './styles/statusSuccessPolish.css';
import './styles/optionalWorkbench.css';
import './styles/workspaceFinalPolish.css';
import './styles/workspaceDetailPolish.css';
import './styles/epubStageRail.css';
