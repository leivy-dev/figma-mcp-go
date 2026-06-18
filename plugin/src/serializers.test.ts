import { describe, it, expect, beforeEach } from "bun:test";
import {
  isMixed,
  toHex,
  serializePaints,
  getBounds,
  deduplicateStyles,
  serializeVariableValue,
  serializeLineHeight,
  serializeLetterSpacing,
  serializeStyles,
  serializeText,
  serializeNode,
} from "./serializers";

// ── Figma global mock ─────────────────────────────────────────────────────────

let mockGetStyleByIdAsync: (id: string) => Promise<{ name: string } | null>;

beforeEach(() => {
  mockGetStyleByIdAsync = async (_id: string) => null;
  (globalThis as any).figma = {
    getStyleByIdAsync: (id: string) => mockGetStyleByIdAsync(id),
  };
});

// ── isMixed ──────────────────────────────────────────────────────────────────

describe("isMixed", () => {
  it("returns true for symbols", () => {
    expect(isMixed(Symbol())).toBe(true);
  });
  it("returns false for non-symbols", () => {
    expect(isMixed(14)).toBe(false);
    expect(isMixed("hello")).toBe(false);
    expect(isMixed(null)).toBe(false);
    expect(isMixed(undefined)).toBe(false);
  });
});

// ── toHex ────────────────────────────────────────────────────────────────────

