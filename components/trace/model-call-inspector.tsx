"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ModelCall, ModelToolCall } from "@/lib/trace/types";
import { formatBytes, formatClock, formatMs, prettyJson } from "@/lib/trace/timeline";
import { conversation, promptSections, type Message } from "@/lib/trace/context";
import { relationWord, type Owner } from "@/lib/trace/moments";
import { CorrelationTag } from "@/components/trace/rows";
import { Disclosure } from "@/components/trace/disclosure";
import { Header, type Back } from "@/components/trace/event-details";

import type { Jump, Pane } from "@/lib/trace/selection";
export type { Focus, Jump, Pane } from "@/lib/trace/selection";

type Props = {
  call: ModelCall;
  jump?: Jump | null;      // a new object each time the graph is clicked
  owner?: Owner | null;    // the submit the trace joined the call to, if any
  onLoadRaw: (call: ModelCall) => Promise<void>;
  onAskBart?: () => void;
  onClose: () => void;
  back?: Back;
};

const PANES: { id: Pane; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "context", label: "Context" }, { id: "messages", label: "Messages" },
  { id: "tools", label: "Tools" }, { id: "output", label: "Output" }, { id: "raw", label: "Raw" },
];

// The panes overflow rather than wrap: beside the canvas the panel can
// be dragged narrow, and a second row of tabs would push the body down.
const LIST = "group-data-[orientation=horizontal]/tabs:h-auto h-auto w-full items-end justify-start gap-4 overflow-x-auto rounded-none border-b bg-transparent px-[18px] pt-1";
const TRIGGER = "-mb-px h-auto flex-none rounded-none border-0 border-b-2 border-transparent px-0 pt-1.5 pb-2 text-[12px] font-normal text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none";

