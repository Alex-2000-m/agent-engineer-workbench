import entries from "@/knowledge/entries.json";
import { Workbench, type KnowledgeEntry } from "./workbench";

export default function Home() {
  return <Workbench entries={entries as KnowledgeEntry[]} />;
}
