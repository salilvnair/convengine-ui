import { create } from "zustand";

// Ported from Sim Studio's apps/sim/stores/workflows/workflow/store.ts
// State shape adapted: Sim's `blocks` (workflow DAG) become ConvEngine blocks that
// each map 1:1 to a row in a ce_* table. `subBlocks` hold the column values.

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ce_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function buildDefaultSubBlocks(blockConfig) {
  const subBlocks = {};
  for (const def of blockConfig.subBlocks || []) {
    subBlocks[def.id] = {
      id: def.id,
      type: def.type,
      value: def.defaultValue ?? null,
    };
  }
  return subBlocks;
}

export const useCeBuilderStore = create((set, get) => ({
  blocks: {},
  edges: [],
  selectedBlockId: null,
  dirty: false,

  addBlock: (blockConfig, position) => {
    const id = generateId();
    const block = {
      id,
      type: blockConfig.type,
      name: blockConfig.name,
      position: { x: position?.x ?? 0, y: position?.y ?? 0 },
      enabled: true,
      horizontalHandles: true,
      subBlocks: buildDefaultSubBlocks(blockConfig),
    };
    set((s) => ({
      blocks: { ...s.blocks, [id]: block },
      selectedBlockId: id,
      dirty: true,
    }));
    return id;
  },

  removeBlock: (id) =>
    set((s) => {
      if (!s.blocks[id]) return {};
      const nextBlocks = { ...s.blocks };
      delete nextBlocks[id];
      return {
        blocks: nextBlocks,
        edges: s.edges.filter((e) => e.source !== id && e.target !== id),
        selectedBlockId: s.selectedBlockId === id ? null : s.selectedBlockId,
        dirty: true,
      };
    }),

  updateBlockPosition: (id, position) =>
    set((s) => {
      const block = s.blocks[id];
      if (!block) return {};
      return {
        blocks: { ...s.blocks, [id]: { ...block, position } },
        dirty: true,
      };
    }),

  updateBlockName: (id, name) =>
    set((s) => {
      const block = s.blocks[id];
      if (!block) return {};
      return {
        blocks: { ...s.blocks, [id]: { ...block, name } },
        dirty: true,
      };
    }),

  setBlockEnabled: (id, enabled) =>
    set((s) => {
      const block = s.blocks[id];
      if (!block) return {};
      return {
        blocks: { ...s.blocks, [id]: { ...block, enabled } },
        dirty: true,
      };
    }),

  updateSubBlockValue: (blockId, subBlockId, value) =>
    set((s) => {
      const block = s.blocks[blockId];
      if (!block) return {};
      const existing = block.subBlocks[subBlockId] || { id: subBlockId };
      return {
        blocks: {
          ...s.blocks,
          [blockId]: {
            ...block,
            subBlocks: {
              ...block.subBlocks,
              [subBlockId]: { ...existing, value },
            },
          },
        },
        dirty: true,
      };
    }),

  addEdge: (edge) =>
    set((s) => {
      const id = edge.id || generateId();
      const exists = s.edges.some(
        (e) =>
          e.source === edge.source &&
          e.target === edge.target &&
          (e.sourceHandle ?? null) === (edge.sourceHandle ?? null) &&
          (e.targetHandle ?? null) === (edge.targetHandle ?? null)
      );
      if (exists) return {};
      return { edges: [...s.edges, { ...edge, id }], dirty: true };
    }),

  removeEdge: (edgeId) =>
    set((s) => ({
      edges: s.edges.filter((e) => e.id !== edgeId),
      dirty: true,
    })),

  setSelectedBlock: (id) => set({ selectedBlockId: id }),

  clear: () =>
    set({ blocks: {}, edges: [], selectedBlockId: null, dirty: false }),

  // Replace the canvas with rows loaded from the backend. `payload` shape:
  //   { groups: [ { type: 'intent', rows: [{ ...columns }] }, ... ] }
  // Rows are laid out left-to-right by block type so the canvas isn't a pile.
  loadFromPayload: (payload, registry) =>
    set(() => {
      const blocks = {};
      const colWidth = 320;
      const rowGap = 40;
      const baseY = 60;
      // Card height ≈ header (~60) + one row per subBlock (~36) + padding (~24).
      // Computed per block type so 10-field cards (Rule/Response) don't overlap
      // and 5-field cards (MCP Tool) don't leave a crater.
      const headerPx = 60;
      const rowPx = 36;
      const padPx = 24;
      let colIdx = 0;

      for (const group of payload.groups || []) {
        const config = registry[group.type];
        if (!config) continue;
        const x = 60 + colIdx * colWidth;
        let y = baseY;
        const fieldCount = config.subBlocks?.length ?? 0;
        const cardHeight = headerPx + fieldCount * rowPx + padPx;
        for (const row of group.rows || []) {
          const id = row[config.primaryKey] != null
            ? `${config.type}:${row[config.primaryKey]}`
            : generateId();
          const subBlocks = {};
          for (const def of config.subBlocks) {
            const raw = row[def.id];
            subBlocks[def.id] = {
              id: def.id,
              type: def.type,
              value: raw === undefined ? def.defaultValue ?? null : raw,
            };
          }
          const displayNameField = row.display_name || row.intent_code || row.code || row.entity_name || row.relationship_name || row[config.primaryKey];
          blocks[id] = {
            id,
            type: config.type,
            name: `${config.name}${displayNameField ? ` · ${displayNameField}` : ""}`,
            position: { x, y },
            enabled: row.enabled !== false,
            horizontalHandles: true,
            subBlocks,
            persistedKey: row[config.primaryKey] ?? null,
          };
          y += cardHeight + rowGap;
        }
        colIdx += 1;
      }

      // Auto-connect: every block that carries an intent_code links back to the
      // ce_intent hub for that intent. The edge label surfaces the state_code
      // so the (intent, state) relationship the backend cares about is visible
      // at a glance. Blocks without an intent_code (policy, ce_semantic_*) are
      // left disconnected — they are global, not per-intent.
      const edges = [];
      const intentIds = new Map(); // intent_code → block id
      for (const b of Object.values(blocks)) {
        if (b.type === "intent") {
          const code = b.subBlocks.intent_code?.value;
          if (code) intentIds.set(code, b.id);
        }
      }
      for (const b of Object.values(blocks)) {
        if (b.type === "intent") continue;
        const code = b.subBlocks.intent_code?.value;
        if (!code) continue;
        const source = intentIds.get(code);
        if (!source) continue;
        const state = b.subBlocks.state_code?.value;
        edges.push({
          id: `e:${source}->${b.id}`,
          source,
          target: b.id,
          sourceHandle: null,
          targetHandle: null,
          label: state ? String(state) : undefined,
        });
      }

      return { blocks, edges, selectedBlockId: null, dirty: false };
    }),

  markClean: () => set({ dirty: false }),

  toJSON: () => {
    const s = get();
    return {
      blocks: Object.values(s.blocks).map((b) => ({
        id: b.id,
        type: b.type,
        name: b.name,
        position: b.position,
        enabled: b.enabled,
        subBlocks: Object.fromEntries(
          Object.entries(b.subBlocks).map(([k, v]) => [k, v.value])
        ),
      })),
      edges: s.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
      })),
    };
  },
}));
