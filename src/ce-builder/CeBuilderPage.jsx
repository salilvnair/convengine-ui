import { useCallback, useState } from "react";
import { ReactFlowProvider } from "reactflow";
import CeCanvas from "./canvas/CeCanvas.jsx";
import CeBlockPalette from "./canvas/CeBlockPalette.jsx";
import CeEditorPanel from "./panel/CeEditorPanel.jsx";
import LoadExistingDialog from "./LoadExistingDialog.jsx";
import { useCeBuilderStore } from "./store/ceBuilderStore.js";
import { deployCanvas } from "./api/ceConfig.api.js";
import { CE_BLOCKS } from "./blocks/registry.js";

// Top-level builder page. Layout mirrors Sim Studio's workspace page:
//   left rail = palette, center = canvas, right rail = editor panel.
// The toolbar across the top shows the "Deploy" action that posts canvas
// state to the (forthcoming) /api/v1/config/* endpoints and then calls
// /api/v1/cache/refresh.

export default function CeBuilderPage() {
  const addBlock = useCeBuilderStore((s) => s.addBlock);
  const blockCount = useCeBuilderStore((s) => Object.keys(s.blocks).length);
  const edgeCount = useCeBuilderStore((s) => s.edges.length);
  const dirty = useCeBuilderStore((s) => s.dirty);
  const toJSON = useCeBuilderStore((s) => s.toJSON);
  const markClean = useCeBuilderStore((s) => s.markClean);
  const clear = useCeBuilderStore((s) => s.clear);
  const loadFromPayload = useCeBuilderStore((s) => s.loadFromPayload);

  const [deploying, setDeploying] = useState(false);
  const [deployMessage, setDeployMessage] = useState("");
  const [deployError, setDeployError] = useState("");
  const [loadOpen, setLoadOpen] = useState(false);

  const handlePaletteClick = useCallback(
    (config) => {
      addBlock(config, { x: 160 + Math.random() * 200, y: 120 + Math.random() * 160 });
    },
    [addBlock]
  );

  const handleCanvasDrop = useCallback(
    (config, position) => {
      addBlock(config, position);
    },
    [addBlock]
  );

  const handleDeploy = useCallback(async () => {
    if (deploying) return;
    setDeploying(true);
    setDeployMessage("");
    setDeployError("");
    try {
      const result = await deployCanvas(toJSON());
      const failed = result.results.filter((r) => !r.ok);
      if (failed.length) {
        setDeployError(`Deploy failed: ${failed.map((f) => f.type).join(", ")}`);
      } else {
        markClean();
        setDeployMessage(
          result.cacheRefreshed
            ? `Deployed ${result.results.length} tables, cache refreshed.`
            : `Deployed ${result.results.length} tables. Cache refresh pending.`
        );
      }
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : "Deploy failed");
    } finally {
      setDeploying(false);
      window.setTimeout(() => {
        setDeployMessage("");
        setDeployError("");
      }, 4200);
    }
  }, [deploying, toJSON, markClean]);

  const handleExport = useCallback(() => {
    const data = JSON.stringify(toJSON(), null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ce-config-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [toJSON]);

  const handleClear = useCallback(() => {
    if (!blockCount) return;
    if (window.confirm("Clear the canvas? Unsaved blocks will be lost.")) clear();
  }, [blockCount, clear]);

  const handleLoaded = useCallback(
    (payload) => {
      loadFromPayload(payload, CE_BLOCKS);
      setDeployMessage(
        `Loaded ${(payload?.groups || []).reduce((sum, g) => sum + (g.rows?.length || 0), 0)} rows across ${(payload?.groups || []).length} tables.`
      );
      window.setTimeout(() => setDeployMessage(""), 4200);
    },
    [loadFromPayload]
  );

  return (
    <div className="ce-builder-root">
      <div className="ce-builder-toolbar">
        <div className="ce-builder-toolbar-left">
          <h2 className="ce-builder-title">CE Builder</h2>
          <span className="ce-builder-subtitle">Visual editor for ce_* configuration tables</span>
        </div>
        <div className="ce-builder-toolbar-center">
          <span className="ce-builder-stat">{blockCount} blocks</span>
          <span className="ce-builder-stat-sep">·</span>
          <span className="ce-builder-stat">{edgeCount} edges</span>
          {dirty ? <span className="ce-builder-stat ce-builder-stat-dirty">unsaved</span> : null}
          {deployMessage ? <span className="ce-builder-stat ce-builder-stat-ok">{deployMessage}</span> : null}
          {deployError ? <span className="ce-builder-stat ce-builder-stat-err">{deployError}</span> : null}
        </div>
        <div className="ce-builder-toolbar-right">
          <button type="button" className="ce-builder-btn" onClick={() => setLoadOpen(true)}>
            Load Existing
          </button>
          <button type="button" className="ce-builder-btn" onClick={handleExport} disabled={!blockCount}>
            Export JSON
          </button>
          <button type="button" className="ce-builder-btn" onClick={handleClear} disabled={!blockCount}>
            Clear
          </button>
          <button
            type="button"
            className="ce-builder-btn ce-builder-btn-primary"
            onClick={handleDeploy}
            disabled={!blockCount || deploying}
          >
            {deploying ? "Deploying…" : "Deploy"}
          </button>
        </div>
      </div>

      <div className="ce-builder-body">
        <CeBlockPalette onAdd={handlePaletteClick} />
        <ReactFlowProvider>
          <CeCanvas onDropBlock={handleCanvasDrop} />
        </ReactFlowProvider>
        <CeEditorPanel />
      </div>

      <LoadExistingDialog
        open={loadOpen}
        onClose={() => setLoadOpen(false)}
        onLoaded={handleLoaded}
      />
    </div>
  );
}
