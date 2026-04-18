# ConvEngine UI - AGENT Guide

This file is a detailed orientation guide for humans and LLM agents working inside the `convengine-ui` repository.

The purpose of this repo is not to be a full product frontend. It is a focused developer-facing UI for exercising the ConvEngine backend and making runtime behavior visible.

## 1. What This Repository Is

`convengine-ui` is a Vite + React single-page application that acts as a developer/operator console for the ConvEngine backend.

Its main responsibilities are:

- send conversation turns to the backend
- subscribe to live stream events
- surface live progress text from verbose events
- show audit timeline details
- expose cache refresh and cache analysis flows

This UI is intentionally narrow. It is a diagnostic and demo shell, not a full enterprise product.

## 2. Technology Stack

From `package.json`, the current stack is:

- Vite 7
- React 19
- React DOM 19
- Tailwind CSS 4 (via `@tailwindcss/vite`)
- ESLint 9
- UUID helper package
- Axios is present as a dependency, but the current API layer uses `fetch`, not Axios

## 3. Top-Level App Shape

The entire app currently centers around:

- `src/App.jsx`

That root composes three major surfaces:

1. Chat surface (`ChatPanel`)
2. Audit drawer (`AuditTimeline`)
3. Cache diagnostics page (`CacheAnalyzePage`)

The app toggles between:

- `chat`
- `cache`

It is a state-switched single-screen application, not a router-driven multipage app.

## 4. Repository Structure

Important files:

- `src/main.jsx`
- `src/App.jsx`
- `src/api/convengine.api.js`
- `src/components/ChatPanel.jsx`
- `src/components/AuditTimeline.jsx`
- `src/components/CacheAnalyzePage.jsx`
- `src/components/convengine/DbTable.jsx`
- `src/components/convengine/renderInlineTokens.jsx`
- `.github/copilot-instructions.md`
- `src/index.css`

## 5. Core UI Responsibilities by File

### `src/App.jsx`

This is the orchestration layer.

It owns:

- the `conversationId`
- theme mode
- active page state
- engine intent/state chips
- turn latency
- audit drawer open/close and resize
- cache refresh state
- live progress text from verbose events

It also:

- opens the live conversation stream
- refreshes audits when stream events arrive
- smooths progress text visibility

### `src/api/convengine.api.js`

This is the transport boundary to the backend.

Current base URLs:

- `http://localhost:8080/api/v1/conversation`
- `http://localhost:8080/api/v1/cache`
- websocket base `http://localhost:8080`

It handles:

- `sendMessage`
- `fetchAudits`
- `fetchAuditTrace`
- `refreshCaches`
- `analyzeCaches`
- SSE subscription
- STOMP subscription
- stream transport selection

### `src/components/ChatPanel.jsx`

This is the main interaction surface.

It handles:

- local message thread state
- input resizing
- sending `/message`
- parsing response payloads
- extracting `intent` and `state`
- timing each turn

### `src/components/AuditTimeline.jsx`

This is the runtime trace surface.

It handles:

- audit sorting
- stage-to-icon/color mapping
- readable stage naming
- expandable JSON payload visualization

This file contains the main stage visual mapping (`STAGE_META`) and should be updated when backend stages are added or renamed.

### `src/components/CacheAnalyzePage.jsx`

This visualizes `/api/v1/cache/analyze`.

It displays:

- cache provider metadata
- Spring cache properties
- cache infrastructure details
- static caches
- runtime caches
- warmup timings

## 6. How the UI Talks to the Backend

### Chat request flow

1. `ChatPanel` sends `POST /api/v1/conversation/message`.
2. The backend returns a payload.
3. `ChatPanel` renders assistant output.
4. `App` updates header status and audit refresh state.

### Live stream flow

1. `App` subscribes for the active `conversationId`.
2. Incoming events increment `auditVersion`.
3. Verbose payloads are inspected for user-facing progress text.
4. Progress text is shown while the agent is "thinking."
5. `ASSISTANT_OUTPUT` or `ENGINE_RETURN` clears it.

### Audit drawer flow

1. Opening the drawer triggers `fetchAudits(conversationId)`.
2. Audit rows are displayed in time order.
3. Clicking a row expands its payload.

