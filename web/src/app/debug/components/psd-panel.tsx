"use client";

import { EditableFilePanel } from "./editable-file-panel";

const defaultPrompt = "Split the poster elements at their original positions and composite them into an editable PSD, preserving the background and each element's layer position, and output a zip with each layer's assets.";

export function PsdPanel() {
  return <EditableFilePanel title="PSD Generation" kind="psd" endpoint="/v1/psd/generations" defaultPrompt={defaultPrompt} imageRequired />;
}
