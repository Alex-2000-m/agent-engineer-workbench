export type Guide = {
  summary: string;
  impact: string;
  action: string;
  model: string;
  category: string;
  verification: "supported" | "needs_review" | "conflict" | "insufficient";
  verificationNote: string;
};

export type WorkspacePatch = {
  enabledSources?: string[];
  radarTime?: string;
  auditDay?: string;
  auditTime?: string;
  gcDay?: number;
  gcTime?: string;
  reviewWindowDays?: number;
  archiveAfterDays?: number;
  defaultTtlDays?: number;
};
