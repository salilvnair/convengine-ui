# Copilot Instructions

This repository uses a provider-based assistant renderer architecture.

## Chat renderer extension rules

- Core registry must stay generic.
- Do not hardcode business payload inference in core.
- Type/shape matching is provider-owned via each provider `match()`.

Core files:
- `src/components/chat/renderers/core/assistantRendererRegistry.jsx`
- `src/components/chat/renderers/providers/index.js`

## When adding a new assistant JSON renderer

1. Create a provider file in:
   - `src/components/chat/renderers/providers/`
   - Example: `FaqAnswer.jsx`
2. Export:
   - UI component (receives `payload`)
   - renderer config `{ key, priority, match, Component }`
3. Register provider in:
   - `src/components/chat/renderers/providers/index.js`
4. Keep styling consistent with existing chat classes:
   - `chat-bubble-agent`, `chat-text`, etc.
5. Prefer additive CSS in `src/index.css` and support both light/dark themes.

## FaqAnswer behavior (consumer-controlled)

Use either or both in provider `match()`:
- strict: `payload.type === "FaqAnswer"`
- shape fallback: payload has `answer` and related fields

Render guidance:
- `answer` as assistant bubble text
- top-right metadata badges (for example confidence, matched FAQ IDs)

## Safety

- Preserve existing chat UX and feedback buttons.
- Do not break default renderer fallback.
- Keep changes scoped and avoid unrelated refactors.
