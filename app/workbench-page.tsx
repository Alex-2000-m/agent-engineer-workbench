import entries from "@/knowledge/entries.json";
import guides from "@/knowledge/guides.json";
import settings from "@/workspace/settings.json";
import sources from "@/watchlist/sources.json";
import { Workbench, type KnowledgeEntry, type WatchSource, type WorkspaceSettings } from "./workbench";

export type WorkbenchPageView = "dashboard" | "knowledge" | "sources" | "automation" | "article" | "cleanup";

export function WorkbenchPage({ view }: { view: WorkbenchPageView }) {
  return (
    <Workbench
      entries={entries as KnowledgeEntry[]}
      initialGuides={guides}
      initialSettings={settings as WorkspaceSettings}
      initialSources={sources as WatchSource[]}
      view={view}
    />
  );
}
