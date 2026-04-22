/**
 * Dedicated entry point for the VS Code extension webview.
 *
 * Mounts ONLY AgentBuilderPage — no routing, no chat panel, no other pages.
 * Vite tree-shakes everything else in convengine-ui so the bundle is lean.
 *
 * CSS load order:
 *  1. src/index.css  — Tailwind + global CSS vars (light/dark tokens)
 *  2. builder-studio.css — bs-* prefixed component styles
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import '../src/index.css';
import AgentBuilderPage from '../src/builder-studio/AgentBuilderPage';

// Apply saved theme before first paint to avoid flash
const savedTheme = localStorage.getItem('convengine_ui_theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AgentBuilderPage />
  </React.StrictMode>
);
