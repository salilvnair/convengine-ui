import ChatPanel from "../../ChatPanel";
import CacheAnalyzePage from "../../CacheAnalyzePage";
import DbSchemaInspectPage from "../../DbSchemaInspectPage";
import PdfExtractPage from "../../PdfExtractPage";
import SemanticBuilderPage from "../../SemanticBuilderPage";
import SemanticQueryDebugPage from "../../SemanticQueryDebugPage";
import CeBuilderPage from "../../../ce-builder/CeBuilderPage.jsx";
import AgentBuilderPage from "../../../builder-studio/AgentBuilderPage.jsx";

export function PageContent({
  activePage,
  conversationId,
  onAuditUpdate,
  onEngineStatusUpdate,
  onTurnTimingUpdate,
  liveProgressText,
  inspectQuery,
  onOpenInspectDialog,
}) {
  if (activePage === "chat") {
    return (
      <ChatPanel
        conversationId={conversationId}
        onAuditUpdate={onAuditUpdate}
        onEngineStatusUpdate={onEngineStatusUpdate}
        onTurnTimingUpdate={onTurnTimingUpdate}
        progressText={liveProgressText}
      />
    );
  }

  if (activePage === "cache") return <CacheAnalyzePage />;

  if (activePage === "semantic_builder") {
    return (
      <SemanticBuilderPage
        query={inspectQuery}
        onOpenRunDialog={onOpenInspectDialog}
      />
    );
  }

  if (activePage === "semantic_debug") return <SemanticQueryDebugPage />;

  if (activePage === "pdf_extract") return <PdfExtractPage />;

  if (activePage === "ce_builder") return <CeBuilderPage />;

  if (activePage === "agent_builder") return <AgentBuilderPage />;

  return (
    <DbSchemaInspectPage
      query={inspectQuery}
      onOpenRunDialog={onOpenInspectDialog}
    />
  );
}
