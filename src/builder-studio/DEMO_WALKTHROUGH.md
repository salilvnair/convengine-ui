# Builder Studio — Demo walkthrough (URL → Summary)

This is the exact path the seeded demo workflow takes when you hit **Run**,
block by block, with every substitution spelled out. Use it to reproduce
a run by hand or to debug why a variant fails.

## Pre-flight

1. Start convengine: `cd convengine && ./mvnw spring-boot:run`
   (default port `8080`, API at `/api/v1`).
2. Start the UI: `cd convengine-ui-builder/convengine-ui && npm run dev`.
3. Open the app, sidenav → **Workflows** → select **"Demo · URL → Summary"**.
4. The canvas shows 5 nodes:
   `Start → URL (user_input) → URL Data Extractor (agent) → Summarizer (agent) → Response`.

## Seeded data

**Skill** (`sk_url_extract`) — pure client-side JS. Takes `{ url }`, `fetch()`s
it, strips tags, returns `{ url, title, text, status }`. Source lives in
`stores/workspace-store.js` under `demoSkillSource`.

**Agent 1** (`URL Data Extractor`) — has `skills: ["sk_url_extract"]`
attached. Its job is to return a clean `{ url, title, text }` envelope.

**Agent 2** (`Summarizer`) — has no skills. Strict JSON output
`{ summary, bullets[] }`.

**User input node** (`n_input`) — carries a `defaultValue` so the Run panel
auto-runs without a popup. You can edit the value inline on the card.

## What happens on Run (step-by-step)

Everything below is executed by `run/graph-runner.js` in the browser. The
only thing that hops to the backend is the agent LLM call.

### Step 0 — Run panel opens

`AgentBuilderPage` renders `<RunModal>` docked to the bottom of the canvas.
The panel reads every `user_input` node's `defaultValue`. If all required
inputs are satisfied, it calls `doRun()` immediately. If any is blank, it
shows inline input fields and waits for **Run**.

→ On the demo, `defaultValue = "https://www.salilvnair.com/docs/v2/architecture"`,
so auto-run kicks in.

### Step 1 — Seed `starter` and `user_input` outputs

```
outputs.n_starter = null
outputs.n_input   = "https://www.salilvnair.com/docs/v2/architecture"
```

Both nodes are marked "started" — they need no execution. The canvas marks
`n_input` green (done).

### Step 2 — BFS picks up ready nodes

The only node whose incoming edges are now live is `n_agent1`. Execution
proceeds in a ready-set loop (sibling branches in parallel; we have none
here so it's sequential).

### Step 3 — `n_agent1` (URL Data Extractor)

`runNode()` routes to `runAgentNode()`.

1. `input = "https://www.salilvnair.com/docs/v2/architecture"` (from
   `outputs.n_input`).
2. **Skill execution** — `values.skills` is `["sk_url_extract"]`. The runner
   reads the skill source from `useWorkspaceStore.getState().skills`,
   wraps it as `new Function('params', source)`, and calls it with
   `{ url: input, input }` because `input` looks like a URL.
3. The skill fetches the page (CORS permitting), strips HTML, and returns
   `{ url, title, text, status }`.
4. The runner substitutes this JSON as the agent's new `input`.
5. POST to `http://localhost:8080/api/v1/builder-studio/agent` with the
   agent payload (systemPrompt, userPrompt with `{{input}}` already
   interpolated, responseFormat schema, strictOutput: true, skills list).
6. Backend `BuilderStudioRunner.callAgent()` re-wraps the map payload as a
   fasterxml `JsonNode` and calls `LlmClient.generateJsonStrict()` with the
   prompt + response format. Returns the LLM's structured JSON.
7. `outputs.n_agent1` = that JSON string.

The canvas: edge `n_input → n_agent1` animates dashed green while running,
then solidifies when done. Node pulses green.

### Step 4 — `n_agent2` (Summarizer)

1. `input = outputs.n_agent1` — the envelope from Step 3.
2. No skills attached → goes straight to the backend LLM call.
3. Strict JSON output with schema `{ summary, bullets[] }`.

### Step 5 — `n_response`

Runs `interpolate(values.data, outputs, input)`. The demo sets
`values.data = "<n_agent2.output>"`, so the final output is the summarizer's
JSON verbatim. This becomes the `result.output` shown in the Run dock.

## Why your earlier run returned "No content provided to summarize"

Root cause: before today, the builder-studio backend **dropped** `tools`
and `skills` from the agent payload (see `synthAgentNode()` in
`BuilderStudioRunner.java` — only `model`, `systemPrompt`, `userPrompt`,
`responseFormat`, `strictOutput` survive). So even when you listed
`"sk_url_extract"` in the agent's skills, the LLM never ran it, never
fetched the page, and hallucinated a refusal ("I'm sorry, but you did not
provide a valid URL").

Fix (landed): skills are now executed **client-side** in
`graph-runner.runAgentNode` before the agent call. The skill's output
replaces the agent's input, so the LLM receives the real extracted text
instead of the raw URL.

## Debugging tips

- Browser devtools → Network tab → filter `builder-studio`. Confirm the
  POST body for each agent node. The `input` field should be the expanded
  skill output for `n_agent1`, not a bare URL.
- CORS: if `fetch(params.url)` fails in the skill, open the URL's domain
  in another tab first (most docs sites allow cross-origin GETs; some
  don't). Consider running through a proxy for sites that block it.
- `chosenHandle` branching — if you add an `if_else` between blocks,
  check `graph-runner`'s `edgeIsLive()` only follows the chosen branch.
- Trace: the Run dock's "Trace" grid shows every node's output + ms.
  `n_agent1`'s `ms` field > 500ms typically means network + LLM are OK.

## Customizing the demo

- **Change URL**: edit the card's "Value (auto-run)" field (or clear it to
  force the popup).
- **Use a different skill**: add a new skill via the Skills sidenav, then
  edit `n_agent1`'s Skills/Tools field to `["sk_your_id"]`.
- **Add an If/Else**: drop an `if_else` block between the extractor and
  summarizer with expression `input.status === 200` to route errors to
  a separate response path.