describe("toHex", () => {
  it("converts full white", () => {
    expect(toHex({ r: 1, g: 1, b: 1 })).toBe("#ffffff");
  });
  it("converts full black", () => {
    expect(toHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
  });
  it("converts a mid-range color", () => {
    expect(toHex({ r: 1, g: 0, b: 0 })).toBe("#ff0000");
  });
  it("clamps values above 1", () => {
    expect(toHex({ r: 2, g: 0, b: 0 })).toBe("#ff0000");
  });
  it("clamps values below 0", () => {
    expect(toHex({ r: -1, g: 0, b: 0 })).toBe("#000000");
  });
  it("rounds fractional values", () => {
    // 0.5 * 255 = 127.5 → rounds to 128 = 0x80
    expect(toHex({ r: 0.5, g: 0.5, b: 0.5 })).toBe("#808080");
  });
});

// ── serializePaints ───────────────────────────────────────────────────────────

describe("serializePaints", () => {
  it("returns 'mixed' for symbol input", () => {
    expect(serializePaints(Symbol())).toBe("mixed");
  });
  it("returns undefined for null/non-array", () => {
    expect(serializePaints(null)).toBeUndefined();
    expect(serializePaints("red")).toBeUndefined();
  });
  it("returns undefined for empty array", () => {
    expect(serializePaints([])).toBeUndefined();
  });
  it("serializes IMAGE paints with their fields", () => {
    const paints = [
      {
        type: "IMAGE",
        imageHash: "abc",
        scaleMode: "FILL",
        imageTransform: [
          [1, 0, 0],
          [0, 1, 0],
        ],
      },
    ];
    const result = serializePaints(paints) as any[];
    expect(result[0].type).toBe("IMAGE");
    expect(result[0].imageHash).toBe("abc");
    expect(result[0].scaleMode).toBe("FILL");
  });
  it("serializes GRADIENT paints with stops", () => {
    const paints = [
      {
        type: "GRADIENT_LINEAR",
        gradientTransform: [
          [1, 0, 0],
          [0, 1, 0],
        ],
        gradientStops: [
          { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
          { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
        ],
      },
    ];
    const result = serializePaints(paints) as any[];
    expect(result[0].type).toBe("GRADIENT_LINEAR");
    expect(result[0].gradientStops).toHaveLength(2);
    expect(result[0].gradientStops[0].color).toBe("#ff0000");
  });
  it("serializes a solid paint with opacity 1 as plain hex", () => {
    const paints = [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 1 }];
    expect(serializePaints(paints)).toEqual(["#ff0000"]);
  });
  it("appends alpha hex when opacity < 1", () => {
    // opacity 0.5 → Math.round(0.5 * 255) = 128 = 0x80
    const paints = [{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 0.5 }];
    const result = serializePaints(paints) as string[];
    expect(result[0]).toBe("#ff000080");
  });
  it("defaults opacity to 1 when not provided", () => {
    const paints = [{ type: "SOLID", color: { r: 0, g: 0, b: 1 } }];
    expect(serializePaints(paints)).toEqual(["#0000ff"]);
  });
  it("serializes multiple solid paints", () => {
    const paints = [
      { type: "SOLID", color: { r: 1, g: 0, b: 0 } },
      { type: "SOLID", color: { r: 0, g: 1, b: 0 } },
    ];
    expect(serializePaints(paints)).toEqual(["#ff0000", "#00ff00"]);
  });
});

// ── getBounds ─────────────────────────────────────────────────────────────────

describe("getBounds", () => {
  it("returns bounds for a node with x/y/width/height", () => {
    expect(getBounds({ x: 10, y: 20, width: 100, height: 50 })).toEqual({
      x: 10, y: 20, width: 100, height: 50,
    });
  });
  it("rounds floating point values to 2 decimal places", () => {
    const bounds = getBounds({ x: 10.999, y: 0, width: 99.999, height: 50 });
    expect(bounds?.x).toBe(11);
    expect(bounds?.width).toBe(100);
  });
  it("returns undefined when coordinates are missing", () => {
    expect(getBounds({ name: "page" })).toBeUndefined();
    expect(getBounds({ x: 0, y: 0 })).toBeUndefined();
  });

  it("emits offsetRight/offsetBottom from parent dimensions", () => {
    const node = {
      x: 271,
      y: 0,
      width: 345,
      height: 393,
      parent: { width: 700, height: 500 },
    };
    const b = getBounds(node) as any;
    expect(b.offsetLeft).toBe(271);
    expect(b.offsetRight).toBe(700 - 271 - 345); // 84
    expect(b.offsetTop).toBe(0);
    expect(b.offsetBottom).toBe(500 - 0 - 393); // 107
    expect(b.parentWidth).toBe(700);
    expect(b.parentHeight).toBe(500);
  });

  it("omits parent-relative offsets when no parent is attached", () => {
    const b = getBounds({ x: 0, y: 0, width: 100, height: 50 }) as any;
    expect(b.offsetRight).toBeUndefined();
    expect(b.parentWidth).toBeUndefined();
  });
});

// ── serializeLineHeight ───────────────────────────────────────────────────────

describe("serializeLineHeight", () => {
  it("returns 'mixed' for symbol", () => {
    expect(serializeLineHeight(Symbol())).toBe("mixed");
  });
  it("returns undefined for AUTO unit", () => {
    expect(serializeLineHeight({ unit: "AUTO" })).toBeUndefined();
  });
  it("returns undefined for null/falsy", () => {
    expect(serializeLineHeight(null)).toBeUndefined();
    expect(serializeLineHeight(undefined)).toBeUndefined();
  });
  it("returns value and unit for PIXELS", () => {
    expect(serializeLineHeight({ value: 24, unit: "PIXELS" })).toEqual({ value: 24, unit: "PIXELS" });
  });
  it("returns value and unit for PERCENT", () => {
    expect(serializeLineHeight({ value: 150, unit: "PERCENT" })).toEqual({ value: 150, unit: "PERCENT" });
  });
});

// ── serializeLetterSpacing ────────────────────────────────────────────────────

describe("serializeLetterSpacing", () => {
  it("returns 'mixed' for symbol", () => {
    expect(serializeLetterSpacing(Symbol())).toBe("mixed");
  });
  it("returns undefined when value is 0", () => {
    expect(serializeLetterSpacing({ value: 0, unit: "PIXELS" })).toBeUndefined();
  });
  it("returns undefined for null/falsy", () => {
    expect(serializeLetterSpacing(null)).toBeUndefined();
  });
  it("returns value and unit for non-zero spacing", () => {
    expect(serializeLetterSpacing({ value: 1.5, unit: "PIXELS" })).toEqual({ value: 1.5, unit: "PIXELS" });
  });
});

// ── deduplicateStyles ─────────────────────────────────────────────────────────

describe("deduplicateStyles", () => {
  it("returns original tree and undefined globalVars when nothing is repeated", () => {
    const tree = {
      children: [
        { styles: { fills: ["#ff0000"] } },
        { styles: { fills: ["#00ff00"] } },
      ],
    };
    const { tree: result, globalVars } = deduplicateStyles(tree);
    expect(globalVars).toBeUndefined();
    expect(result).toBe(tree);
  });

  it("deduplicates fills that appear more than once", () => {
    const sharedFill = ["#ff0000"];
    const tree = {
      children: [
        { styles: { fills: sharedFill } },
        { styles: { fills: sharedFill } },
      ],
    };
    const { tree: result, globalVars } = deduplicateStyles(tree);
    expect(globalVars).toBeDefined();
    const refs = Object.keys(globalVars!.styles);
    expect(refs.length).toBe(1);
    // Both nodes should now reference the short key instead of the array
    const children = (result as any).children;
    expect(typeof children[0].styles.fills).toBe("string");
    expect(children[0].styles.fills).toBe(children[1].styles.fills);
  });

  it("deduplicates strokes that appear more than once", () => {
    const sharedStroke = ["#0000ff"];
    const tree = {
      children: [
        { styles: { strokes: sharedStroke } },
        { styles: { strokes: sharedStroke } },
      ],
    };
    const { globalVars } = deduplicateStyles(tree);
    expect(globalVars).toBeDefined();
  });

  it("preserves unique fills as-is", () => {
    const tree = {
      children: [
        { styles: { fills: ["#ff0000"] } },
        { styles: { fills: ["#00ff00"] } },
        { styles: { fills: ["#ff0000"] } },
        { styles: { fills: ["#00ff00"] } },
      ],
    };
    const { globalVars } = deduplicateStyles(tree);
    // Both colors appear twice so both should be deduped
    expect(Object.keys(globalVars!.styles).length).toBe(2);
  });

  it("handles empty tree without errors", () => {
    const { tree, globalVars } = deduplicateStyles({});
    expect(globalVars).toBeUndefined();
    expect(tree).toEqual({});
  });
});

// ── serializeVariableValue ────────────────────────────────────────────────────

describe("serializeVariableValue", () => {
  it("passes through primitives unchanged", () => {
    expect(serializeVariableValue(42)).toBe(42);
    expect(serializeVariableValue("hello")).toBe("hello");
    expect(serializeVariableValue(true)).toBe(true);
    expect(serializeVariableValue(null)).toBe(null);
  });

  it("serializes VARIABLE_ALIAS objects", () => {
    const val = { type: "VARIABLE_ALIAS", id: "abc123", extra: "ignored" };
    expect(serializeVariableValue(val)).toEqual({ type: "VARIABLE_ALIAS", id: "abc123" });
  });

  it("serializes color objects to COLOR type", () => {
    const val = { r: 1, g: 0, b: 0, a: 1 };
    expect(serializeVariableValue(val)).toEqual({ type: "COLOR", r: 1, g: 0, b: 0, a: 1 });
  });

  it("defaults alpha to 1 when missing from color", () => {
    const val = { r: 0, g: 1, b: 0 };
    expect(serializeVariableValue(val)).toEqual({ type: "COLOR", r: 0, g: 1, b: 0, a: 1 });
  });

  it("passes through unknown objects unchanged", () => {
    const val = { foo: "bar" };
    expect(serializeVariableValue(val)).toEqual({ foo: "bar" });
  });
});

// ── serializeStyles ───────────────────────────────────────────────────────────

describe("serializeStyles", () => {
  it("returns empty object for node with no relevant properties", async () => {
    const result = await serializeStyles({ id: "1", name: "box" });
    expect(result).toEqual({});
  });

  it("includes fills when fills is a solid paint array", async () => {
    const node = { fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }] };
    const result = await serializeStyles(node);
    expect(result.fills).toEqual(["#ff0000"]);
  });

  it("includes fillStyle name when fillStyleId resolves to a style", async () => {
    mockGetStyleByIdAsync = async (id) => (id === "style-1" ? { name: "Red" } : null);
    const node = {
      fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
      fillStyleId: "style-1",
    };
    const result = await serializeStyles(node);
    expect(result.fillStyle).toBe("Red");
    expect(result.fills).toEqual(["#ff0000"]);
  });

  it("skips fillStyle when fillStyleId resolves to null", async () => {
    const node = {
      fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
      fillStyleId: "missing",
    };
    const result = await serializeStyles(node);
    expect(result.fillStyle).toBeUndefined();
    expect(result.fills).toEqual(["#ff0000"]);
  });

  it("skips fillStyle when fillStyleId is not a string", async () => {
    const node = {
      fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 1 } }],
      fillStyleId: Symbol(),
    };
    const result = await serializeStyles(node);
    expect(result.fillStyle).toBeUndefined();
  });

  it("includes strokes and strokeStyle", async () => {
    mockGetStyleByIdAsync = async (id) => (id === "s-1" ? { name: "Border" } : null);
    const node = {
      strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
      strokeStyleId: "s-1",
    };
    const result = await serializeStyles(node);
    expect(result.strokeStyle).toBe("Border");
    expect(result.strokes).toEqual(["#000000"]);
  });

  it("omits cornerRadius when value is 0", async () => {
    const result = await serializeStyles({ cornerRadius: 0 });
    expect(result.cornerRadius).toBeUndefined();
  });

  it("includes cornerRadius when non-zero", async () => {
    const result = await serializeStyles({ cornerRadius: 8 });
    expect(result.cornerRadius).toBe(8);
  });

  it("sets cornerRadius to 'mixed' for symbol", async () => {
    const result = await serializeStyles({ cornerRadius: Symbol() });
    expect(result.cornerRadius).toBe("mixed");
  });

  it("includes padding when paddingLeft is present", async () => {
    const node = { paddingLeft: 10, paddingRight: 20, paddingTop: 5, paddingBottom: 15 };
    const result = await serializeStyles(node);
    expect(result.padding).toEqual({ top: 5, right: 20, bottom: 15, left: 10 });
  });
});

