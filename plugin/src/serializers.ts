// Serializers — shared read/write helpers for converting Figma node data to JSON.

export const isMixed = (value: any) => typeof value === "symbol";

// Round floating-point pixel values to 2 decimal places.
// Figma sometimes returns values like 123.99999999999999 instead of 124.
const pixelRound = (v: number) => Math.round(v * 100) / 100;

export const toHex = (color: any) => {
  const clamp = (v: any) => Math.min(255, Math.max(0, Math.round(v * 255)));
  const [r, g, b] = [clamp(color.r), clamp(color.g), clamp(color.b)];
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

const serializeColorStop = (stop: any) => ({
  position: stop.position,
  color: toHex(stop.color),
  alpha: stop.color && stop.color.a != null ? stop.color.a : 1,
});

const serializePaint = (paint: any): any => {
  if (!paint) return undefined;
  const visible = paint.visible === false ? false : undefined;
  const opacity = paint.opacity != null && paint.opacity !== 1 ? paint.opacity : undefined;
  const blendMode = paint.blendMode && paint.blendMode !== "NORMAL" ? paint.blendMode : undefined;
  if (paint.type === "SOLID" && "color" in paint) {
    const hex = toHex(paint.color);
    const o = paint.opacity != null ? paint.opacity : 1;
    const hexWithAlpha =
      o === 1
        ? hex
        : hex + Math.round(o * 255).toString(16).padStart(2, "0");
    if (visible === undefined && blendMode === undefined) return hexWithAlpha;
    return { type: "SOLID", color: hexWithAlpha, visible, blendMode };
  }
  if (typeof paint.type === "string" && paint.type.startsWith("GRADIENT_")) {
    return {
      type: paint.type,
      visible,
      opacity,
      blendMode,
      gradientTransform: paint.gradientTransform,
      gradientStops: Array.isArray(paint.gradientStops)
        ? paint.gradientStops.map(serializeColorStop)
        : undefined,
    };
  }
  if (paint.type === "IMAGE") {
    return {
      type: "IMAGE",
      visible,
      opacity,
      blendMode,
      imageHash: paint.imageHash,
      scaleMode: paint.scaleMode,
      imageTransform: paint.imageTransform,
      scalingFactor: paint.scalingFactor,
      rotation: paint.rotation,
      filters: paint.filters,
    };
  }
  if (paint.type === "VIDEO") {
    return {
      type: "VIDEO",
      visible,
      opacity,
      blendMode,
      videoHash: paint.videoHash,
      scaleMode: paint.scaleMode,
    };
  }
  return { type: paint.type, visible, opacity, blendMode };
};

export const serializePaints = (paints: any) => {
  if (isMixed(paints)) return "mixed";

  if (!paints || !Array.isArray(paints)) return undefined;

  const result = paints
    .map((paint: any) => serializePaint(paint))
    .filter((paint: any) => paint !== undefined);

  return result.length > 0 ? result : undefined;
};

export const getBounds = (node: any) => {
  if ("x" in node && "y" in node && "width" in node && "height" in node) {
    return {
      x: pixelRound(node.x),
      y: pixelRound(node.y),
      width: pixelRound(node.width),
      height: pixelRound(node.height),
    };
  }

  return undefined;
};

const serializeEffect = (effect: any): any => {
  if (!effect) return undefined;
  const visible = effect.visible === false ? false : undefined;
  const blendMode =
    effect.blendMode && effect.blendMode !== "NORMAL" ? effect.blendMode : undefined;
  if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
    return {
      type: effect.type,
      visible,
      blendMode,
      color: effect.color ? toHex(effect.color) : undefined,
      alpha: effect.color && effect.color.a != null ? effect.color.a : undefined,
      offset: effect.offset ? { x: effect.offset.x, y: effect.offset.y } : undefined,
      radius: effect.radius,
      spread: effect.spread,
      showShadowBehindNode: effect.showShadowBehindNode,
    };
  }
  if (effect.type === "LAYER_BLUR" || effect.type === "BACKGROUND_BLUR") {
    return { type: effect.type, visible, blendMode, radius: effect.radius };
  }
  return { type: effect.type, visible, blendMode };
};

const serializeEffects = (effects: any) => {
  if (!effects || !Array.isArray(effects) || effects.length === 0) return undefined;
  return effects.map(serializeEffect).filter((e) => e !== undefined);
};