// One model call, the way the person needs to read it: what was asked
// (context and messages), with what tools, what came back, and the bytes
// themselves. Nothing here is inferred: every field is what the gateway
// saw go by, after redaction.
export function ModelCallInspector({ call, jump = null, owner = null, onLoadRaw, onAskBart, onClose, back = null }: Props) {
  const [pane, setPane] = useState<Pane>(jump?.pane ?? "overview");
  const body = useRef<HTMLDivElement>(null);
  const full = call.capture === "full";
  // A click on a node of the graph lands on its pane, at its section.
  useEffect(() => { if (jump) setPane(jump.pane); }, [jump]);
  useEffect(() => {
    const el = body.current;
    if (!el || !jump) return;
    const target = jump.focus ? el.querySelector<HTMLElement>(`[data-focus="${jump.focus}"]`) : null;
    el.scrollTop = target ? el.scrollTop + target.getBoundingClientRect().top - el.getBoundingClientRect().top - 8 : 0;
  }, [jump, pane]);
  return (
    <section aria-label="Model call" className="flex h-full min-h-0 flex-col">
      <Header title={<>{call.model ?? "model call"} <span className="font-normal text-muted-foreground">· {call.api ?? call.method}</span></>} back={back} onAskBart={onAskBart ?? (() => {})} onClose={onClose} className="border-b-0 pb-1">
        <span className="font-mono text-[11px]">{formatClock(call.startedAt).replace(/\.\d{3}$/, "")}</span>
      </Header>
      <Tabs value={pane} onValueChange={(v) => setPane(v as Pane)} className="shrink-0">
        <TabsList className={LIST}>
          {PANES.map((p) => <TabsTrigger key={p.id} value={p.id} className={TRIGGER}>{p.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-[18px] py-4 text-[13px]">
        {!full && pane !== "overview" && pane !== "raw" && (
          <Note>Content was not kept for this run (capture: metadata). Counts and settings are shown; prompts and answers are not.</Note>
        )}
        {pane === "overview" && <Overview call={call} owner={owner} />}
        {pane === "context" && <Context call={call} />}
        {pane === "messages" && <Messages call={call} />}
        {pane === "tools" && <Tools call={call} />}
        {pane === "output" && <Output call={call} />}
        {pane === "raw" && <Raw call={call} onLoadRaw={onLoadRaw} />}
      </div>
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 rounded-md border bg-[#f6f6f6] px-3 py-2 text-[12px] leading-5 text-muted-foreground">{children}</p>;
}

function Field({ label, children, mono = false }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex gap-4 py-1.5">
      <dt className="w-[150px] shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 flex-1 break-words", mono && "font-mono text-[12px]")}>{children}</dd>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-5 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">{children}</h3>;
}

function Code({ text, className }: { text: string; className?: string }) {
  return <pre className={cn("overflow-x-auto whitespace-pre-wrap break-words rounded-md border bg-[#fafafa] px-3 py-2 font-mono text-[12px] leading-[1.6]", className)}>{text || " "}</pre>;
}

const json = (v: unknown) => JSON.stringify(v, null, 2);

// The call at a glance: which model, how long and how, how much went
// each way, what it was tied to, how it ended. Everything the gateway
// recorded beyond that (provider and path, first byte and first token,
// usage, chunks, capture mode, ids, the headers) waits under Technical
// details; nothing is dropped.
function Overview({ call, owner }: { call: ModelCall; owner: Owner | null }) {
  const r = call.response;
  const usage = call.usage;
  const state = call.phase === "request" ? "in flight" : call.phase === "error" ? `error${call.error ? ` · ${call.error.type}` : ""}` : call.aborted ? "aborted by the application" : "done";
  const timing = call.phase === "request" ? (call.streamed ?? call.request?.stream) ? "streaming…" : "in flight…" : `${formatMs(call.latencyMs)}${call.streamed ? " · streamed" : ""}`;
  const messages = call.request ? `${call.request.message_count} message${call.request.message_count === 1 ? "" : "s"}` : "request not described";
  return (
    <div>
      <p className="text-[15px] font-semibold leading-6">{call.model ?? "model call"}{r?.model && r.model !== call.model && <span className="font-normal text-muted-foreground"> · answered as {r.model}</span>}</p>
      <dl className="mt-2 flex flex-col gap-1 leading-5">
        <Glance>{timing}</Glance>
        <Glance>{messages}</Glance>
        <Glance>request {formatBytes(call.sizes?.request_bytes)} · response {formatBytes(call.sizes?.response_bytes)}</Glance>
        <Glance label="Correlation">{owner ? <>{owner.title} · <CorrelationTag how={owner.correlation} title={`${relationWord(owner.correlation)} to ${owner.title}`} /></> : <span className="text-muted-foreground">no interaction linked</span>}</Glance>
        <Glance label="Status">{call.status ?? "–"} · {state}</Glance>
        {call.error && <Glance label="Error"><span className="text-destructive">{call.error.message}</span></Glance>}
      </dl>
      <Disclosure key={call.callId} label="Technical details" className="mt-4 border-t">
        <dl className="divide-y">
          <Field label="Provider">{call.provider ?? "unclaimed"} {call.api && <span className="text-muted-foreground">· {call.api}</span>}</Field>
          <Field label="Upstream" mono>{call.method} {call.upstream.scheme}://{call.upstream.host}{call.upstream.path}{call.upstream.has_query && <span className="font-sans text-muted-foreground"> (query not kept)</span>}</Field>
          <Field label="Started">{formatClock(call.startedAt)}{call.endedAt && <span className="text-muted-foreground"> · ended {formatClock(call.endedAt)}</span>}</Field>
          <Field label="Latency">{formatMs(call.latencyMs)} <span className="text-muted-foreground">· first byte {formatMs(call.ttfbMs)} · first token {formatMs(call.ttftMs)}</span></Field>
          <Field label="Usage">
            {call.usageAvailable && usage ? (
              <span className="font-mono text-[12px]">{Object.entries(usage).filter(([, v]) => typeof v === "number").map(([k, v]) => `${k} ${v}`).join(" · ")}</span>
            ) : (
              <span className="text-muted-foreground">unavailable: the provider did not return usage for this request, and Engelbart does not change the request to ask for it</span>
            )}
          </Field>
          <Field label="Finish">{r?.finish_reason ?? "–"}{r && r.chunks !== null && <span className="text-muted-foreground"> · {r.chunks} stream chunks{r.complete ? "" : " · stream ended without [DONE]"}</span>}</Field>
          <Field label="Sizes">request {formatBytes(call.sizes?.request_bytes)} · response {formatBytes(call.sizes?.response_bytes)}{call.sizes?.request_truncated || call.sizes?.response_truncated ? <span className="text-muted-foreground"> · raw bodies cut at the storage limit</span> : null}</Field>
          <Field label="Capture">{call.capture === "full" ? "full content, redacted" : "metadata only"}</Field>
          <Field label="Correlation">{call.interactionId ? `${call.correlation ?? "explicit"} · interaction ${call.interactionId}` : <span className="text-muted-foreground">no interaction linked</span>}{call.requestId && <span className="text-muted-foreground"> · request {call.requestId}</span>}</Field>
          <Field label="Call id" mono>{call.callId}</Field>
          {call.error && <Field label="Error"><span className="text-destructive">{call.error.message}</span>{call.error.code && <span className="text-muted-foreground"> · {call.error.code}</span>}{call.error.phase && <span className="text-muted-foreground"> · at {call.error.phase}</span>}</Field>}
          {call.requestParse && !call.requestParse.ok && <Field label="Request">not described: {call.requestParse.reason}</Field>}
          {r?.parse_errors?.length ? <Field label="Parse">{r.parse_errors.map((e) => e.message).join("; ")}</Field> : null}
          <Field label="Request headers" mono>{headers(call.requestHeaders)}</Field>
          <Field label="Response headers" mono>{headers(call.responseHeaders)}</Field>
        </dl>
      </Disclosure>
    </div>
  );
}

function Glance({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      {label && <dt className="shrink-0 text-muted-foreground">{label}:</dt>}
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

const headers = (h: Record<string, string> | null) =>
  h && Object.keys(h).length ? Object.entries(h).map(([k, v]) => `${k}: ${v}`).join("\n") : <span className="font-sans text-muted-foreground">none kept</span>;

// What the captured request carried, arranged for reading: the system
// instructions in the sections their author marked, the turns before the
// latest input, the input itself, the tools offered, the shape the answer
// had to take, the settings. A presentation of the message array, not a
// record of where any of it came from; the Messages pane holds the array
// as sent.
function Context({ call }: { call: ModelCall }) {
  const req = call.request;
  if (!req) return <p className="text-muted-foreground">The request could not be described{call.requestParse?.reason ? `: ${call.requestParse.reason}` : ""}.</p>;
  const { system, turns, input } = conversation(req);
  const systemText = typeof req.system === "string" ? req.system : null;
  const sections = systemText !== null ? promptSections(systemText) : [];
  const settings = Object.entries(req.settings ?? {});
  const rf = req.response_format as { type?: string; json_schema?: { name?: string; strict?: boolean; schema?: unknown }; schema_name?: string; strict?: boolean } | null;
  const tools = (req.tools ?? []) as { type?: string; name?: string; function?: { name?: string } }[];
  const choice = req.tool_choice;
  const inputTitle = !input ? "Latest input" : input.role === "user" ? "User message" : input.role === "tool" ? "Tool result" : `Latest input · ${input.role ?? "?"}`;
  return (
    <div className="flex flex-col gap-6">
      <section data-focus="system">
        <Heading>System instructions</Heading>
        {systemText !== null ? (
          sections.length > 1 ? (
            <>
              <p className="mb-2 text-[12px] text-muted-foreground">{sections.length} sections, split where the prompt itself draws a rule or a heading, for reading only. The text is as sent.</p>
              <ol className="flex flex-col gap-2">
                {sections.map((sec, i) => (
                  <li key={i} className="rounded-md border">
                    <div className="border-b bg-[#fafafa] px-3 py-1.5 text-[11px] text-muted-foreground"><span className="font-semibold text-foreground">{i + 1}</span> · {sec.title}</div>
                    <pre className="overflow-x-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12px] leading-[1.6]">{sec.text}</pre>
                  </li>
                ))}
              </ol>
            </>
          ) : <Code text={systemText} />
        ) : req.system ? <p className="text-muted-foreground">{typeof req.system === "object" ? req.system.chars : "?"} characters, not kept</p> : <p className="text-muted-foreground">none: the first message is not a system message</p>}
        {system.length > 1 && <p className="mt-2 text-[12px] text-muted-foreground">{system.length - 1} more system message{system.length === 2 ? "" : "s"} in the array; see Messages.</p>}
      </section>
      <section data-focus="history">
        <Heading>Prior conversation</Heading>
        {turns.length ? <ol className="flex flex-col gap-3">{turns.map((m, i) => <MessageCard key={i} m={m} />)}</ol> : <p className="text-muted-foreground">none: the latest input is the first message after the system prompt</p>}
      </section>
      <section data-focus="input">
        <Heading>{inputTitle}</Heading>
        {input ? <ol><MessageCard m={input} /></ol> : <p className="text-muted-foreground">none</p>}
      </section>
      <section data-focus="tools">
        <Heading>Tools offered</Heading>
        {tools.length ? (
          <p className="font-mono text-[12px]">
            {tools.map((t) => t.function?.name ?? t.name ?? t.type ?? "?").join(", ")}
            <span className="font-sans text-muted-foreground"> · choice {choice === null || choice === undefined ? "provider default" : typeof choice === "string" ? choice : json(choice)} · definitions under Tools</span>
          </p>
        ) : <p className="text-muted-foreground">none</p>}
      </section>
      <section data-focus="contract">
        <Heading>Output contract</Heading>
        {rf ? (
          <div>
            <p>{rf.type ?? "?"}{(rf.json_schema?.name ?? rf.schema_name) && <span className="text-muted-foreground"> · schema {rf.json_schema?.name ?? rf.schema_name}{(rf.json_schema?.strict ?? rf.strict) ? " · strict" : ""}</span>}</p>
            {rf.json_schema?.schema ? <Code text={json(rf.json_schema.schema)} className="mt-2 max-h-[420px] overflow-y-auto" /> : null}
          </div>
        ) : <p className="text-muted-foreground">none: free text</p>}
      </section>
      <section data-focus="settings">
        <Heading>Request settings</Heading>
        <dl className="divide-y">
          {settings.map(([k, v]) => <Field key={k} label={k} mono>{typeof v === "object" ? json(v) : String(v)}</Field>)}
          {!settings.length && <Field label="Settings"><span className="text-muted-foreground">provider defaults</span></Field>}
          <Field label="Messages">{req.message_count} <span className="text-muted-foreground">· {req.prompt_chars} characters in all, {req.system_chars} in the system prompt</span></Field>
          <Field label="Streaming">{req.stream ? "requested" : "no"}</Field>
          {req.truncated && <Field label="Note">message text was clipped to the storage budget</Field>}
        </dl>
      </section>
    </div>
  );
}

function Messages({ call }: { call: ModelCall }) {
  const messages = (call.request?.messages ?? []) as Message[];
  if (!messages.length) return <p className="text-muted-foreground">No messages.</p>;
  return <ol className="flex flex-col gap-3">{messages.map((m, i) => <MessageCard key={i} m={m} />)}</ol>;
}

// One message as sent: its role, its content in whatever shape it took.
function MessageCard({ m }: { m: Message }) {
  return (
    <li className="rounded-md border">
      <div className="flex items-center gap-2 border-b bg-[#fafafa] px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span className="font-semibold text-foreground">{m.role ?? "?"}</span>
        {m.name && <span>· {m.name}</span>}
        {m.tool_call_id && <span className="font-mono normal-case tracking-normal">· {m.tool_call_id}</span>}
        {typeof m.chars === "number" && <span className="ml-auto normal-case tracking-normal">{m.chars} characters</span>}
      </div>
      <div className="px-3 py-2">
        {typeof m.content === "string" ? <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-[1.55]">{m.content}</pre>
          : Array.isArray(m.content) ? m.content.map((p, j) => (
              <div key={j} className="mb-2 last:mb-0">
                {p.type === "text" || typeof p.text === "string" ? <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-[1.55]">{p.text}</pre>
                  : p.type === "image_url" ? <span className="text-muted-foreground">[image{p.image_url?.url?.startsWith("data:") ? ", inline data" : `: ${p.image_url?.url ?? ""}`}]</span>
                  : <Code text={json(p)} />}
              </div>
            ))
          : m.content === null || m.content === undefined ? (typeof m.chars === "number" ? null : <span className="text-muted-foreground">no content</span>)
          : <Code text={json(m.content)} />}
        {Array.isArray(m.tool_calls) && m.tool_calls.length > 0 && <Code text={json(m.tool_calls)} className="mt-2" />}
      </div>
    </li>
  );
}

function Tools({ call }: { call: ModelCall }) {
  const tools = (call.request?.tools ?? []) as { type?: string; name?: string; function?: { name?: string; description?: string; parameters?: unknown } }[];
  const choice = call.request?.tool_choice;
  return (
    <div>
      <Heading>Tools offered</Heading>
      {tools.length ? (
        <ol className="flex flex-col gap-3">
          {tools.map((t, i) => (
            <li key={i} className="rounded-md border px-3 py-2">
              <p className="font-mono text-[12px]">{t.function?.name ?? t.name ?? t.type ?? "?"}</p>
              {t.function?.description && <p className="mt-1 text-muted-foreground">{t.function.description}</p>}
              {t.function?.parameters ? <Code text={json(t.function.parameters)} className="mt-2 max-h-[300px] overflow-y-auto" /> : null}
            </li>
          ))}
        </ol>
      ) : <p className="text-muted-foreground">none</p>}
      <Heading>Tool choice</Heading>
      <p className="font-mono text-[12px]">{choice === null || choice === undefined ? <span className="font-sans text-muted-foreground">provider default</span> : typeof choice === "string" ? choice : json(choice)}</p>
      <Heading>Tool calls in the answer</Heading>
      <ToolCalls calls={toolCalls(call)} />
    </div>
  );
}

const toolCalls = (call: ModelCall): ModelToolCall[] | string[] => {
  const out = call.response?.output;
  return out && "tool_calls" in out ? out.tool_calls : [];
};

function ToolCalls({ calls }: { calls: ModelToolCall[] | string[] }) {
  if (!calls.length) return <p className="text-muted-foreground">none</p>;
  return (
    <ol className="flex flex-col gap-2">
      {calls.map((t, i) => typeof t === "string" ? <li key={i} className="font-mono text-[12px]">{t}</li> : (
        <li key={i} className="rounded-md border px-3 py-2">
          <p className="font-mono text-[12px]">{t.name}{t.id && <span className="text-muted-foreground"> · {t.id}</span>}</p>
          <Code text={prettyJson(t.arguments) ?? t.arguments} className="mt-2" />
        </li>
      ))}
    </ol>
  );
}

function Output({ call }: { call: ModelCall }) {
  const [view, setView] = useState<"parsed" | "text">("parsed");
  const r = call.response;
  if (call.phase === "request") return <p className="text-muted-foreground">Still in flight.</p>;
  if (call.phase === "error") return <p className="text-destructive">{call.error?.message ?? "The call failed."}</p>;
  const out = r?.output;
  if (!out) return <p className="text-muted-foreground">Nothing was read from the response{r?.parse_errors?.length ? `: ${r.parse_errors.map((e) => e.message).join("; ")}` : ""}.</p>;
  if (!("text" in out)) {
    return (
      <dl className="divide-y">
        <Field label="Answer">{out.chars} characters, not kept</Field>
        <Field label="Refusal">{out.refusal ? "yes" : "no"}</Field>
        <Field label="Tool calls">{out.tool_calls.length ? out.tool_calls.join(", ") : "none"}</Field>
        <Field label="Finish">{r?.finish_reason ?? "–"}</Field>
      </dl>
    );
  }
  const parsed = prettyJson(out.text);
  return (
    <div>
      <div className="mb-2 flex items-center gap-3 text-[12px] text-muted-foreground">
        <span>{out.role ?? "assistant"} · finish {r?.finish_reason ?? "–"}{call.streamed ? ` · streamed in ${r?.chunks ?? "?"} chunks, first token after ${formatMs(call.ttftMs)}` : ""}</span>
        {parsed && (
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={() => setView("parsed")} className={cn("hover:text-foreground", view === "parsed" && "font-semibold text-foreground")}>Final JSON</button>
            <button type="button" onClick={() => setView("text")} className={cn("hover:text-foreground", view === "text" && "font-semibold text-foreground")}>As streamed</button>
          </span>
        )}
      </div>
      {out.refusal && <Note>Refusal: {out.refusal}</Note>}
      {parsed && view === "parsed" ? <Code text={parsed} /> : <Code text={out.text} className="font-sans" />}
      {out.text_truncated && <p className="mt-2 text-[12px] text-muted-foreground">The answer was clipped to the storage budget; the raw response holds more.</p>}
      {!parsed && call.request?.response_format ? <p className="mt-2 text-[12px] text-muted-foreground">A JSON response was requested, but the text does not parse as JSON.</p> : null}
      {out.tool_calls.length > 0 && <div className="mt-4"><Heading>Tool calls</Heading><ToolCalls calls={out.tool_calls} /></div>}
    </div>
  );
}

function Raw({ call, onLoadRaw }: { call: ModelCall; onLoadRaw: (call: ModelCall) => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const have = call.rawRequest !== null || call.rawResponse !== null;
  if (call.capture !== "full") return <p className="text-muted-foreground">Raw bodies were not kept for this run (capture: metadata).</p>;
  if (!have) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-muted-foreground">The request body as the application sent it and the response bytes as the provider returned them, after redaction. Fetched only when asked: they can be large.</p>
        <Button variant="outline" size="sm" disabled={loading} onClick={async () => { setLoading(true); try { await onLoadRaw(call); } finally { setLoading(false); } }} className="h-7 px-3 font-normal">{loading ? "Loading…" : "Load raw bodies"}</Button>
      </div>
    );
  }
  return (
    <div>
      <Heading>Request body</Heading>
      <Code text={prettyJson(call.rawRequest) ?? call.rawRequest ?? "(empty)"} className="max-h-[480px] overflow-y-auto" />
      <Heading>Response body</Heading>
      <Code text={(call.streamed ? call.rawResponse : prettyJson(call.rawResponse) ?? call.rawResponse) ?? "(empty)"} className="max-h-[480px] overflow-y-auto" />
      <p className="mt-2 text-[12px] text-muted-foreground">Credentials, cookies and saved secret values were redacted before storage; the provider received the originals.</p>
    </div>
  );
}