// ── serializeText ─────────────────────────────────────────────────────────────

describe("serializeText", () => {
  const makeBase = () => ({ id: "t1", name: "Text", type: "TEXT", bounds: undefined, styles: {} });

  it("handles mixed font name", async () => {
    const node = {
      fontName: Symbol(),
      fontSize: 16,
      fontWeight: 400,
      textDecoration: "NONE",
      lineHeight: { unit: "AUTO" },
      letterSpacing: { value: 0, unit: "PIXELS" },
      textAlignHorizontal: "LEFT",
      characters: "hello",
    };
    const result = await serializeText(node, makeBase());
    expect(result.styles.fontFamily).toBe("mixed");
    expect(result.styles.fontStyle).toBe("mixed");
  });

  it("handles regular font name", async () => {
    const node = {
      fontName: { family: "Inter", style: "Regular" },
      fontSize: 14,
      fontWeight: 400,
      textDecoration: "NONE",
      lineHeight: { unit: "AUTO" },
      letterSpacing: { value: 0, unit: "PIXELS" },
      textAlignHorizontal: "LEFT",
      characters: "hello",
    };
    const result = await serializeText(node, makeBase());
    expect(result.styles.fontFamily).toBe("Inter");
    expect(result.styles.fontStyle).toBe("Regular");
    expect(result.characters).toBe("hello");
  });

  it("includes textStyle when textStyleId resolves", async () => {
    mockGetStyleByIdAsync = async (id) => (id === "ts-1" ? { name: "Heading 1" } : null);
    const node = {
      fontName: { family: "Inter", style: "Bold" },
      fontSize: 32,
      fontWeight: 700,
      textDecoration: "NONE",
      lineHeight: { unit: "AUTO" },
      letterSpacing: { value: 0, unit: "PIXELS" },
      textAlignHorizontal: "LEFT",
      textStyleId: "ts-1",
      characters: "Title",
    };
    const result = await serializeText(node, makeBase());
    expect(result.styles.textStyle).toBe("Heading 1");
  });

  it("omits textStyle when textStyleId is not a string", async () => {
    const node = {
      fontName: { family: "Inter", style: "Regular" },
      fontSize: 14,
      fontWeight: 400,
      textDecoration: "NONE",
      lineHeight: { unit: "AUTO" },
      letterSpacing: { value: 0, unit: "PIXELS" },
      textAlignHorizontal: "LEFT",
      textStyleId: Symbol(),
      characters: "hi",
    };
    const result = await serializeText(node, makeBase());
    expect(result.styles.textStyle).toBeUndefined();
  });

  it("serializes mixed text properties", async () => {
    const node = {
      fontName: { family: "Inter", style: "Regular" },
      fontSize: Symbol(),
      fontWeight: Symbol(),
      textDecoration: Symbol(),
      lineHeight: { unit: "AUTO" },
      letterSpacing: { value: 0, unit: "PIXELS" },
      textAlignHorizontal: Symbol(),
      characters: "mixed",
    };
    const result = await serializeText(node, makeBase());
    expect(result.styles.fontSize).toBe("mixed");
    expect(result.styles.fontWeight).toBe("mixed");
    expect(result.styles.textDecoration).toBe("mixed");
    expect(result.styles.textAlignHorizontal).toBe("mixed");
  });

  it("omits textDecoration when value is NONE", async () => {
    const node = {
      fontName: { family: "Inter", style: "Regular" },
      fontSize: 14,
      fontWeight: 400,
      textDecoration: "NONE",
      lineHeight: { unit: "AUTO" },
      letterSpacing: { value: 0, unit: "PIXELS" },
      textAlignHorizontal: "LEFT",
      characters: "plain",
    };
    const result = await serializeText(node, makeBase());
    expect(result.styles.textDecoration).toBeUndefined();
  });

  it("includes textDecoration when not NONE", async () => {
    const node = {
      fontName: { family: "Inter", style: "Regular" },
      fontSize: 14,
      fontWeight: 400,
      textDecoration: "UNDERLINE",
      lineHeight: { unit: "AUTO" },
      letterSpacing: { value: 0, unit: "PIXELS" },
      textAlignHorizontal: "LEFT",
      characters: "underlined",
    };
    const result = await serializeText(node, makeBase());
    expect(result.styles.textDecoration).toBe("UNDERLINE");
  });
});

