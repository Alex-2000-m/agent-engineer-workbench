import entries from "@/knowledge/entries.json";
import guides from "@/knowledge/guides.json";
import settings from "@/workspace/settings.json";
import { Workbench, type KnowledgeEntry, type WorkspaceSettings } from "./workbench";

export type WorkbenchPageView = "dashboard" | "knowledge" | "sources" | "automation";

export function WorkbenchPage({ view }: { view: WorkbenchPageView }) {
  return (
    <Workbench
      entries={entries as KnowledgeEntry[]}
      initialGuides={guides}
      initialSettings={settings as WorkspaceSettings}
      view={view}
    />
  );
}
