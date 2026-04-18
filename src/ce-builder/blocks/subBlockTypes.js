// SubBlock field type enum — mirrors the shape Sim uses in blocks/types.ts,
// but trimmed to the primitives ConvEngine ce_* tables actually need.
export const SUB_BLOCK_TYPES = Object.freeze({
  SHORT_INPUT: "short-input",
  LONG_INPUT: "long-input",
  DROPDOWN: "dropdown",
  SWITCH: "switch",
  SLIDER: "slider",
  JSON: "json",
  TAGS: "tags",
});
