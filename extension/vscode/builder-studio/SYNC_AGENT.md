# Builder Studio Extension — Sync Agent Instructions

> **How to use this file:**
> Open Copilot chat and say: *"Read `extension/vscode/builder-studio/SYNC_AGENT.md` and sync the extension with the latest convengine-ui changes"* — or be specific about what changed and what to sync.

---

## Architecture overview

This VS Code extension is a **port** of the `convengine-ui` builder-studio. Two separate codebases must stay in sync for certain areas; others sync automatically.

```
convengine-ui/                          extension/vscode/builder-studio/
├─ src/builder-studio/                  ├─ src/
│  ├─ run/graph-runner.js     ──port──► │  ├─ engine/graph-runner.ts
│  ├─ blocks/registry.js      ──port──► │  │     (block handlers inlined here)
│  ├─ blocks/blocks/*.js      ──port──► │  │
│  ├─ mcp/mcp-client.js       ──port──► │  ├─ services/mcp.ts
│  └─ api/run-client.js       ──port──► │  ├─ bridge/routes/run.ts
│                                       │  ├─ bridge/routes/agent.ts
│                                       │  ├─ bridge/routes/deploy.ts
│                                       │  ├─ bridge/routes/mcp.ts
│                                       │  ├─ bridge/routes/workspace.ts
│                                       │  ├─ bridge/routes/provider.ts
│                                       │  ├─ services/llm.ts     (vscode.lm, not OpenAI)
│                                       │  ├─ services/workspace.ts
│                                       │  ├─ engine/scheduler.ts
│                                       │  ├─ storage/db.ts       (JSON file store)
│                                       │  ├─ panel/BuilderStudioPanel.ts
│                                       │  ├─ chat/participant.ts
│                                       │  └─ extension.ts
│
├─ src/  (React UI)           ──auto──► webview/dist/  (auto via npm run dev:extension)
```

---

## What syncs automatically (no agent needed)

Any change to the **React UI layer** in `convengine-ui/src/` is automatically picked up:

- New/changed React components, Canvas, WorkflowNode, panels
- CSS / Tailwind changes
- Zustand store changes (UI state only)
- New builder-studio tabs, modals, toolbars

**How:** Run `npm run dev:extension` from `convengine-ui/` root. Vite watches `src/` and rebuilds into `extension/vscode/builder-studio/webview/dist/` on every save.

---

## What requires manual sync (prompt the agent)

These are **TypeScript ports** in the extension that must be kept in sync with their JS counterparts in convengine-ui.

### 1. New block type added to registry

**Source:** `src/builder-studio/blocks/registry.js` + `src/builder-studio/blocks/blocks/<name>.js`

**Extension target:** `src/engine/graph-runner.ts` — the `executeBlock()` switch/case handles each block type.

**What to tell Copilot:**
> "A new block type `<name>` was added to convengine-ui. Read `src/builder-studio/blocks/blocks/<name>.js` and add its execution logic to `extension/vscode/builder-studio/src/engine/graph-runner.ts`."

**Key rules when porting a block:**
- The block receives `{ node, inputs, subBlockValues, callAgent, callTool, workflow }` — no React, no Zustand
- `callAgent(prompt, model?)` routes through `vscode.lm` (GitHub Copilot), not OpenAI
- `callTool(serverId, toolName, args)` goes to the MCP service, not the browser client
- No `fetch()` to `/api/v1/*` — bridge routes handle that
- Async blocks must return `{ output, logs? }`

---

### 2. graph-runner.js logic changed

**Source:** `src/builder-studio/run/graph-runner.js` (~1250 lines)

**Extension target:** `src/engine/graph-runner.ts`

**Common changes that need porting:**
- New BFS/traversal logic (reachability, cycle detection)
- New parallel execution handling
- New port-type validation (`checkValueType`)
- New `GraphValidationError` fields
- New `onProgress` event types

**What to tell Copilot:**
> "The graph-runner in convengine-ui changed — specifically `<describe what changed>`. Port that change to `extension/vscode/builder-studio/src/engine/graph-runner.ts`, keeping the extension-specific adaptations (no Zustand, dependency-injected callAgent/callTool)."

---

### 3. New API endpoint added to ce-builder-studio

**Source:** Reference `ce-builder-studio/src/routes/` (if available) or convengine-ui `src/builder-studio/api/`

**Extension target:** `src/bridge/routes/<area>.ts`  +  mount in `src/bridge/server.ts`

**What to tell Copilot:**
> "A new API route `POST /api/v1/builder-studio/<path>` is needed. Add it to `extension/vscode/builder-studio/src/bridge/routes/<area>.ts` and mount it in `server.ts`."

---

### 4. New MCP capability

**Source:** `src/builder-studio/mcp/mcp-client.js`

**Extension target:** `src/services/mcp.ts`

**What to tell Copilot:**
> "The MCP client in convengine-ui added `<capability>`. Port it to `extension/vscode/builder-studio/src/services/mcp.ts`."

---

### 5. Scheduler / deployment changes

**Source:** convengine-ui scheduler logic (if any), or ce-builder-studio scheduler

**Extension target:** `src/engine/scheduler.ts`

**What to tell Copilot:**
> "The scheduler needs `<change>`. Update `extension/vscode/builder-studio/src/engine/scheduler.ts`."

---

### 6. LLM model mapping changes

**Source:** New Copilot model families (e.g. new Claude version, o3, etc.)

**Extension target:** `src/services/llm.ts` — `MODEL_FAMILY_MAP`

**What to tell Copilot:**
> "Add model `<model-name>` to the LLM service in `extension/vscode/builder-studio/src/services/llm.ts`."

---

## Extension-specific constraints (always preserve these)

| Constraint | Reason |
|---|---|
| No `require('better-sqlite3')` or other native `.node` modules | NODE_MODULE_VERSION mismatch with VS Code Electron |
| Persistence via `src/storage/db.ts` JSON file store only | Pure JS, no native compilation needed |
| LLM calls via `vscode.lm` (Copilot), not OpenAI/Anthropic directly | No API keys needed in extension context |
| Express bridge server binds to `127.0.0.1` on a random free port | Security: not exposed on network |
| Webview CSP must allow `connect-src` only to the bridge `127.0.0.1` host | VS Code webview policy |
| No Zustand in extension engine — pass state as plain objects | Zustand is browser/React only |
| All extension TypeScript compiles as `"module": "commonjs"` | VS Code extension host requirement |

---

## After any manual sync

Always run:

```bash
cd extension/vscode/builder-studio
npm run compile
```

Zero TypeScript errors = good to test. Then press **F5** in VS Code to launch Extension Development Host and test `@bs start`.

---

## Block types currently supported in graph-runner.ts

These are handled in `src/engine/graph-runner.ts`. If a new block is added to convengine-ui that isn't here, it will silently pass through as `null` output:

`starter` · `user_input` · `agent` · `function` · `condition` · `router_v2` · `api` · `response` · `loop` · `parallel` · `postgresql` · `mcp` · `smtp` · `variables` · `webhook_request` · `schedule` · `wait` · `table` · `if_else` · `if_elseif_else` · `switch` · `for_loop` · `for_each` · `save_to_files` · `show_preview` · `json_map` · `text_template` · `json_path` · `aggregate` · `filter` · `mapper` · `merge` · `sort` · `delay` · `crypto` · `ai_classifier` · `error_handler` · `redis` · `mongodb` · `slack` · `skill` · `sub_workflow` · `http_response`