// ── serializeNode ─────────────────────────────────────────────────────────────

describe("serializeNode", () => {
  it("serializes a plain node with bounds", async () => {
    const node = { id: "1:1", name: "Box", type: "RECTANGLE", x: 0, y: 0, width: 100, height: 50 };
    const result = await serializeNode(node);
    expect(result.id).toBe("1:1");
    expect(result.type).toBe("RECTANGLE");
    expect(result.bounds).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  it("serializes a TEXT node", async () => {
    const node = {
      id: "1:2",
      name: "Label",
      type: "TEXT",
      x: 0, y: 0, width: 50, height: 20,
      fontName: { family: "Inter", style: "Regular" },
      fontSize: 14,
      fontWeight: 400,
      textDecoration: "NONE",
      lineHeight: { unit: "AUTO" },
      letterSpacing: { value: 0, unit: "PIXELS" },
      textAlignHorizontal: "LEFT",
      characters: "Hello",
    };
    const result = await serializeNode(node);
    expect(result.type).toBe("TEXT");
    expect(result.characters).toBe("Hello");
  });

  it("recursively serializes children", async () => {
    const node = {
      id: "1:3",
      name: "Frame",
      type: "FRAME",
      x: 0, y: 0, width: 200, height: 200,
      children: [
        { id: "1:4", name: "Child", type: "RECTANGLE", x: 10, y: 10, width: 50, height: 50 },
      ],
    };
    const result = await serializeNode(node);
    expect(result.children).toHaveLength(1);
    expect(result.children[0].id).toBe("1:4");
  });
});

// ── exhaustive field coverage ─────────────────────────────────────────────────

describe("serializeStyles — full Figma field coverage (fork-only)", () => {
  const baseFrame = {
    id: "f1",
    name: "Frame",
    type: "FRAME",
    fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
    strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
    strokeWeight: 2,
    strokeAlign: "INSIDE",
    strokeCap: "ROUND",
    strokeJoin: "BEVEL",
    strokeMiterLimit: 8,
    dashPattern: [4, 2],
    strokeTopWeight: 1,
    strokeRightWeight: 2,
    strokeBottomWeight: 3,
    strokeLeftWeight: 4,
    effects: [
      { type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 4 }, radius: 8, spread: 0, showShadowBehindNode: false },
      { type: "LAYER_BLUR", radius: 4 },
    ],
    cornerRadius: 8,
    topLeftRadius: 4,
    topRightRadius: 8,
    bottomLeftRadius: 12,
    bottomRightRadius: 16,
    cornerSmoothing: 0.5,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 8,
    paddingBottom: 8,
    layoutMode: "HORIZONTAL",
    itemSpacing: 12,
    counterAxisSpacing: 8,
    layoutWrap: "WRAP",
    primaryAxisAlignItems: "CENTER",
    counterAxisAlignItems: "CENTER",
    counterAxisAlignContent: "SPACE_BETWEEN",
    primaryAxisSizingMode: "AUTO",
    counterAxisSizingMode: "FIXED",
    itemReverseZIndex: true,
    strokesIncludedInLayout: true,
    layoutAlign: "STRETCH",
    layoutGrow: 1,
    layoutPositioning: "ABSOLUTE",
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    minWidth: 100,
    maxWidth: 500,
    minHeight: 50,
    maxHeight: 200,
    opacity: 0.75,
    visible: false,
    blendMode: "MULTIPLY",
    rotation: 12.5,
    clipsContent: true,
    isMask: true,
    maskType: "ALPHA",
    constraints: { horizontal: "STRETCH", vertical: "CENTER" },
    absoluteBoundingBox: { x: -100, y: -200, width: 300, height: 400 },
    absoluteRenderBounds: { x: -110, y: -210, width: 320, height: 420 },
    absoluteTransform: [[1, 0, -100], [0, 1, -200]],
    boundVariables: { fills: [{ id: "VariableID:x", type: "VARIABLE_ALIAS" }] },
    locked: true,
    exportSettings: [{ format: "PNG", suffix: "@2x" }],
    reactions: [{ trigger: { type: "ON_CLICK" }, action: { type: "NODE", navigation: "NAVIGATE" } }],
    annotations: [{ label: "spec", labelMarkdown: "**spec**" }],
    layoutGrids: [{ pattern: "COLUMNS", count: 12 }],
    guides: [{ axis: "X", offset: 100 }],
  };

  it("emits every documented FrameNode style", async () => {
    const styles = await serializeStyles(baseFrame);
    // Auto Layout
    expect(styles.layoutMode).toBe("HORIZONTAL");
    expect(styles.itemSpacing).toBe(12);
    expect(styles.counterAxisSpacing).toBe(8);
    expect(styles.layoutWrap).toBe("WRAP");
    expect(styles.primaryAxisAlignItems).toBe("CENTER");
    expect(styles.counterAxisAlignItems).toBe("CENTER");
    expect(styles.counterAxisAlignContent).toBe("SPACE_BETWEEN");
    expect(styles.primaryAxisSizingMode).toBe("AUTO");
    expect(styles.counterAxisSizingMode).toBe("FIXED");
    expect(styles.itemReverseZIndex).toBe(true);
    expect(styles.strokesIncludedInLayout).toBe(true);
    // Child layout
    expect(styles.layoutAlign).toBe("STRETCH");
    expect(styles.layoutGrow).toBe(1);
    expect(styles.layoutPositioning).toBe("ABSOLUTE");
    expect(styles.layoutSizingHorizontal).toBe("FILL");
    expect(styles.layoutSizingVertical).toBe("HUG");
    expect(styles.minWidth).toBe(100);
    expect(styles.maxWidth).toBe(500);
    expect(styles.minHeight).toBe(50);
    expect(styles.maxHeight).toBe(200);
    // Stroke detail
    expect(styles.strokeWeight).toBe(2);
    expect(styles.strokeAlign).toBe("INSIDE");
    expect(styles.strokeCap).toBe("ROUND");
    expect(styles.strokeJoin).toBe("BEVEL");
    expect(styles.strokeMiterLimit).toBe(8);
    expect(styles.dashPattern).toEqual([4, 2]);
    expect(styles.strokeWeightPerSide).toEqual({ top: 1, right: 2, bottom: 3, left: 4 });
    // Effects
    expect(Array.isArray(styles.effects)).toBe(true);
    expect(styles.effects).toHaveLength(2);
    expect(styles.effects[0].type).toBe("DROP_SHADOW");
    expect(styles.effects[0].color).toBe("#000000");
    expect(styles.effects[0].offset).toEqual({ x: 0, y: 4 });
    expect(styles.effects[0].radius).toBe(8);
    expect(styles.effects[1].type).toBe("LAYER_BLUR");
    // Corners
    expect(styles.cornerRadius).toBe(8);
    expect(styles.cornerRadiusPerCorner).toEqual({
      topLeft: 4, topRight: 8, bottomRight: 16, bottomLeft: 12,
    });
    expect(styles.cornerSmoothing).toBe(0.5);
    // Padding
    expect(styles.padding).toEqual({ top: 8, right: 16, bottom: 8, left: 16 });
    // Visuals
    expect(styles.opacity).toBe(0.75);
    expect(styles.visible).toBe(false);
    expect(styles.blendMode).toBe("MULTIPLY");
    expect(styles.rotation).toBe(12.5);
    expect(styles.clipsContent).toBe(true);
    expect(styles.isMask).toBe(true);
    expect(styles.maskType).toBe("ALPHA");
    // Constraints + absolute
    expect(styles.constraints).toEqual({ horizontal: "STRETCH", vertical: "CENTER" });
    expect(styles.absoluteBoundingBox.width).toBe(300);
    expect(styles.absoluteRenderBounds.width).toBe(320);
    expect(styles.absoluteTransform).toBeDefined();
    // Variables
    expect(styles.boundVariables).toBeDefined();
    expect(styles.boundVariables.fills[0].id).toBe("VariableID:x");
    // Base metadata
    expect(styles.locked).toBe(true);
    expect(styles.exportSettings).toHaveLength(1);
    expect(styles.reactions).toHaveLength(1);
    expect(styles.annotations).toHaveLength(1);
    // Grids
    expect(styles.layoutGrids).toHaveLength(1);
    expect(styles.guides).toHaveLength(1);
  });

  it("emits component metadata when type=COMPONENT", async () => {
    const node = {
      type: "COMPONENT",
      description: "btn",
      descriptionMarkdown: "**btn**",
      documentationLinks: [{ uri: "https://example.com" }],
      componentPropertyDefinitions: { Variant: { type: "VARIANT", defaultValue: "Primary" } },
      variantProperties: { Variant: "Primary" },
    };
    const styles = await serializeStyles(node);
    expect(styles.description).toBe("btn");
    expect(styles.descriptionMarkdown).toBe("**btn**");
    expect(styles.documentationLinks).toHaveLength(1);
    expect(styles.componentPropertyDefinitions).toBeDefined();
    expect(styles.variantProperties).toEqual({ Variant: "Primary" });
  });

  it("emits instance metadata when type=INSTANCE", async () => {
    const node = {
      type: "INSTANCE",
      componentProperties: { Label: { value: "Submit", type: "TEXT" } },
      isExposedInstance: true,
      scaleFactor: 2,
      overrides: [{ id: "1:1", overriddenFields: ["characters"] }],
    };
    const styles = await serializeStyles(node);
    expect(styles.componentProperties).toEqual({ Label: "Submit" });
    expect(styles.isExposedInstance).toBe(true);
    expect(styles.scaleFactor).toBe(2);
    expect(styles.overrides).toHaveLength(1);
  });

  it("emits vector/star/polygon geometry", async () => {
    const vector = await serializeStyles({
      type: "VECTOR",
      vectorPaths: [{ windingRule: "EVENODD", data: "M0 0 L10 10" }],
      handleMirroring: "ANGLE",
    });
    expect(vector.vectorPaths).toHaveLength(1);
    expect(vector.handleMirroring).toBe("ANGLE");

    const star = await serializeStyles({ type: "STAR", pointCount: 6, innerRadius: 0.3 });
    expect(star.pointCount).toBe(6);
    expect(star.innerRadius).toBe(0.3);
  });

  it("emits arcData on ellipses only when non-default", async () => {
    const arc = await serializeStyles({
      type: "ELLIPSE",
      arcData: { startingAngle: 0, endingAngle: Math.PI, innerRadius: 0.25 },
    });
    expect(arc.arcData).toBeDefined();
    const noArc = await serializeStyles({
      type: "ELLIPSE",
      arcData: { startingAngle: 0, endingAngle: Math.PI * 2, innerRadius: 0 },
    });
    expect(noArc.arcData).toBeUndefined();
  });
});

describe("serializeText — full TextNode coverage (fork-only)", () => {
  it("emits textDecoration detail + hyperlink + paragraph + leadingTrim + openTypeFeatures", async () => {
    const node = {
      fontName: { family: "Inter", style: "Bold" },
      fontSize: 16,
      fontWeight: 700,
      textDecoration: "UNDERLINE",
      textDecorationStyle: "WAVY",
      textDecorationOffset: { value: 2, unit: "PIXELS" },
      textDecorationThickness: { value: 1, unit: "PIXELS" },
      textDecorationColor: { value: { r: 1, g: 0, b: 0 } },
      textDecorationSkipInk: true,
      textCase: "UPPER",
      lineHeight: { value: 24, unit: "PIXELS" },
      letterSpacing: { value: 2, unit: "PERCENT" },
      paragraphSpacing: 12,
      paragraphIndent: 8,
      listSpacing: 4,
      leadingTrim: "CAP_HEIGHT",
      hangingPunctuation: true,
      hangingList: true,
      textAlignHorizontal: "CENTER",
      textAlignVertical: "CENTER",
      textAutoResize: "HEIGHT",
      textTruncation: "ENDING",
      maxLines: 3,
      openTypeFeatures: { KERN: false, ss01: true },
      hyperlink: { type: "URL", value: "https://example.com" },
      hasMissingFont: false,
      autoRename: true,
      characters: "hi",
    };
    const result = await serializeText(node, { id: "t", name: "t", type: "TEXT", styles: {} });
    const s = result.styles;
    expect(s.textDecoration).toBe("UNDERLINE");
    expect(s.textDecorationStyle).toBe("WAVY");
    expect(s.textDecorationOffset).toEqual({ value: 2, unit: "PIXELS" });
    expect(s.textDecorationThickness).toEqual({ value: 1, unit: "PIXELS" });
    expect(s.textDecorationColor).toBeDefined();
    expect(s.textDecorationSkipInk).toBe(true);
    expect(s.textCase).toBe("UPPER");
    expect(s.lineHeight).toEqual({ value: 24, unit: "PIXELS" });
    expect(s.letterSpacing).toEqual({ value: 2, unit: "PERCENT" });
    expect(s.paragraphSpacing).toBe(12);
    expect(s.paragraphIndent).toBe(8);
    expect(s.listSpacing).toBe(4);
    expect(s.leadingTrim).toBe("CAP_HEIGHT");
    expect(s.hangingPunctuation).toBe(true);
    expect(s.hangingList).toBe(true);
    expect(s.textAlignHorizontal).toBe("CENTER");
    expect(s.textAlignVertical).toBe("CENTER");
    expect(s.textAutoResize).toBe("HEIGHT");
    expect(s.textTruncation).toBe("ENDING");
    expect(s.maxLines).toBe(3);
    expect(s.openTypeFeatures).toEqual({ KERN: false, ss01: true });
    expect(s.hyperlink).toEqual({ type: "URL", value: "https://example.com" });
    expect(s.autoRename).toBe(true);
    expect(s.hasMissingFont).toBeUndefined(); // false → omitted
  });

  it("returns lineHeight={unit:'AUTO'} explicitly (not undefined)", async () => {
    const node = {
      fontName: { family: "Inter", style: "Regular" },
      fontSize: 14,
      fontWeight: 400,
      textDecoration: "NONE",
      lineHeight: { unit: "AUTO" },
      letterSpacing: { value: 0, unit: "PIXELS" },
      textAlignHorizontal: "LEFT",
      characters: "x",
    };
    const result = await serializeText(node, { id: "t", name: "t", type: "TEXT", styles: {} });
    expect(result.styles.lineHeight).toEqual({ unit: "AUTO" });
    expect(result.styles.letterSpacing).toEqual({ value: 0, unit: "PIXELS" });
  });

  it("returns styleSegments via getStyledTextSegments mock", async () => {
    const node = {
      fontName: { family: "Inter", style: "Regular" },
      fontSize: 14,
      fontWeight: 400,
      textDecoration: "NONE",
      lineHeight: { unit: "AUTO" },
      letterSpacing: { value: 0, unit: "PIXELS" },
      textAlignHorizontal: "LEFT",
      characters: "ab",
      getStyledTextSegments: (_fields: string[]) => [
        {
          characters: "a",
          start: 0,
          end: 1,
          fontName: { family: "Inter", style: "Bold" },
          fontSize: 20,
          fontWeight: 700,
          lineHeight: { unit: "AUTO" },
          letterSpacing: { value: 0, unit: "PIXELS" },
          fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
          textDecoration: "UNDERLINE",
          textDecorationStyle: "DASHED",
          openTypeFeatures: { KERN: true },
          paragraphSpacing: 4,
          hyperlink: null,
        },
        {
          characters: "b",
          start: 1,
          end: 2,
          fontName: { family: "Inter", style: "Regular" },
          fontSize: 14,
          fontWeight: 400,
          lineHeight: { value: 24, unit: "PIXELS" },
          letterSpacing: { value: 2, unit: "PERCENT" },
          fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 1 } }],
          textDecoration: "NONE",
        },
      ],
    };
    const result = await serializeText(node, { id: "t", name: "t", type: "TEXT", styles: {} });
    expect(result.styleSegments).toHaveLength(2);
    const [a, b] = result.styleSegments;
    expect(a.fontSize).toBe(20);
    expect(a.fontWeight).toBe(700);
    expect(a.fills).toEqual(["#ff0000"]);
    expect(a.textDecoration).toBe("UNDERLINE");
    expect(a.textDecorationStyle).toBe("DASHED");
    expect(a.openTypeFeatures).toEqual({ KERN: true });
    expect(a.paragraphSpacing).toBe(4);
    expect(b.lineHeight).toEqual({ value: 24, unit: "PIXELS" });
    expect(b.letterSpacing).toEqual({ value: 2, unit: "PERCENT" });
    expect(b.fills).toEqual(["#0000ff"]);
  });
});
