"use client";

import { EditableFilePanel } from "./editable-file-panel";

const defaultPrompt = "Create a \"2026 Q2 E-commerce Operations Report\" PPT for the company's quarterly management meeting. Keep it within 8 pages with a business-tech aesthetic. Highlight sales growth, user growth, advertising performance, and 618 campaign results, presented with line, bar, ring, and funnel charts.";

export function PptPanel() {
  return <EditableFilePanel title="PPT Generation" kind="ppt" endpoint="/v1/ppt/generations" defaultPrompt={defaultPrompt} />;
}