### Cache operations

- refresh uses `POST /api/v1/cache/refresh`
- analysis uses `GET /api/v1/cache/analyze`

## 7. Important Runtime Contracts This UI Assumes

### Conversation ID

- one `crypto.randomUUID()` is generated per page load
- it is reused for the session until reload

### Stream events

The UI expects stage names such as:

- `CONNECTED`
- `USER_INPUT`
- `DIALOGUE_ACT_LLM_INPUT`
- `DIALOGUE_ACT_LLM_OUTPUT`
- `STEP_ENTER`
- `STEP_EXIT`
- `STEP_ERROR`
- `ASSISTANT_OUTPUT`
- `ENGINE_RETURN`
- `MCP_TOOL_CALL`
- `MCP_TOOL_RESULT`
- `MCP_TOOL_ERROR`
- `MCP_FINAL_ANSWER`
- `TOOL_ORCHESTRATION_REQUEST`
- `TOOL_ORCHESTRATION_RESULT`
- `TOOL_ORCHESTRATION_ERROR`
- `RULE_MATCH`
- `RULE_APPLIED`
- `RULE_NO_MATCH`
- `PENDING_ACTION_EXECUTED`
- `PENDING_ACTION_REJECTED`
- `PENDING_ACTION_FAILED`
- `CORRECTION_STEP_RETRY_REQUESTED`
- `POLICY_BLOCK`
- `VERBOSE`

### Verbose payload shape

`App.jsx` tries multiple locations:

- `payload.verbose.text`
- `payload.verbose.message`
- `payload.verbose.errorMessage`
- mirrored nested `payload.payload.verbose.*`

### Response payload shape

`ChatPanel.jsx` is tolerant:

- prefers `res.payload.value`
- then `res.payload`
- then stringifies whatever is returned

## 8. UX Intent of the Current Build

This UI is designed as an operator-grade shell:

- top nav with system status
- central chat workspace
- side audit drawer
- cache actions in the header
- theme toggle
- latency and intent/state chips

The priorities are:

- observability first
- debugging speed second
- aesthetics third

## 9. Theme and Styling

Theme behavior:

- chosen mode is stored in `localStorage` under `convengine_ui_theme`
- mode is written to `document.documentElement[data-theme]`

Styling is mainly driven by:

- `src/index.css`
- component class names

## 10. Safe Change Rules

When editing this repo:

- do not break backend endpoint assumptions without updating the API layer too
- do not remove tolerant parsing unless backend contracts are hardened
- do not spread backend payload-shape parsing across many components; centralize it
- do not turn the audit drawer into a raw log dump
- do not add router complexity unless the product truly needs multiple screens

## 11. Where to Make Common Changes

### Change backend wiring or transport logic

Edit:

- `src/api/convengine.api.js`

### Change chat UX

Edit:

- `src/components/ChatPanel.jsx`
- `src/App.jsx`

### Add support for new audit stage visuals

Edit:

- `src/components/AuditTimeline.jsx`

### Change cache diagnostics presentation

Edit:

- `src/components/CacheAnalyzePage.jsx`

### Change app shell layout

Edit:

- `src/App.jsx`
- `src/index.css`

## 12. Local Development Commands

Primary commands:

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run preview`

Normal local flow:

1. Run the ConvEngine backend on `localhost:8080`.
2. Run `npm run dev`.
3. Use the chat UI against the backend.
4. Open the audit drawer.
5. Use refresh/analyze buttons to test cache behavior.

## 13. Relationship to Other Repositories

This repo depends on:

- `convengine` for actual runtime behavior
- `convengine-docs` for architecture/reference documentation

The intended ecosystem relationship is:

- `convengine` defines runtime contracts
- `convengine-ui` visualizes them
- `convengine-docs` explains them

## 14. Best First Files to Read

1. `src/App.jsx`
2. `src/api/convengine.api.js`
3. `src/components/ChatPanel.jsx`
4. `src/components/AuditTimeline.jsx`
5. `src/components/CacheAnalyzePage.jsx`
6. `src/index.css`

## 15. One-Sentence Operating Rule

This repo is a focused frontend shell for making ConvEngine observable in real time; optimize for clarity of backend behavior, not for generic chat-app abstractions.
