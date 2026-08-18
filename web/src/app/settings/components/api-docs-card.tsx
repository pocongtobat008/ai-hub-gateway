"use client";

import { useEffect, useState } from "react";
import { ChevronDown, FileArchive, FileText, KeyRound, ListChecks, type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import webConfig from "@/constants/common-env";
import { getStoredAuthSession } from "@/store/auth";

type ParamRow = [string, string, string];

type ApiDoc = {
  title: string;
  method: string;
  path: string;
  icon: LucideIcon;
  input: ParamRow[];
  output: ParamRow[];
  example: (baseUrl: string, key: string) => string;
};

const docs: ApiDoc[] = [
  {
    title: "List Models",
    method: "GET",
    path: "/v1/models",
    icon: ListChecks,
    input: [
      ["Authorization", "header", "Bearer <auth-key>."],
    ],
    output: [
      ["data", "array", "List of models, containing id, object, created, owned_by."],
    ],
    example: (baseUrl: string, key: string) => `curl ${baseUrl}/models \\
  -H "Authorization: Bearer ${key}"`,
  },
  {
    title: "Chat Completion",
    method: "POST",
    path: "/v1/chat/completions",
    icon: FileText,
    input: [
      ["model", "string", "Model name, e.g. gpt-5-mini; also used for image-compatible scenarios."],
      ["messages", "array", "OpenAI-compatible message array."],
      ["stream", "boolean", "Optional, whether to stream the response."],
      ["n", "number", "Optional, parsed as the number of images to generate in image-compatible scenarios."],
    ],
    output: [
      ["id", "string", "Response ID."],
      ["choices", "array", "OpenAI-compatible choices."],
      ["usage", "object", "Optional, token usage information."],
    ],
    example: (baseUrl: string, key: string) => `curl ${baseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${key}" \\
  -d '{"model":"gpt-5-mini","messages":[{"role":"user","content":"Hello"}]}'`,
  },
  {
    title: "Responses",
    method: "POST",
    path: "/v1/responses",
    icon: FileText,
    input: [
      ["model", "string", "Model name."],
      ["input", "string | array | object", "User input; the prompt is parsed from it for image generation."],
      ["tools", "array", "Optional, Responses tool definitions."],
      ["stream", "boolean", "Optional, whether to stream the response."],
    ],
    output: [
      ["id", "string", "Response ID."],
      ["output", "array", "Responses-compatible output."],
      ["status", "string", "Response status."],
    ],
    example: (baseUrl: string, key: string) => `curl ${baseUrl}/responses \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${key}" \\
  -d '{"model":"gpt-5-mini","input":"Generate an image of a futuristic city"}'`,
  },
  {
    title: "Search",
    method: "POST",
    path: "/v1/search",
    icon: ListChecks,
    input: [
      ["prompt", "string", "Search question or retrieval instruction."],
    ],
    output: [
      ["answer", "string", "Search answer content; the actual fields depend on the returned result."],
      ["sources", "array", "Optional, search citation sources."],
      ["_account_email", "string", "Email of the account used for this request."],
    ],
    example: (baseUrl: string, key: string) => `curl ${baseUrl}/search \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${key}" \\
  -d '{"prompt":"Search for the latest ways to use chatgpt2api"}'`,
  },
  {
    title: "Image Generation",
    method: "POST",
    path: "/v1/images/generations",
    icon: FileArchive,
    input: [
      ["prompt", "string", "Image generation prompt."],
      ["model", "string", "Optional, defaults to gpt-image-2."],
      ["n", "number", "Optional, number of images to generate; currently limited to 1-4."],
      ["size", "string", "Optional, image size."],
      ["quality", "string", "Optional, defaults to auto."],
      ["response_format", "string", "Optional, defaults to b64_json."],
    ],
    output: [
      ["data", "array", "List of image results."],
      ["data[].b64_json", "string", "Base64 image content."],
      ["data[].url", "string", "Image URL returned in some configurations."],
    ],
    example: (baseUrl: string, key: string) => `curl ${baseUrl}/images/generations \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${key}" \\
  -d '{"model":"gpt-image-2","prompt":"A minimalist product poster","n":1}'`,
  },
  {
    title: "Image Edit",
    method: "POST",
    path: "/v1/images/edits",
    icon: FileArchive,
    input: [
      ["image", "file | file[] | URL", "Reference image; supports multipart upload and JSON image links."],
      ["prompt", "string", "Edit prompt."],
      ["model", "string", "Optional, defaults to gpt-image-2."],
      ["n", "number", "Optional, number of images to generate; currently limited to 1-4."],
      ["size", "string", "Optional, image size."],
      ["quality", "string", "Optional, defaults to auto."],
    ],
    output: [
      ["data", "array", "List of edited image results."],
      ["data[].b64_json", "string", "Base64 image content."],
      ["data[].url", "string", "Image URL returned in some configurations."],
    ],
    example: (baseUrl: string, key: string) => `curl ${baseUrl}/images/edits \\
  -H "Authorization: Bearer ${key}" \\
  -F "model=gpt-image-2" \\
  -F "prompt=Change it to a cyberpunk night scene" \\
  -F "image=@./input.png"`,
  },
  {
    title: "Create PPT Task",
    method: "POST",
    path: "/v1/ppt/generations",
    icon: FileText,
    input: [
      ["prompt", "string", "PPT requirement description. Can be empty, but it is recommended to include the full topic, page count, style, and content structure."],
      ["base64_images", "string[]", "Optional, image data URLs/base64 used as PPT reference material."],
      ["client_task_id", "string", "Optional, client-side idempotent task ID; resubmitting the same ID returns the existing task."],
    ],
    output: [
      ["id / taskId", "string", "Task ID, used for polling status."],
      ["status", "queued | running | success | error", "Task status."],
      ["kind", "ppt", "Task type."],
      ["created_at / updated_at", "string", "Task creation and update times."],
    ],
    example: (baseUrl: string, key: string) => `curl ${baseUrl}/ppt/generations \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${key}" \\
  -d '{"prompt":"Create a quarterly business report PPT within 8 pages","base64_images":[]}'`,
  },
  {
    title: "Create PSD Task",
    method: "POST",
    path: "/v1/psd/generations",
    icon: FileArchive,
    input: [
      ["prompt", "string", "PSD split and composition requirements, e.g. preserve layers, positions, background, and asset zip."],
      ["base64_images", "string[]", "Required, at least one image data URL/base64 used as the source for PSD splitting."],
      ["client_task_id", "string", "Optional, client-side idempotent task ID."],
    ],
    output: [
      ["id / taskId", "string", "Task ID, used for polling status."],
      ["status", "queued | running | success | error", "Task status."],
      ["kind", "psd", "Task type."],
      ["error", "string", "Error message returned on failure."],
    ],
    example: (baseUrl: string, key: string) => `curl ${baseUrl}/psd/generations \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${key}" \\
  -d '{"prompt":"Split the poster elements by their original positions and compose an editable PSD","base64_images":["data:image/png;base64,..."]}'`,
  },
  {
    title: "Query Task Status",
    method: "GET",
    path: "/v1/editable-file-tasks?ids={taskId1,taskId2}",
    icon: ListChecks,
    input: [
      ["ids", "string", "Optional, comma-separated task IDs; if omitted, returns all editable file tasks for the current user."],
    ],
    output: [
      ["items", "array", "Task list. The result of successful tasks contains primary_url and zip_url."],
      ["missing_ids", "string[]", "Returns the IDs that were not found when querying specific ids."],
      ["result.primary_url", "string", "Main file download URL."],
      ["result.zip_url", "string", "Asset zip download URL."],
    ],
    example: (baseUrl: string, key: string) => `curl "${baseUrl}/editable-file-tasks?ids=<task_id>" \\
  -H "Authorization: Bearer ${key}"`,
  },
  {
    title: "Download Result File",
    method: "GET",
    path: "/files/{file_path}",
    icon: FileArchive,
    input: [
      ["file_path", "string", "Returned by the task's result.primary_url or result.zip_url; usually no need to construct it manually."],
    ],
    output: [
      ["binary", "file", "Returns a pptx/psd/zip file stream."],
    ],
    example: (baseUrl: string, _key: string) => `curl ${baseUrl.replace(/\/v1$/, "")}/files/<file_path> -o result.zip`,
  },
];

const usableModels = ["gpt-image-2", "codex-gpt-image-2", "auto", "gpt-5", "gpt-5-1", "gpt-5-2", "gpt-5-3", "gpt-5-3-mini", "gpt-5-mini"];

function ParamTable({ rows }: { rows: ParamRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-stone-200">
      <table className="w-full text-left text-xs">
        <thead className="bg-stone-50 text-stone-500">
          <tr>
            <th className="px-3 py-2 font-medium">Parameter</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 bg-white">
          {rows.map(([name, type, desc]) => (
            <tr key={name}>
              <td className="px-3 py-2 font-mono text-stone-800">{name}</td>
              <td className="px-3 py-2 font-mono text-stone-500">{type}</td>
              <td className="px-3 py-2 text-stone-600">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ApiDocsCard() {
  const [authKey, setAuthKey] = useState("");
  const serviceBaseUrl = webConfig.apiUrl.replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin : "");
  const openAIBaseUrl = `${serviceBaseUrl}/v1`;
  const displayKey = authKey || "<current key>";

  useEffect(() => {
    let active = true;
    void getStoredAuthSession().then((session) => {
      if (active) setAuthKey(session?.key || "");
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Card className="rounded-2xl border-white/80 bg-white/90 shadow-sm">
      <CardContent className="space-y-5 p-6">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold text-stone-900">
            <KeyRound className="size-5 text-stone-500" />
            API Integration Guide
          </div>
          <p className="mt-1 text-xs leading-6 text-stone-500">
            Third-party apps integrate through the OpenAI-compatible API; the file task endpoints use the same authentication scheme.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1 rounded-xl border border-stone-200 bg-white px-3 py-2">
            <div className="text-xs text-stone-500">Service URL</div>
            <div className="break-all font-mono text-xs text-stone-800">{serviceBaseUrl}</div>
          </div>
          <div className="space-y-1 rounded-xl border border-stone-200 bg-white px-3 py-2">
            <div className="text-xs text-stone-500">Base URL（OpenAI）</div>
            <div className="break-all font-mono text-xs text-stone-800">{openAIBaseUrl}</div>
          </div>
          <div className="space-y-1 rounded-xl border border-stone-200 bg-white px-3 py-2">
            <div className="text-xs text-stone-500">API Key</div>
            <div className="break-all font-mono text-xs text-stone-800">{displayKey}</div>
          </div>
          <div className="space-y-1 rounded-xl border border-stone-200 bg-white px-3 py-2">
            <div className="text-xs text-stone-500">Request Header</div>
            <div className="break-all font-mono text-xs text-stone-800">Authorization: Bearer {displayKey}</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-stone-600">Common models; you can also request /v1/models to get them</div>
          <div className="flex flex-wrap gap-2">
            {usableModels.map((model) => (
              <span key={model} className="rounded-md border border-stone-200 bg-white px-2 py-1 font-mono text-xs text-stone-700">{model}</span>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {docs.map((item) => {
            const Icon = item.icon;
            return (
              <details key={item.path} className="group rounded-xl border border-stone-200 bg-white px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-stone-900">{item.title}</span>
                      <span className="mt-1 block truncate font-mono text-xs text-stone-500">{item.method} {item.path}</span>
                    </span>
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-stone-400 transition group-open:rotate-180" />
                </summary>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-stone-700">Input Parameters</h3>
                    <ParamTable rows={item.input} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-stone-700">Output Parameters</h3>
                    <ParamTable rows={item.output} />
                  </div>
                  <div className="space-y-2 lg:col-span-2">
                    <h3 className="text-xs font-semibold text-stone-700">Example Request</h3>
                    <pre className="overflow-auto whitespace-pre-wrap break-all rounded-xl bg-stone-950 px-3 py-3 text-xs leading-5 text-stone-100">{item.example(openAIBaseUrl, displayKey)}</pre>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
