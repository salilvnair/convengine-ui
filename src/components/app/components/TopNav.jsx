import {
  AnalyzeCacheIcon,
  AuditTimelineIcon,
  CeBuilderIcon,
  ChatIcon,
  InspectDbIcon,
  MoonIcon,
  PdfExtractIcon,
  RefreshCacheIcon,
  SemanticDebugIcon,
  SemanticLayerBuilderIcon,
  SunIcon,
} from "./AppIcons.jsx";
import { topNavButtonsConfig } from "../config/topNavButtons.config.js";

const iconButtonItems = [
  { key: "chat", Icon: ChatIcon, handler: "onOpenChat" },
  { key: "refresh", Icon: RefreshCacheIcon, handler: "onCacheRefresh", loadingProp: "cacheRefreshLoading" },
  { key: "cacheAnalyze", Icon: AnalyzeCacheIcon, handler: "onToggleAnalyzePage" },
  { key: "inspectDb", Icon: InspectDbIcon, handler: "onOpenInspectDialog" },
  { key: "semanticBuilder", Icon: SemanticLayerBuilderIcon, handler: "onOpenSemanticLayerBuilder" },
  { key: "semanticDebug", Icon: SemanticDebugIcon, handler: "onOpenSemanticDebug" },
  { key: "pdfExtract", Icon: PdfExtractIcon, handler: "onOpenPdfExtract" },
  { key: "ceBuilder", Icon: CeBuilderIcon, handler: "onOpenCeBuilder" },
];

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

function buttonTitle(control, isActive, isLoading) {
  if (isLoading && control.loadingTitle) return control.loadingTitle;
  if (isActive && control.activeTitle) return control.activeTitle;
  return control.title;
}

function buttonAriaLabel(control, isActive, isLoading) {
  if (isLoading && control.loadingAriaLabel) return control.loadingAriaLabel;
  if (isActive && control.activeAriaLabel) return control.activeAriaLabel;
  return control.ariaLabel;
}

function pageLabel(activePage) {
  if (activePage === "cache") return "cache diagnostics";
  if (activePage === "semantic_builder") return "semantic builder studio";
  if (activePage === "semantic_debug") return "semantic query debug";
  if (activePage === "pdf_extract") return "pdf extract studio";
  if (activePage === "ce_builder") return "ce builder";
  return "db schema inspect";
}

function findActivePageControl(controls, activePage) {
  return Object.values(controls).find((control) => control.activePage === activePage) || null;
}

export function TopNav({
  activePage,
  cacheRefreshLoading,
  cacheRefreshMessage,
  onOpenChat,
  onCacheRefresh,
  onToggleAnalyzePage,
  onOpenInspectDialog,
  onOpenSemanticLayerBuilder,
  onOpenSemanticDebug,
  onOpenPdfExtract,
  onOpenCeBuilder,
  engineIntent,
  engineState,
  turnLatencyText,
  themeMode,
  onToggleTheme,
  auditOpen,
  onOpenAudit,
  assetUrl,
}) {
  const controls = topNavButtonsConfig;
  const handlers = {
    onOpenChat,
    onCacheRefresh,
    onToggleAnalyzePage,
    onOpenInspectDialog,
    onOpenSemanticLayerBuilder,
    onOpenSemanticDebug,
    onOpenPdfExtract,
    onOpenCeBuilder,
  };
  const state = {
    cacheRefreshLoading,
  };
  const homeControl = controls.home;
  const themeControl = controls.themeToggle;
  const auditControl = controls.auditToggle;
  const activePageControl = findActivePageControl(controls, activePage);
  const auditVisible = Boolean(activePageControl?.audit_visible);
  const goHome = () => {
    window.location.assign("/");
  };

  return (
    <header className="top-nav">
      <div className="brand-wrap">
        {!homeControl.inactive && (
          <button
            type="button"
            className={homeControl.className}
            onClick={() => window.location.reload()}
            disabled={homeControl.disabled}
            title={homeControl.title}
            aria-label={homeControl.ariaLabel}
          >
            <img
              src={assetUrl(homeControl.asset)}
              alt={homeControl.ariaLabel}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = assetUrl(homeControl.fallbackAsset);
              }}
            />
          </button>
        )}
        <div className="brand-copy">
          <div className="brand-title-row">
            <button type="button" className="brand-title-home" onClick={goHome} title="Go to home" aria-label="Go to home">
              ConvEngine
            </button>
            <div className="hero-cache-actions">
              {iconButtonItems.map((item) => {
                const { key, handler, loadingProp } = item;
                const IconComponent = item.Icon;
                const control = controls[key];
                if (!control || control.inactive) return null;

                const isActive = control.activePage === activePage;
                const isLoading = Boolean(loadingProp && state[loadingProp]);
                return (
                  <button
                    key={key}
                    type="button"
                    className={classNames(control.className, isActive && "is-active")}
                    onClick={handlers[handler]}
                    disabled={control.disabled || isLoading}
                    title={buttonTitle(control, isActive, isLoading)}
                    aria-label={buttonAriaLabel(control, isActive, isLoading)}
                  >
                    <IconComponent />
                  </button>
                );
              })}
            </div>
          </div>
          <p>Structured AI. Predictable Intelligence.</p>
        </div>
      </div>

      <div className="top-center-status" aria-live="polite">
        {activePage === "chat" ? (
          <>
            {engineIntent ? <span className="hero-chip hero-chip-intent">intent: {engineIntent}</span> : null}
            {engineState ? <span className="hero-chip hero-chip-state">state: {engineState}</span> : null}
            {turnLatencyText ? <span className="hero-chip hero-chip-timing">time: {turnLatencyText}</span> : null}
          </>
        ) : (
          <span className="hero-chip hero-chip-state">{pageLabel(activePage)}</span>
        )}
        {cacheRefreshMessage ? <span className="hero-chip hero-chip-intent">{cacheRefreshMessage}</span> : null}
      </div>

      <div className="top-actions">
        {!themeControl.inactive && (
          <button
            type="button"
            className={themeMode === "light" ? themeControl.lightClassName : themeControl.darkClassName}
            onClick={onToggleTheme}
            disabled={themeControl.disabled}
            aria-label={themeMode === "light" ? themeControl.lightAriaLabel : themeControl.darkAriaLabel}
            title={themeMode === "light" ? themeControl.lightTitle : themeControl.darkTitle}
          >
            {themeMode === "light" ? <MoonIcon /> : <SunIcon />}
          </button>
        )}

        {!auditControl.inactive && auditVisible && (
          <button
            type="button"
            className={auditControl.className}
            onClick={onOpenAudit}
            disabled={auditControl.disabled}
            title={auditControl.title}
            aria-label={auditControl.ariaLabel}
            style={{ display: auditOpen ? "none" : "inline-flex" }}
          >
            <AuditTimelineIcon />
          </button>
        )}
      </div>
    </header>
  );
}