const serializeBoundVariables = (boundVariables: any) => {
  if (!boundVariables || typeof boundVariables !== "object") return undefined;
  const out: Record<string, any> = {};
  for (const key of Object.keys(boundVariables)) {
    const value = (boundVariables as any)[key];
    if (Array.isArray(value)) {
      out[key] = value.map((v) =>
        v && typeof v === "object" && "id" in v ? { id: v.id, type: v.type } : v
      );
    } else if (value && typeof value === "object" && "id" in value) {
      out[key] = { id: value.id, type: value.type };
    } else {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

const serializeCornerRadius = (node: any) => {
  if (!("cornerRadius" in node)) return {};
  const out: any = {};
  const cr = isMixed(node.cornerRadius) ? "mixed" : node.cornerRadius;
  if (cr !== undefined && cr !== 0) out.cornerRadius = cr;
  const { topLeftRadius: tl, topRightRadius: tr, bottomRightRadius: br, bottomLeftRadius: bl } = node;
  if (tl !== undefined || tr !== undefined || br !== undefined || bl !== undefined) {
    const uniform = tl === tr && tr === br && br === bl;
    if (!uniform) {
      out.cornerRadiusPerCorner = {
        topLeft: tl,
        topRight: tr,
        bottomRight: br,
        bottomLeft: bl,
      };
    }
  }
  if (node.cornerSmoothing !== undefined && node.cornerSmoothing !== 0) {
    out.cornerSmoothing = node.cornerSmoothing;
  }
  return out;
};

const serializeAutoLayout = (node: any) => {
  if (!("layoutMode" in node) || node.layoutMode === "NONE") return {};
  return {
    layoutMode: node.layoutMode,
    itemSpacing: node.itemSpacing,
    counterAxisSpacing: node.counterAxisSpacing != null ? node.counterAxisSpacing : undefined,
    layoutWrap: node.layoutWrap && node.layoutWrap !== "NO_WRAP" ? node.layoutWrap : undefined,
    primaryAxisAlignItems: node.primaryAxisAlignItems,
    counterAxisAlignItems: node.counterAxisAlignItems,
    counterAxisAlignContent:
      node.counterAxisAlignContent && node.counterAxisAlignContent !== "AUTO"
        ? node.counterAxisAlignContent
        : undefined,
    primaryAxisSizingMode: node.primaryAxisSizingMode,
    counterAxisSizingMode: node.counterAxisSizingMode,
    itemReverseZIndex: node.itemReverseZIndex || undefined,
    strokesIncludedInLayout: node.strokesIncludedInLayout || undefined,
  };
};

const serializeChildLayout = (node: any) => {
  const out: any = {};
  if (node.layoutAlign !== undefined && node.layoutAlign !== "INHERIT") out.layoutAlign = node.layoutAlign;
  if (node.layoutGrow !== undefined && node.layoutGrow !== 0) out.layoutGrow = node.layoutGrow;
  if (node.layoutPositioning !== undefined && node.layoutPositioning !== "AUTO") {
    out.layoutPositioning = node.layoutPositioning;
  }
  if (node.layoutSizingHorizontal !== undefined) out.layoutSizingHorizontal = node.layoutSizingHorizontal;
  if (node.layoutSizingVertical !== undefined) out.layoutSizingVertical = node.layoutSizingVertical;
  if (node.minWidth !== undefined && node.minWidth !== null) out.minWidth = node.minWidth;
  if (node.maxWidth !== undefined && node.maxWidth !== null) out.maxWidth = node.maxWidth;
  if (node.minHeight !== undefined && node.minHeight !== null) out.minHeight = node.minHeight;
  if (node.maxHeight !== undefined && node.maxHeight !== null) out.maxHeight = node.maxHeight;
  return out;
};

const serializeStrokeDetail = (node: any) => {
  if (!("strokes" in node)) return {};
  const out: any = {};
  const sw = isMixed(node.strokeWeight) ? "mixed" : node.strokeWeight;
  if (sw !== undefined) out.strokeWeight = sw;
  if (node.strokeAlign !== undefined) out.strokeAlign = node.strokeAlign;
  if (node.strokeCap !== undefined && node.strokeCap !== "NONE") {
    out.strokeCap = isMixed(node.strokeCap) ? "mixed" : node.strokeCap;
  }
  if (node.strokeJoin !== undefined && node.strokeJoin !== "MITER") {
    out.strokeJoin = isMixed(node.strokeJoin) ? "mixed" : node.strokeJoin;
  }
  if (node.strokeMiterLimit !== undefined && node.strokeMiterLimit !== 4) {
    out.strokeMiterLimit = node.strokeMiterLimit;
  }
  if (Array.isArray(node.dashPattern) && node.dashPattern.length > 0) {
    out.dashPattern = node.dashPattern;
  }
  const perSide: any = {};
  if (node.strokeTopWeight !== undefined) perSide.top = node.strokeTopWeight;
  if (node.strokeRightWeight !== undefined) perSide.right = node.strokeRightWeight;
  if (node.strokeBottomWeight !== undefined) perSide.bottom = node.strokeBottomWeight;
  if (node.strokeLeftWeight !== undefined) perSide.left = node.strokeLeftWeight;
  if (Object.keys(perSide).length > 0) {
    const uniform =
      perSide.top === perSide.right &&
      perSide.right === perSide.bottom &&
      perSide.bottom === perSide.left;
    if (!uniform) out.strokeWeightPerSide = perSide;
  }
  return out;
};

const serializeConstraints = (node: any) => {
  if (!("constraints" in node) || !node.constraints) return undefined;
  return { horizontal: node.constraints.horizontal, vertical: node.constraints.vertical };
};

const serializeAbsoluteBounds = (node: any) => {
  const out: any = {};
  if (node.absoluteBoundingBox) out.absoluteBoundingBox = node.absoluteBoundingBox;
  if (node.absoluteRenderBounds) out.absoluteRenderBounds = node.absoluteRenderBounds;
  if (node.absoluteTransform) out.absoluteTransform = node.absoluteTransform;
  return out;
};

export const serializeStyles = async (node: any) => {
  const styles: any = {};

  if ("fills" in node) {
    // Prefer named style over raw fill values when a style is applied.
    if (node.fillStyleId && typeof node.fillStyleId === "string") {
      const style = await figma.getStyleByIdAsync(node.fillStyleId);
      if (style) styles.fillStyle = style.name;
    }
    const fills = serializePaints(node.fills);
    if (fills !== undefined) styles.fills = fills;
  }

  if ("strokes" in node) {
    if (node.strokeStyleId && typeof node.strokeStyleId === "string") {
      const style = await figma.getStyleByIdAsync(node.strokeStyleId);
      if (style) styles.strokeStyle = style.name;
    }
    const strokes = serializePaints(node.strokes);
    if (strokes !== undefined) styles.strokes = strokes;
    Object.assign(styles, serializeStrokeDetail(node));
  }

  if ("effects" in node) {
    if (node.effectStyleId && typeof node.effectStyleId === "string") {
      const style = await figma.getStyleByIdAsync(node.effectStyleId);
      if (style) styles.effectStyle = style.name;
    }
    const effects = serializeEffects(node.effects);
    if (effects !== undefined) styles.effects = effects;
  }

  Object.assign(styles, serializeCornerRadius(node));

  if ("paddingLeft" in node) {
    styles.padding = {
      top: node.paddingTop,
      right: node.paddingRight,
      bottom: node.paddingBottom,
      left: node.paddingLeft,
    };
  }

  Object.assign(styles, serializeAutoLayout(node));
  Object.assign(styles, serializeChildLayout(node));

  if ("opacity" in node && node.opacity !== 1) styles.opacity = node.opacity;
  if ("visible" in node && node.visible === false) styles.visible = false;
  if (
    "blendMode" in node &&
    node.blendMode &&
    node.blendMode !== "PASS_THROUGH" &&
    node.blendMode !== "NORMAL"
  ) {
    styles.blendMode = node.blendMode;
  }
  if ("rotation" in node && node.rotation !== undefined && node.rotation !== 0) {
    styles.rotation = node.rotation;
  }
  if ("clipsContent" in node && node.clipsContent === true) styles.clipsContent = true;
  if ("isMask" in node && node.isMask === true) {
    styles.isMask = true;
    if (node.maskType !== undefined) styles.maskType = node.maskType;
  }
  const constraints = serializeConstraints(node);
  if (constraints) styles.constraints = constraints;
  Object.assign(styles, serializeAbsoluteBounds(node));
  if ("boundVariables" in node) {
    const bv = serializeBoundVariables(node.boundVariables);
    if (bv) styles.boundVariables = bv;
  }

  if ("inferredVariables" in node && node.inferredVariables) {
    styles.inferredVariables = node.inferredVariables;
  }
  if ("explicitVariableModes" in node && node.explicitVariableModes) {
    const evm = node.explicitVariableModes;
    if (evm && typeof evm === "object" && Object.keys(evm).length > 0) {
      styles.explicitVariableModes = evm;
    }
  }

  // ComponentNode / ComponentSetNode metadata
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
    if (node.description) styles.description = node.description;
    if (node.descriptionMarkdown) styles.descriptionMarkdown = node.descriptionMarkdown;
    if (Array.isArray(node.documentationLinks) && node.documentationLinks.length > 0) {
      styles.documentationLinks = node.documentationLinks;
    }
    if (node.componentPropertyDefinitions) {
      const defs = node.componentPropertyDefinitions;
      if (defs && Object.keys(defs).length > 0) styles.componentPropertyDefinitions = defs;
    }
    if (node.variantProperties) styles.variantProperties = node.variantProperties;
  }

  // InstanceNode-specific values
  if (node.type === "INSTANCE") {
    if (node.componentProperties) {
      const cp: any = {};
      for (const [k, v] of Object.entries(node.componentProperties)) {
        cp[k] = (v as any).value !== undefined ? (v as any).value : v;
      }
      if (Object.keys(cp).length > 0) styles.componentProperties = cp;
    }
    if (node.isExposedInstance === true) styles.isExposedInstance = true;
    if (node.scaleFactor !== undefined && node.scaleFactor !== 1) {
      styles.scaleFactor = node.scaleFactor;
    }
    if (Array.isArray(node.overrides) && node.overrides.length > 0) {
      styles.overrides = node.overrides.map((o: any) => ({
        id: o.id,
        overriddenFields: o.overriddenFields,
      }));
    }
  }

  // Vector / Line / Star / Ellipse / Polygon network info
  if (node.type === "VECTOR" || node.type === "STAR" || node.type === "POLYGON") {
    if (Array.isArray(node.vectorPaths) && node.vectorPaths.length > 0) {
      styles.vectorPaths = node.vectorPaths;
    }
    if (node.handleMirroring && node.handleMirroring !== "NONE") {
      styles.handleMirroring = node.handleMirroring;
    }
  }
  if (node.type === "LINE") {
    if (Array.isArray(node.vectorPaths) && node.vectorPaths.length > 0) {
      styles.vectorPaths = node.vectorPaths;
    }
  }
  if (node.type === "ELLIPSE" && node.arcData) {
    const a = node.arcData;
    if (a.startingAngle !== 0 || a.endingAngle !== Math.PI * 2 || a.innerRadius !== 0) {
      styles.arcData = a;
    }
  }
  if (node.type === "POLYGON" && node.pointCount !== undefined && node.pointCount !== 3) {
    styles.pointCount = node.pointCount;
  }
  if (node.type === "STAR") {
    if (node.pointCount !== undefined && node.pointCount !== 5) styles.pointCount = node.pointCount;
    if (node.innerRadius !== undefined && node.innerRadius !== 0.5) {
      styles.innerRadius = node.innerRadius;
    }
  }

  // Layout grids on FRAME/COMPONENT
  if (Array.isArray(node.layoutGrids) && node.layoutGrids.length > 0) {
    styles.layoutGrids = node.layoutGrids;
  }
  if (Array.isArray(node.guides) && node.guides.length > 0) {
    styles.guides = node.guides;
  }

  // Cross-element relative position is NOT a Figma Plugin API primitive —
  // it can be computed from bounds.x/y (parent-relative) plus
  // absoluteBoundingBox (page-absolute), both of which are exposed above.
  // We do not synthesize sibling-to-sibling deltas here; that is callsite
  // logic, not serializer logic.

  // Common base-node metadata
  if (node.locked === true) styles.locked = true;
  if (Array.isArray(node.exportSettings) && node.exportSettings.length > 0) {
    styles.exportSettings = node.exportSettings;
  }
  if (Array.isArray(node.reactions) && node.reactions.length > 0) {
    styles.reactions = node.reactions;
  }
  if (Array.isArray(node.annotations) && node.annotations.length > 0) {
    styles.annotations = node.annotations;
  }

  return styles;
};

// Backwards-compatible. AUTO and falsy collapse to undefined.
export const serializeLineHeight = (lineHeight: any) => {
  if (isMixed(lineHeight)) return "mixed";

  if (!lineHeight || lineHeight.unit === "AUTO") return undefined;

  return { value: lineHeight.value, unit: lineHeight.unit };
};

// Explicit form. AUTO becomes { unit: "AUTO" } so callers can distinguish
// explicit-auto from missing data. Used by serializeText/styleSegments.
const serializeLineHeightExplicit = (lineHeight: any) => {
  if (isMixed(lineHeight)) return "mixed";
  if (!lineHeight) return undefined;
  if (lineHeight.unit === "AUTO") return { unit: "AUTO" };
  return { value: lineHeight.value, unit: lineHeight.unit };
};

// Backwards-compatible. value=0 and falsy collapse to undefined.
export const serializeLetterSpacing = (letterSpacing: any) => {
  if (isMixed(letterSpacing)) return "mixed";

  if (!letterSpacing || letterSpacing.value === 0) return undefined;

  return { value: letterSpacing.value, unit: letterSpacing.unit };
};

// Explicit form. value=0 stays explicit. Used by serializeText/styleSegments.
const serializeLetterSpacingExplicit = (letterSpacing: any) => {
  if (isMixed(letterSpacing)) return "mixed";
  if (!letterSpacing) return undefined;
  return { value: letterSpacing.value, unit: letterSpacing.unit };
};

const styledTextSegmentFields = [
  "fontName",
  "fontSize",
  "fontWeight",
  "textDecoration",
  "textDecorationStyle",
  "textDecorationOffset",
  "textDecorationThickness",
  "textDecorationColor",
  "textDecorationSkipInk",
  "textCase",
  "lineHeight",
  "letterSpacing",
  "fills",
  "textStyleId",
  "fillStyleId",
  "openTypeFeatures",
  "indentation",
  "listOptions",
  "paragraphSpacing",
  "paragraphIndent",
  "listSpacing",
  "hyperlink",
] as const;

const serializeHyperlink = (h: any) => {
  if (!h) return undefined;
  if (isMixed(h)) return "mixed";
  return { type: h.type, value: h.value };
};

const serializeStyledTextSegment = (segment: any) => {
  const fontName = segment.fontName;
  const fontFamily = isMixed(fontName) ? "mixed" : fontName?.family;
  const fontStyle = isMixed(fontName) ? "mixed" : fontName?.style;
  const textDecoration = isMixed(segment.textDecoration)
    ? "mixed"
    : segment.textDecoration && segment.textDecoration !== "NONE"
      ? segment.textDecoration
      : undefined;
  const textCase = isMixed(segment.textCase)
    ? "mixed"
    : segment.textCase && segment.textCase !== "ORIGINAL"
      ? segment.textCase
      : undefined;
  return {
    characters: segment.characters,
    start: segment.start,
    end: segment.end,
    fontName: isMixed(fontName) ? "mixed" : fontName,
    fontFamily,
    fontStyle,
    fontSize: isMixed(segment.fontSize) ? "mixed" : segment.fontSize,
    fontWeight: isMixed(segment.fontWeight) ? "mixed" : segment.fontWeight,
    lineHeight: serializeLineHeightExplicit(segment.lineHeight),
    letterSpacing: serializeLetterSpacingExplicit(segment.letterSpacing),
    fills: serializePaints(segment.fills),
    textDecoration,
    textDecorationStyle:
      isMixed(segment.textDecorationStyle)
        ? "mixed"
        : segment.textDecorationStyle ?? undefined,
    textDecorationOffset:
      isMixed(segment.textDecorationOffset)
        ? "mixed"
        : segment.textDecorationOffset ?? undefined,
    textDecorationThickness:
      isMixed(segment.textDecorationThickness)
        ? "mixed"
        : segment.textDecorationThickness ?? undefined,
    textDecorationColor:
      isMixed(segment.textDecorationColor)
        ? "mixed"
        : segment.textDecorationColor ?? undefined,
    textDecorationSkipInk:
      isMixed(segment.textDecorationSkipInk)
        ? "mixed"
        : segment.textDecorationSkipInk ?? undefined,
    textCase,
    textStyleId: typeof segment.textStyleId === "string" ? segment.textStyleId : undefined,
    fillStyleId: typeof segment.fillStyleId === "string" ? segment.fillStyleId : undefined,
    openTypeFeatures:
      segment.openTypeFeatures &&
      typeof segment.openTypeFeatures === "object" &&
      Object.keys(segment.openTypeFeatures).length > 0
        ? segment.openTypeFeatures
        : undefined,
    indentation: segment.indentation ?? undefined,
    listOptions:
      segment.listOptions && segment.listOptions.type !== "NONE"
        ? segment.listOptions
        : undefined,
    paragraphSpacing:
      segment.paragraphSpacing !== undefined && segment.paragraphSpacing !== 0
        ? segment.paragraphSpacing
        : undefined,
    paragraphIndent:
      segment.paragraphIndent !== undefined && segment.paragraphIndent !== 0
        ? segment.paragraphIndent
        : undefined,
    listSpacing:
      segment.listSpacing !== undefined && segment.listSpacing !== 0
        ? segment.listSpacing
        : undefined,
    hyperlink: serializeHyperlink(segment.hyperlink),
  };
};

const serializeTextStyleSegments = (node: any) => {
  if (typeof node?.getStyledTextSegments !== "function") return undefined;
  return node
    .getStyledTextSegments(styledTextSegmentFields as unknown as string[])
    .map((segment: any) => serializeStyledTextSegment(segment));
};

export const serializeText = async (node: any, base: any) => {
  let fontFamily: any;
  let fontStyle: any;

  if (typeof node.fontName === "symbol") {
    fontFamily = "mixed";
    fontStyle = "mixed";
  } else if (node.fontName) {
    fontFamily = node.fontName.family;
    fontStyle = node.fontName.style;
  }

  const textStyleName =
    node.textStyleId && typeof node.textStyleId === "string"
      ? ((await figma.getStyleByIdAsync(node.textStyleId))?.name ?? undefined)
      : undefined;

  return Object.assign({}, base, {
    characters: node.characters,
    styleSegments: serializeTextStyleSegments(node),
    styles: Object.assign({}, base.styles, {
      ...(textStyleName ? { textStyle: textStyleName } : {}),
      fontSize: isMixed(node.fontSize) ? "mixed" : node.fontSize,
      fontFamily,
      fontStyle,
      fontWeight: isMixed(node.fontWeight) ? "mixed" : node.fontWeight,
      textDecoration: isMixed(node.textDecoration)
        ? "mixed"
        : node.textDecoration !== "NONE"
          ? node.textDecoration
          : undefined,
      textCase: isMixed(node.textCase)
        ? "mixed"
        : node.textCase && node.textCase !== "ORIGINAL"
          ? node.textCase
          : undefined,
      lineHeight: serializeLineHeightExplicit(node.lineHeight),
      letterSpacing: serializeLetterSpacingExplicit(node.letterSpacing),
      paragraphSpacing:
        node.paragraphSpacing !== undefined && node.paragraphSpacing !== 0
          ? node.paragraphSpacing
          : undefined,
      paragraphIndent:
        node.paragraphIndent !== undefined && node.paragraphIndent !== 0
          ? node.paragraphIndent
          : undefined,
      listSpacing:
        node.listSpacing !== undefined && node.listSpacing !== 0 ? node.listSpacing : undefined,
      leadingTrim:
        node.leadingTrim !== undefined && node.leadingTrim !== "NONE" ? node.leadingTrim : undefined,
      hangingPunctuation: node.hangingPunctuation === true ? true : undefined,
      hangingList: node.hangingList === true ? true : undefined,
      textAlignHorizontal: isMixed(node.textAlignHorizontal)
        ? "mixed"
        : node.textAlignHorizontal,
      textAlignVertical: isMixed(node.textAlignVertical)
        ? "mixed"
        : node.textAlignVertical && node.textAlignVertical !== "TOP"
          ? node.textAlignVertical
          : undefined,
      textAutoResize:
        node.textAutoResize !== undefined && node.textAutoResize !== "NONE"
          ? node.textAutoResize
          : undefined,
      textTruncation:
        node.textTruncation !== undefined && node.textTruncation !== "DISABLED"
          ? node.textTruncation
          : undefined,
      maxLines: node.maxLines !== undefined && node.maxLines !== null ? node.maxLines : undefined,
      openTypeFeatures:
        node.openTypeFeatures &&
        typeof node.openTypeFeatures === "object" &&
        Object.keys(node.openTypeFeatures).length > 0
          ? node.openTypeFeatures
          : undefined,
      textDecorationStyle:
        isMixed(node.textDecorationStyle)
          ? "mixed"
          : node.textDecorationStyle ?? undefined,
      textDecorationOffset:
        isMixed(node.textDecorationOffset)
          ? "mixed"
          : node.textDecorationOffset ?? undefined,
      textDecorationThickness:
        isMixed(node.textDecorationThickness)
          ? "mixed"
          : node.textDecorationThickness ?? undefined,
      textDecorationColor:
        isMixed(node.textDecorationColor)
          ? "mixed"
          : node.textDecorationColor ?? undefined,
      textDecorationSkipInk:
        isMixed(node.textDecorationSkipInk)
          ? "mixed"
          : node.textDecorationSkipInk ?? undefined,
      hyperlink: serializeHyperlink(node.hyperlink),
      hasMissingFont: node.hasMissingFont === true ? true : undefined,
      autoRename: node.autoRename === true ? true : undefined,
    }),
  });
};

export const serializeNode = async (node: any): Promise<any> => {
  const styles = await serializeStyles(node);
  const base = {
    id: node.id,
    name: node.name,
    type: node.type,
    bounds: getBounds(node),
    styles,
  };
  if (node.type === "TEXT") return serializeText(node, base);
  if ("children" in node) {
    return Object.assign({}, base, {
      children: await Promise.all(node.children.map((child: any) => serializeNode(child))),
    });
  }
  return base;
};

// deduplicateStyles does a two-pass walk over a serialized node tree.
// First pass: count how many times each fills/strokes array value appears.
// Second pass: replace values that appear more than once with a short ref key.
// Returns the rewritten tree and a globalVars.styles map (or undefined if nothing was deduped).
export const deduplicateStyles = (tree: any): { tree: any; globalVars: Record<string, any> | undefined } => {
  // Pass 1: count occurrences of each serialized fill/stroke value
  const counts = new Map<string, number>();
  const countWalk = (node: any) => {
    if (!node || typeof node !== "object") return;
    const s = node.styles;
    if (s) {
      if (Array.isArray(s.fills)) counts.set(JSON.stringify(s.fills), (counts.get(JSON.stringify(s.fills)) ?? 0) + 1);
      if (Array.isArray(s.strokes)) counts.set(JSON.stringify(s.strokes), (counts.get(JSON.stringify(s.strokes)) ?? 0) + 1);
    }
    if (Array.isArray(node.children)) node.children.forEach(countWalk);
  };
  countWalk(tree);

  // Build ref map for values that appear more than once
  let counter = 0;
  const keyToRef = new Map<string, string>();
  const refs: Record<string, any> = {};
  for (const [key, count] of counts) {
    if (count > 1) {
      const ref = `s${++counter}`;
      keyToRef.set(key, ref);
      refs[ref] = JSON.parse(key);
    }
  }
  if (keyToRef.size === 0) return { tree, globalVars: undefined };

  // Pass 2: replace repeated values with ref keys
  const replaceWalk = (node: any): any => {
    if (!node || typeof node !== "object") return node;
    let result = node;
    const s = node.styles;
    if (s) {
      let newStyles = s;
      if (Array.isArray(s.fills)) {
        const ref = keyToRef.get(JSON.stringify(s.fills));
        if (ref) newStyles = { ...newStyles, fills: ref };
      }
      if (Array.isArray(s.strokes)) {
        const ref = keyToRef.get(JSON.stringify(s.strokes));
        if (ref) newStyles = { ...newStyles, strokes: ref };
      }
      if (newStyles !== s) result = { ...node, styles: newStyles };
    }
    if (Array.isArray(node.children)) {
      const newChildren = node.children.map(replaceWalk);
      result = { ...result, children: newChildren };
    }
    return result;
  };

  return { tree: replaceWalk(tree), globalVars: { styles: refs } };
};

export const serializeVariableValue = (value: any) => {
  if (typeof value !== "object" || value === null) return value;

  if ("type" in value && value.type === "VARIABLE_ALIAS") {
    return { type: "VARIABLE_ALIAS", id: value.id };
  }

  if ("r" in value && "g" in value && "b" in value) {
    return {
      type: "COLOR",
      r: value.r,
      g: value.g,
      b: value.b,
      a: "a" in value ? value.a : 1,
    };
  }

  return value;
};
