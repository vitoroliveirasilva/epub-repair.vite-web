import './styles/main.css';
import './styles/reportUx.css';
import { createApp } from './app/createApp';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('Elemento #app não encontrado.');
}

createApp(root);
