// ============================================
// Financy PRO — Entry Point (Vite)
// ============================================
import { init } from './app.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
