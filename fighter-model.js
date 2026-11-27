import * as THREE from "./vendor/three/three.module.min.js";
import { PixelSurface, hexToRgb, scaleRgb, mixRgb } from "./pixel-surface.js";

const clamp = THREE.MathUtils.clamp;

function makeColor(hex) {
  return new THREE.Color(hex);
}

function hash2d(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// Authentic 4x4 PS1 ordered Bayer dither table normalized to [-0.5, +0.5]
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
];

function bayer4(x, y) {
  return BAYER_4X4[y & 3][x & 3] / 16 - 0.46875;
}

export function getTrouserColor(definition) {
  if (definition.trousers) return definition.trousers;
  switch (definition.id) {
    case "meloni": return "#1f4e94";
    case "salvini": return "#23334c";
    case "tajani": return "#1f2e4b";
    case "renzi": return "#252e42";
    case "calenda": return "#3b4657";
    case "schlein": return "#883f6d";
    case "conte": return "#1e2a3c";
    case "bonelli": return "#303b34";
    default: return "#2f2c38";
  }
}

/**
 * Paint a 128x128 PS1 pixel-shaded face texture aligned to the 16x16 sculpted head UVs:
 * u = 0.5 (x = 64) is center of face (+Z); v = 0.5 (y = 64) is mid-face equator.
 */
export function createFaceTexture(definition) {
  const surf = new PixelSurface(128, 128);
  const skin = hexToRgb(definition.skin);
  const skinShadow = scaleRgb(skin, 0.70, 8, -5, -4);
  const skinDeep = scaleRgb(skin, 0.52, 6, -8, -6);
  const skinLight = scaleRgb(skin, 1.15, 8, 5, 3);
  const skinSpec = scaleRgb(skin, 1.24, 10, 7, 5);
  const blush = scaleRgb(skin, 0.94, 24, -8, -8);
  const hair = hexToRgb(definition.hair);
  const hairDark = scaleRgb(hair, 0.62);
  const hairLight = scaleRgb(hair, 1.18, 6, 5, 4);

  const id = definition.id;
  const isMeloni = id === "meloni";
  const isSchlein = id === "schlein";
  const isCalenda = id === "calenda";
  const isConte = id === "conte";
  const isTajani = id === "tajani";
  const isRenzi = id === "renzi";
  const isSalvini = id === "salvini";
  const isBonelli = id === "bonelli";

  surf.fill(skin);

  // PS1 Bayer-dithered skin shading, hairline, sideburns, temples & jaw planes
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const dither = bayer4(x, y);
      const distFromCenter = Math.abs(x - 64);

      // Character-specific hairline height (higher mature temples for Tajani, sleek widow's peak for Conte)
      const templeRecede = isTajani
        ? Math.max(0, 14 - Math.abs(distFromCenter - 15)) * 0.42
        : isConte
          ? -Math.max(0, 6 - distFromCenter) * 0.45
          : 0;
      const hairlineY = (isTajani ? 36 : 33) + templeRecede + Math.max(0, distFromCenter - 11) * 0.46;
      if (y < hairlineY) {
        const blend = clamp((hairlineY - y) / 4.5, 0, 1);
        const strand = ((x % 3 === 0) ? 1.09 : (x % 3 === 1) ? 0.88 : 0.98) + dither * 0.12;
        const silverTemple = (isConte || isTajani || isBonelli) && distFromCenter > 20 && y > hairlineY - 10;
        const baseHair = silverTemple ? mixRgb(hair, [205, 212, 222], 0.52) : hair;
        surf.blendPixel(x, y, scaleRgb(baseHair, strand), blend);
        continue;
      }

      // Sculpted sideburns down to ear level
      if (distFromCenter >= 24 && distFromCenter <= 33 && y >= hairlineY && y <= (isSalvini ? 76 : 64)) {
        const sbAlpha = clamp(1 - Math.abs(distFromCenter - 28.5) / 5.5, 0, 1) * (isMeloni || isSchlein ? 0.55 : 0.82);
        const strand = (x % 2 === 0 ? 0.9 : 1.08) + dither * 0.1;
        surf.blendPixel(x, y, scaleRgb(hair, strand), sbAlpha);
      }

      // Temple & side-of-head sculptural plane shadow
      if (distFromCenter > 26) {
        const sideT = clamp((distFromCenter - 26) / 16, 0, 1);
        surf.blendPixel(x, y, skinShadow, clamp(sideT * 0.62 + dither * 0.08, 0, 0.78));
      }

      // Under-jaw & neck ambient occlusion shadow
      if (y > 95) {
        const jawT = clamp((y - 95) / 18, 0, 1);
        surf.blendPixel(x, y, skinDeep, clamp(jawT * 0.84 + dither * 0.07, 0, 0.92));
      }

      // Forehead center key-light plane + Bayer dither
      if (y >= 36 && y <= 46 && distFromCenter < 17) {
        const plane = (1 - distFromCenter / 17) * (1 - Math.abs(y - 41) / 6);
        surf.blendPixel(x, y, skinLight, clamp(plane * 0.42 + dither * 0.08, 0, 0.5));
      }
    }
  }

  // Sculpted cheekbone highlights, warm blush & Tekken-3 sub-zygomatic hollow
  for (const s of [-1, 1]) {
    surf.blendEllipse(64 + s * 14.5, 66, 7.5, 5.2, skinLight, 0.52, 1.35);
    surf.blendEllipse(64 + s * 13.5, 70, 6.2, 4.2, blush, isMeloni || isSchlein ? 0.36 : 0.24, 1.5);
    surf.blendEllipse(64 + s * 16.5, 79, 7.5, 6.5, skinShadow, 0.42, 1.3);
    // Warm brow-bone highlight right above outer brow
    surf.blendEllipse(64 + s * 11, 44, 5.5, 2.5, skinLight, 0.35, 1.5);
  }

  // Character-specific jaw & forehead contour lines
  if (isRenzi || isCalenda || isMeloni) {
    for (const s of [-1, 1]) {
      surf.drawSegment(64 + s * 22, 80, 64 + s * 10, 98, 1.5, skinDeep, 0.58);
    }
  }
  if (isCalenda || isTajani) {
    // Expressive forehead creases / determined furrow
    surf.drawSegment(55, 42, 73, 42, 0.45, skinShadow, 0.48);
    surf.drawSegment(58, 39, 70, 39, 0.4, skinShadow, 0.36);
    if (isCalenda) {
      surf.drawSegment(63, 45, 63, 50, 0.45, skinDeep, 0.55);
      surf.drawSegment(65, 45, 65, 50, 0.45, skinDeep, 0.55);
    }
  }

  // Expressive PS1 eyes (centered at x = 56 and 72, y = 56)
  const irisColor =
    isMeloni ? [58, 134, 206] :
    isTajani ? [92, 120, 146] :
    isBonelli ? [82, 108, 76] :
    [68, 44, 32];
  const irisRim = scaleRgb(irisColor, 0.55);
  const irisLight = scaleRgb(irisColor, 1.38, 12, 14, 16);

  for (const s of [-1, 1]) {
    const ex = 64 + s * 8;
    const ey = 56;
    // Deep Tekken-3 orbital socket shading
    surf.blendEllipse(ex, ey - 1, 7.2, 5.4, skinShadow, 0.72, 1.25);
    surf.blendEllipse(ex - s * 2.2, ey - 2, 4.0, 3.4, skinDeep, 0.52, 1.3);
    // Subtle lower-eyelid highlight ridge
    surf.drawSegment(ex - 3, ey + 3, ex + 3, ey + 3, 0.55, skinLight, 0.45);

    // Sclera & upper lid cast shadow (sharper almond eye shape)
    const eyeH = isMeloni || isSchlein ? 4 : isCalenda ? 3 : 3;
    const topY = ey - 1;
    surf.fillRect(ex - 3, topY, 7, eyeH, [242, 237, 228], 0.96);
    // Taper inner & outer eye corners with socket tone for natural almond silhouette
    surf.blendPixel(ex - s * 3, topY, skinShadow, 0.55);
    surf.blendPixel(ex + s * 3, topY + eyeH - 1, skinShadow, 0.50);
    // Cast shadow from upper lashes onto top of sclera
    surf.fillRect(ex - 3, topY, 7, 1, [176, 168, 164], 0.72);

    // Layered iris (dark limbal ring + bright lower iris crescent + crisp pupil + specular pixel!)
    surf.fillRect(ex - 1, topY, 3, eyeH, irisRim, 0.96);
    surf.blendPixel(ex, topY + 1, irisColor, 1.0);
    surf.blendPixel(ex, topY + Math.min(2, eyeH - 1), irisLight, 0.92);
    surf.blendPixel(ex, topY + 1, [18, 14, 22], 0.95);
    // Crisp white arcade catchlight
    surf.blendPixel(ex - 1, topY, [255, 254, 248], 0.95);

    // Bold upper lash line / eyeliner (distinct winged liner for Meloni & Schlein)
    const lashY0 = topY - 1;
    const lashY1 = isMeloni || isSchlein ? topY - 2 : topY - 1;
    surf.drawSegment(ex - s * 3, lashY0, ex + s * 4, lashY1, isMeloni || isSchlein ? 0.7 : 0.55, [22, 17, 22], 0.96);
    if (isMeloni || isSchlein) {
      surf.blendPixel(ex + s * 4, lashY1, [26, 20, 26], 0.92);
    }
    // Lower eyelid crease
    surf.drawSegment(ex - 2, topY + eyeH, ex + 2, topY + eyeH, 0.45, skinDeep, 0.62);

    // Character-specific expressive eyebrows (y = 46..50)
    const browColor = isMeloni
      ? scaleRgb(hair, 0.56)
      : isTajani
        ? mixRgb(hairDark, [175, 182, 192], 0.55)
        : hairDark;
    const bxIn = 64 + s * 3.5;
    const bxOut = 64 + s * 13.5;
    const byIn = isCalenda ? 50 : isMeloni ? 49 : isConte ? 48 : 48;
    const byMid = isConte ? 45 : isMeloni ? 45.5 : isSchlein ? 46 : 46.5;
    const byOut = isMeloni ? 46.5 : isConte ? 47.5 : isCalenda ? 47 : 48.5;
    const browThickness = isConte || isCalenda || isSalvini ? 1.25 : isMeloni ? 0.9 : 1.05;
    surf.drawSegment(bxIn, byIn, 64 + s * 8.5, byMid, browThickness, browColor, 0.96);
    surf.drawSegment(64 + s * 8.5, byMid, bxOut, byOut, browThickness * 0.75, browColor, 0.92);
  }

  // Sculpted nose bridge highlight, side plane shading, specular tip & crisp nostrils
  const bridgeWidth = isSchlein ? 1.65 : 1.2;
  surf.drawSegment(64, 50, 64, 69, bridgeWidth, skinLight, 0.88);
  surf.drawSegment(64, 54, 64, 67, 0.6, skinSpec, 0.55);
  surf.blendEllipse(64, 70, 2.7, 2.2, skinSpec, 0.65, 1.4);
  for (const s of [-1, 1]) {
    surf.drawSegment(64 + s * 2.6, 52, 64 + s * 3.3, 70, 0.9, skinShadow, 0.62);
    surf.blendEllipse(64 + s * 3.2, 71, 1.8, 1.5, skinShadow, 0.55, 1.4);
    surf.blendPixel(64 + s * 2, 72, skinDeep, 0.95);
    surf.blendPixel(64 + s * 3, 72, skinDeep, 0.72);
  }
  // Underside of nose tip shadow
  surf.drawSegment(61.5, 73.5, 66.5, 73.5, 0.75, skinDeep, 0.72);

  // Nasolabial folds & laugh/character lines
  const foldAlpha = isMeloni || isSchlein ? 0.36 : isTajani || isCalenda ? 0.72 : 0.60;
  for (const s of [-1, 1]) {
    surf.drawSegment(64 + s * 4.2, 72, 64 + s * 9.5, 85, 0.7, skinShadow, foldAlpha);
  }

  // Sculpted philtrum, cupid's bow & character-specific mouth expression
  surf.drawSegment(64, 75, 64, 81, 0.55, skinShadow, 0.48);
  surf.drawSegment(63, 76, 63, 81, 0.4, skinLight, 0.32);
  surf.drawSegment(65, 76, 65, 81, 0.4, skinLight, 0.32);

  const lipUpper = isMeloni
    ? [194, 78, 86]
    : isSchlein
      ? [178, 84, 96]
      : [150, 84, 78];
  const lipLower = scaleRgb(lipUpper, 1.22, 14, 8, 6);
  const mouthLine = [54, 26, 32];
  const smirkLift = isRenzi || isConte ? -1.1 : isTajani ? -0.6 : isCalenda ? 0.6 : 0;

  surf.drawSegment(58.5, 85 + smirkLift * 0.4, 63, 83.8, 0.9, lipUpper, 0.90);
  surf.drawSegment(65, 83.8, 69.5, 85 + smirkLift, 0.9, lipUpper, 0.90);
  surf.drawSegment(57.5, 86 + smirkLift * 0.5, 64, 86, 0.55, mouthLine, 0.94);
  surf.drawSegment(64, 86, 70.5, 86 + smirkLift, 0.55, mouthLine, 0.94);
  surf.drawSegment(59.5, 88.2, 68.5, 88.2, 1.0, lipLower, 0.85);
  surf.drawSegment(62, 88, 66, 88, 0.5, skinSpec, 0.38);
  // Subtle teeth flash on Renzi's confident grin
  if (isRenzi) {
    surf.drawSegment(61, 86.4, 67, 86.4, 0.45, [242, 238, 230], 0.72);
  }
  // Chin cleft shadow & lower chin highlight
  surf.drawSegment(60.5, 91.5, 67.5, 91.5, 0.7, skinDeep, 0.62);
  surf.blendEllipse(64, 95, 4.5, 2.5, skinLight, 0.36, 1.4);

  // Salvini's rich salt-and-pepper beard across cheeks, jawline, chin & mustache
  if (definition.beard) {
    const pepper = [186, 192, 200];
    const darkHair = scaleRgb(hair, 0.72);
    for (let y = 73; y <= 116; y += 1) {
      for (let x = 38; x <= 90; x += 1) {
        const dx = Math.abs(x - 64);
        const inJaw = y >= 87 && dx <= 24 - (y - 87) * 0.30;
        const inCheek = y >= 73 && y < 87 && dx >= 9 && dx <= 24;
        const inMustache = y >= 77 && y <= 84.5 && dx <= 9.5;
        const inSoulPatch = y >= 89 && y <= 96 && dx <= 4.5;
        if (inJaw || inCheek || inMustache || inSoulPatch) {
          if (y >= 84.5 && y <= 88.5 && dx <= 6.5) continue;
          const n = hash2d(x, y);
          const edgeFade = inCheek && y < 77 ? 0.50 : 0.90;
          const tone = n > 0.70 ? pepper : n > 0.34 ? hair : darkHair;
          surf.blendPixel(x, y, tone, edgeFade * (0.72 + n * 0.28));
        }
      }
    }
  } else if (isCalenda || isBonelli) {
    // Rugged 5-o'clock stubble for Calenda; neat salt-and-pepper eco-goatee/stubble for Bonelli
    const stubbleDark = scaleRgb(hair, 0.78);
    const silver = [178, 184, 192];
    for (let y = 78; y <= 108; y += 1) {
      for (let x = 44; x <= 84; x += 1) {
        const dx = Math.abs(x - 64);
        const inZone = isBonelli
          ? ((y >= 88 && y <= 104 && dx <= 16 - (y - 88) * 0.35) || (y >= 79 && y <= 84 && dx <= 7.5))
          : (y >= 82 && dx <= 20 - Math.max(0, y - 90) * 0.38);
        if (!inZone) continue;
        if (y >= 84 && y <= 89 && dx <= 6.5) continue;
        const n = hash2d(x * 1.3, y * 1.3);
        if (n < 0.35) continue;
        const tone = isBonelli && n > 0.76 ? silver : stubbleDark;
        const alpha = isBonelli ? 0.52 : 0.26;
        surf.blendPixel(x, y, tone, alpha * n);
      }
    }
  }

  // Subtle hair highlight streak near top crown
  for (let x = 20; x < 108; x += 1) {
    if (x % 4 === 0) surf.blendPixel(x, 16 + (x % 3), hairLight, 0.30);
  }

  return surf.toCanvasTexture();
}

export function createSuitTexture(suitColor, accentColor, options = {}) {
  const surf = new PixelSurface(128, 128);
  const base = hexToRgb(suitColor);
  const dark = scaleRgb(base, 0.76);
  const deep = scaleRgb(base, 0.60);
  const stripe = scaleRgb(base, 1.20, 10, 10, 12);
  const sheen = scaleRgb(base, 1.12, 6, 6, 8);
  const buttonCol = [24, 22, 28];
  const buttonHi = [128, 124, 138];

  surf.fill(base);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const d = bayer4(x, y);
      // Crisp PS1 pinstripe every 8px + diagonal tailored wool twill weave
      if (x % 8 === 0) {
        surf.blendPixel(x, y, stripe, 0.58);
      } else if ((x + y) % 4 === 0) {
        surf.blendPixel(x, y, dark, 0.16);
      } else if ((x + y) % 4 === 2) {
        surf.blendPixel(x, y, sheen, 0.08);
      }

      // Subtle vertical seam lines along front torso darts (x = 46 and x = 82)
      if (x === 46 || x === 82) {
        surf.blendPixel(x, y, deep, 0.36);
        surf.blendPixel(x + 1, y, stripe, 0.18);
      }
      // Subtle lower jacket hem shadow + upper shoulder highlight
      if (y > 112) {
        const hemT = (y - 112) / 16;
        surf.blendPixel(x, y, deep, clamp(hemT * 0.45 + d * 0.08, 0, 0.6));
      } else if (y < 24) {
        const topT = (24 - y) / 24;
        surf.blendPixel(x, y, sheen, clamp(topT * 0.24 + d * 0.06, 0, 0.35));
      }
    }
  }

  if (options.buttons) {
    // Crisp center placket edge + two tailored buttons at center-front u = 0.5 (x = 64)
    surf.drawSegment(64, 72, 64, 126, 0.5, deep, 0.55);
    surf.drawSegment(65, 72, 65, 126, 0.4, stripe, 0.25);
    for (const by of [86, 105]) {
      surf.blendEllipse(64, by + 1, 3.8, 3.8, deep, 0.55, 1.2);
      surf.blendEllipse(64, by, 3.2, 3.2, buttonCol, 0.96, 0.6);
      surf.blendPixel(63, by - 1, buttonHi, 0.95);
      surf.blendPixel(65, by + 1, buttonHi, 0.45);
    }
    // Tailored breast welt pocket line on left chest (x = 44..54, y = 44)
    surf.drawSegment(44, 44, 54, 45, 0.8, deep, 0.72);
    surf.drawSegment(44, 43, 54, 44, 0.5, stripe, 0.55);
  }

  if (accentColor) {
    const acc = hexToRgb(accentColor);
    surf.drawSegment(0, 124, 127, 124, 0.9, acc, 0.45);
  }

  return surf.toCanvasTexture();
}

export function createTieTexture(tieColor, accentColor, pattern = "regimental") {
  const surf = new PixelSurface(128, 128);
  const base = hexToRgb(tieColor);
  const dark = scaleRgb(base, 0.70);
  const light = scaleRgb(base, 1.26, 12, 12, 12);
  const acc = accentColor ? hexToRgb(accentColor) : light;

  surf.fill(base);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const d = bayer4(x, y);
      if (pattern === "dots") {
        const gx = x % 10;
        const gy = (y + Math.floor(x / 10) * 5) % 10;
        if (Math.hypot(gx - 5, gy - 5) <= 1.6) {
          surf.blendPixel(x, y, mixRgb(light, acc, 0.6), 0.78);
        } else if ((x + y) % 2 === 0) {
          surf.blendPixel(x, y, dark, 0.14);
        }
      } else if (pattern === "jacquard") {
        const diamond = Math.abs((x % 12) - 6) + Math.abs((y % 12) - 6);
        if (diamond <= 2) surf.blendPixel(x, y, mixRgb(light, acc, 0.5), 0.52);
        else if (diamond === 5) surf.blendPixel(x, y, dark, 0.35);
      } else {
        const diag = (x + y) % 14;
        if (diag < 2) {
          surf.blendPixel(x, y, mixRgb(light, acc, 0.55), 0.68);
        } else if (diag === 3) {
          surf.blendPixel(x, y, dark, 0.42);
        } else if (diag === 8) {
          surf.blendPixel(x, y, light, 0.25);
        } else if ((x + y) % 2 === 0) {
          surf.blendPixel(x, y, dark, 0.14);
        }
      }
      // Silk specular highlight down center of tie + dark under-knot crease
      const centerGlow = Math.max(0, 1 - Math.abs(x - 64) / 28);
      if (centerGlow > 0) {
        surf.blendPixel(x, y, light, clamp(centerGlow * 0.22 + d * 0.05, 0, 0.3));
      }
      if (y < 18) {
        surf.blendPixel(x, y, dark, ((18 - y) / 18) * 0.45);
      }
    }
  }
  return surf.toCanvasTexture();
}

export function createTrouserTexture(trouserColor) {
  const surf = new PixelSurface(128, 128);
  const base = hexToRgb(trouserColor);
  const dark = scaleRgb(base, 0.72);
  const deep = scaleRgb(base, 0.55);
  const stripe = scaleRgb(base, 1.18, 6, 6, 8);
  const creaseHi = scaleRgb(base, 1.24, 8, 8, 10);

  surf.fill(base);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const d = bayer4(x, y);
      if (x % 8 === 0) surf.blendPixel(x, y, stripe, 0.36);
      if ((x + y) % 4 === 0) surf.blendPixel(x, y, dark, 0.16);
      // Pressed front/back trouser crease highlight
      const creaseDist = Math.min(Math.abs(x - 64), Math.min(x, 127 - x));
      if (creaseDist < 4) {
        surf.blendPixel(x, y, creaseHi, (1 - creaseDist / 4) * 0.24);
      }
      // Subtle knee fold & hem cuff shading
      if (y > 54 && y < 70) {
        const kneeShade = 1 - Math.abs(y - 62) / 8;
        surf.blendPixel(x, y, dark, kneeShade * 0.14);
      }
      if (y > 106) {
        surf.blendPixel(x, y, deep, clamp(((y - 106) / 22) * 0.52 + d * 0.06, 0, 0.62));
      }
      if (y === 116) surf.blendPixel(x, y, stripe, 0.28);
    }
  }
  return surf.toCanvasTexture();
}

export function createSkinTexture(skinColor) {
  const surf = new PixelSurface(128, 128);
  const base = hexToRgb(skinColor);
  const shadow = scaleRgb(base, 0.80, 6, -3, -3);
  const light = scaleRgb(base, 1.12, 6, 4, 2);
  const knuckle = scaleRgb(base, 0.92, 14, -5, -5);

  surf.fill(base);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const d = bayer4(x, y);
      if ((x + y) % 2 === 0) {
        surf.blendPixel(x, y, shadow, 0.11);
      } else if (x > 36 && x < 92 && y > 28 && y < 100) {
        surf.blendPixel(x, y, light, clamp(0.14 + d * 0.05, 0, 0.22));
      }
      // Subtle knuckle/finger crease warm tone near lower half
      if (y >= 72 && y <= 84) {
        const band = 1 - Math.abs(y - 78) / 6;
        surf.blendPixel(x, y, knuckle, band * 0.18);
      }
    }
  }
  return surf.toCanvasTexture();
}

export function createHairTexture(hairColor, definition) {
  const surf = new PixelSurface(128, 128);
  const base = hexToRgb(hairColor);
  const dark = scaleRgb(base, 0.62);
  const deep = scaleRgb(base, 0.48);
  const light = scaleRgb(base, 1.32, 12, 10, 8);
  const silver = [216, 224, 234];

  surf.fill(base);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const d = bayer4(x, y);
      const waveAmp = definition.wavyHair ? 3.2 : definition.slickHair ? 0.4 : 1.0;
      const strand = (x + Math.floor(Math.sin(y * 0.17) * waveAmp)) % 6;
      if (strand === 0 || strand === 1) {
        surf.blendPixel(x, y, dark, 0.58);
      } else if (strand === 3) {
        const hi = definition.id === "tajani" ? silver : light;
        surf.blendPixel(x, y, hi, 0.48);
      } else if (strand === 4 && (definition.id === "conte" || definition.id === "calenda" || definition.id === "bonelli") && (x < 24 || x > 104)) {
        surf.blendPixel(x, y, silver, 0.34);
      }
      // Classic PS1 Tekken 3 horizontal anisotropic hair sheen band across crown
      const sheenBand = Math.exp(-Math.pow((y - 44) / 14, 2));
      if (sheenBand > 0.15 && strand >= 2 && strand <= 4) {
        const sheenCol = definition.id === "tajani" ? [242, 246, 252] : light;
        surf.blendPixel(x, y, sheenCol, clamp(sheenBand * 0.46 + d * 0.08, 0, 0.6));
      }
      // Darker root & nape depth
      if (y > 92) surf.blendPixel(x, y, deep, ((y - 92) / 36) * 0.55);
      if (y < 14) surf.blendPixel(x, y, dark, ((14 - y) / 14) * 0.32);
    }
  }
  return surf.toCanvasTexture();
}

export function createShirtTexture(shirtColor) {
  const surf = new PixelSurface(128, 128);
  const base = hexToRgb(shirtColor);
  const weave = scaleRgb(base, 0.88);
  const shadow = scaleRgb(base, 0.78);
  const button = [208, 204, 196];
  const buttonRim = [148, 144, 138];

  surf.fill(base);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      if ((x + y) % 2 === 0) surf.blendPixel(x, y, weave, 0.24);
      if (x === 61 || x === 67) surf.blendPixel(x, y, shadow, 0.52);
      if (y < 20) surf.blendPixel(x, y, shadow, ((20 - y) / 20) * 0.32);
    }
  }
  for (const by of [36, 62, 88, 112]) {
    surf.blendEllipse(64, by, 2.2, 2.2, buttonRim, 0.85, 0.8);
    surf.blendEllipse(64, by, 1.4, 1.4, button, 0.95, 0.5);
  }
  return surf.toCanvasTexture();
}

export function createShoeTexture(shoeColor = "#1f1d25") {
  const surf = new PixelSurface(128, 128);
  const base = hexToRgb(shoeColor);
  const hi = scaleRgb(base, 1.65, 14, 14, 18);
  const seam = scaleRgb(base, 0.62);
  const sole = [12, 10, 16];
  const welt = [72, 52, 34];

  surf.fill(base);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const d = bayer4(x, y);
      if (y < 22) {
        surf.blendPixel(x, y, sole, 0.90);
      } else if (y >= 22 && y <= 26) {
        // Stitched leather welt trim
        surf.blendPixel(x, y, x % 4 === 0 ? seam : welt, 0.82);
      } else if (y > 76 && y < 106 && x > 38 && x < 90) {
        // Polished toe-cap specular sheen
        const glow = 1 - Math.hypot((x - 64) / 26, (y - 91) / 15);
        if (glow > 0) surf.blendPixel(x, y, hi, clamp(glow * 0.42 + d * 0.06, 0, 0.52));
      }
      // Toe cap stitch line
      if (y === 82 && x > 30 && x < 98) {
        surf.blendPixel(x, y, x % 3 === 0 ? hi : seam, 0.58);
      }
    }
  }
  // Crisp oxford lace bars across vamp
  for (const ly of [44, 52, 60, 68]) {
    surf.drawSegment(54, ly, 74, ly, 0.9, seam, 0.85);
    surf.blendPixel(53, ly, hi, 0.65);
    surf.blendPixel(75, ly, hi, 0.65);
  }
  return surf.toCanvasTexture();
}

/**
 * Generate the full set of 128x128 NearestFilter PS1 textures for one fighter.
 */
export function generateFighterTextures(definition) {
  const tiePattern =
    definition.id === "conte" || definition.id === "tajani" ? "dots" :
    definition.id === "schlein" || definition.id === "meloni" ? "jacquard" :
    "regimental";
  const shoeTone = definition.id === "bonelli" || definition.id === "calenda" ? "#2e221e" : "#1d1b24";
  return {
    face: createFaceTexture(definition),
    suit: createSuitTexture(definition.suit, definition.accent, { buttons: true }),
    sleeve: createSuitTexture(definition.id === "salvini" ? "#d8dfdf" : definition.suit, null),
    tie: createTieTexture(definition.tie, definition.accent, tiePattern),
    trousers: createTrouserTexture(getTrouserColor(definition)),
    skin: createSkinTexture(definition.skin),
    hair: createHairTexture(definition.hair, definition),
    shirt: createShirtTexture("#f2eee4"),
    shoe: createShoeTexture(shoeTone)
  };
}

/**
 * Bake PS1-style Gouraud vertex colors into a BufferGeometry.
 * When a material has `map`, pass `baseColor = "#ffffff"` so vertex colors act as
 * clean Gouraud light/shadow multipliers without double-darkening the texture.
 */
export function applyGouraudShading(geometry, baseColor, shadeFn) {
  if (!geometry.attributes.normal) {
    geometry.computeVertexNormals();
  }
  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;
  const base = makeColor(baseColor);
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = norm.getX(i);
    const ny = norm.getY(i);
    const nz = norm.getZ(i);

    let factor = 0.85 + 0.18 * ny + 0.08 * nz;
    let tint = base;
    if (shadeFn) {
      const result = shadeFn(x, y, z, nx, ny, nz);
      if (typeof result === "number") {
        factor = result;
      } else if (result) {
        factor = result.factor ?? factor;
        if (result.color) tint = result.color;
      }
    }
    colors[i * 3] = clamp(tint.r * factor, 0, 1);
    colors[i * 3 + 1] = clamp(tint.g * factor, 0, 1);
    colors[i * 3 + 2] = clamp(tint.b * factor, 0, 1);
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function gouraudMaterial(options = {}) {
  return new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: options.map ?? null,
    roughness: options.roughness ?? 0.78,
    metalness: options.metalness ?? 0.04,
    vertexColors: true,
    flatShading: false,
    side: options.side ?? THREE.FrontSide,
    emissive: options.emissive ?? "#000000",
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1
  });
}

function buildShadedMesh(geometry, baseColor, shadeFn, materialOptions = {}) {
  const vertexBase = materialOptions.map ? "#ffffff" : baseColor;
  applyGouraudShading(geometry, vertexBase, shadeFn);
  const mesh = new THREE.Mesh(geometry, gouraudMaterial(materialOptions));
  mesh.castShadow = materialOptions.castShadow !== false;
  mesh.receiveShadow = materialOptions.receiveShadow !== false;
  return mesh;
}

/**
 * Create a vertex-sculpted anatomical limb with PS1 Gouraud vertex shading.
 * Modifies CylinderGeometry vertex positions directly to form realistic
 * deltoid, biceps/triceps, forearm, quadriceps, and gastrocnemius contours.
 */
export function createSculptedLimb(
  topRadius,
  midRadius,
  bottomRadius,
  length,
  radialSegments,
  heightSegments,
  baseColor,
  options = {}
) {
  const rSeg = Math.max(6, Math.round(radialSegments));
  const hSeg = Math.max(2, Math.round(heightSegments));
  const geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, length, rSeg, hSeg, false);
  const pos = geometry.attributes.position;
  const anatomy = options.anatomy || "generic";
  const side = options.side ?? 1;
  const trouserCrease = Boolean(options.trouserCrease);
  const minR = Math.min(topRadius, midRadius, bottomRadius) * 0.65;

  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const rCurr = Math.hypot(x, z);
    if (rCurr < 1e-5) continue;

    const t = clamp((y + length / 2) / length, 0, 1);
    const angle = Math.atan2(x, z);
    const front = Math.cos(angle);
    const outer = Math.sin(angle) * side;

    const w0 = (1 - t) * (1 - 2 * t);
    const w1 = 4 * t * (1 - t);
    const w2 = t * (2 * t - 1);
    const baseR = Math.max(minR, bottomRadius * w0 + midRadius * w1 + topRadius * w2);

    let radialBoost = 0;
    let rxScale = 1;
    let rzScale = 1;

    if (anatomy === "upperArm") {
      const deltoid = Math.exp(-Math.pow((t - 0.82) / 0.16, 2));
      radialBoost += deltoid * topRadius * (0.20 + 0.28 * Math.max(0, outer));
      const biceps = Math.exp(-Math.pow((t - 0.48) / 0.22, 2));
      radialBoost += biceps * midRadius * (0.14 * Math.max(0, front) + 0.11 * Math.max(0, -front));
      rxScale = 0.92;
      rzScale = 1.06;
    } else if (anatomy === "forearm") {
      const flexor = Math.exp(-Math.pow((t - 0.68) / 0.19, 2));
      radialBoost += flexor * midRadius * (0.16 + 0.10 * Math.max(0, front));
      const wristFlat = 1 - Math.min(1, t / 0.35);
      rxScale = 1 - 0.16 * wristFlat;
      rzScale = 1 + 0.08 * wristFlat;
    } else if (anatomy === "thigh") {
      const quad = Math.exp(-Math.pow((t - 0.56) / 0.25, 2));
      radialBoost += quad * midRadius * (0.08 + 0.17 * Math.max(0, front) + 0.12 * Math.max(0, outer));
      const hamstring = Math.exp(-Math.pow((t - 0.62) / 0.22, 2));
      radialBoost += hamstring * midRadius * 0.09 * Math.max(0, -front);
      if (trouserCrease) {
        radialBoost += Math.pow(Math.abs(front), 8) * 0.011 * (0.4 + 0.6 * (1 - t * 0.4));
      }
      rxScale = 0.96;
      rzScale = 1.04;
    } else if (anatomy === "calf") {
      const gastro = Math.exp(-Math.pow((t - 0.66) / 0.18, 2));
      radialBoost += gastro * midRadius * (0.07 + 0.26 * Math.max(0, -front) + 0.08 * Math.abs(outer));
      radialBoost += Math.pow(Math.max(0, front), 4) * 0.008;
      if (trouserCrease) {
        radialBoost += Math.pow(Math.abs(front), 8) * 0.010 * Math.sin(t * Math.PI);
        if (t < 0.13) {
          radialBoost += 0.008 * Math.sin((t / 0.13) * Math.PI);
        }
      }
      rxScale = 0.94;
      rzScale = 1.05;
    } else if (anatomy === "neck") {
      const trapBase = Math.exp(-Math.pow(t / 0.28, 2));
      radialBoost += trapBase * bottomRadius * 0.16;
      rxScale = 0.95;
      rzScale = 1.05;
    } else {
      const belly = Math.exp(-Math.pow((t - 0.6) / 0.23, 2));
      radialBoost += belly * midRadius * (0.08 + 0.06 * Math.abs(front));
      rxScale = 0.96;
      rzScale = 1.04;
    }

    const rTarget = Math.max(0.004, baseR + radialBoost);
    const scale = rTarget / rCurr;
    pos.setX(i, x * scale * rxScale);
    pos.setZ(i, z * scale * rzScale);
  }

  geometry.computeVertexNormals();

  return buildShadedMesh(
    geometry,
    baseColor,
    (x, y, z, nx, ny, nz) => {
      const t = clamp((y + length / 2) / length, 0, 1);
      const r = Math.hypot(x, z) || 1;
      const innerFactor = Math.max(0, -(x / r) * side);
      let shade = 0.92 + 0.10 * ny + 0.06 * nz - 0.16 * innerFactor;

      if (anatomy === "neck") {
        shade -= Math.max(0, (t - 0.55) / 0.45) * 0.26;
      } else if (anatomy === "calf" || trouserCrease) {
        const lowerDark = anatomy === "calf" ? (1 - t) * 0.24 : (1 - t) * 0.08;
        const creaseHighlight = trouserCrease ? Math.pow(Math.abs(z / r), 8) * 0.07 : 0;
        shade += creaseHighlight - lowerDark;
      } else {
        shade += t * 0.06 - (1 - t) * 0.06;
      }
      return clamp(shade, 0.54, 1.08);
    },
    options.material
  );
}

/**
 * Loft closed cross-section rings into a solid watertight BufferGeometry with clean UVs.
 * Each ring has N `[x, y, z]` vertices ordered CCW around +Y.
 */
function createLoftedGeometry(rings, closeBottom = true, closeTop = true) {
  const ringCount = rings.length;
  const radialCount = rings[0].length;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let r = 0; r < ringCount; r += 1) {
    const v = ringCount > 1 ? r / (ringCount - 1) : 0.5;
    for (let i = 0; i < radialCount; i += 1) {
      const [x, y, z] = rings[r][i];
      positions.push(x, y, z);
      uvs.push(i / radialCount, v);
    }
  }

  for (let r = 0; r < ringCount - 1; r += 1) {
    const row0 = r * radialCount;
    const row1 = (r + 1) * radialCount;
    for (let i = 0; i < radialCount; i += 1) {
      const next = (i + 1) % radialCount;
      const a = row0 + i;
      const b = row0 + next;
      const c = row1 + next;
      const d = row1 + i;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  if (closeBottom) {
    const centerIdx = positions.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (const [x, y, z] of rings[0]) {
      cx += x; cy += y; cz += z;
    }
    positions.push(cx / radialCount, cy / radialCount, cz / radialCount);
    uvs.push(0.5, 0);
    for (let i = 0; i < radialCount; i += 1) {
      const next = (i + 1) % radialCount;
      indices.push(centerIdx, next, i);
    }
  }

  if (closeTop) {
    const topStart = (ringCount - 1) * radialCount;
    const centerIdx = positions.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (const [x, y, z] of rings[ringCount - 1]) {
      cx += x; cy += y; cz += z;
    }
    positions.push(cx / radialCount, cy / radialCount, cz / radialCount);
    uvs.push(0.5, 1);
    for (let i = 0; i < radialCount; i += 1) {
      const next = (i + 1) % radialCount;
      indices.push(centerIdx, topStart + i, topStart + next);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createSculptedPelvis(trouserColor, widthScale, trouserTex) {
  const radial = 16;
  const levels = [
    { y: -0.08, rx: 0.135 * widthScale, rz: 0.095 },
    { y: -0.02, rx: 0.165 * widthScale, rz: 0.110 },
    { y: 0.04, rx: 0.162 * widthScale, rz: 0.108 },
    { y: 0.08, rx: 0.155 * widthScale, rz: 0.103 },
    { y: 0.11, rx: 0.148 * widthScale, rz: 0.098 }
  ];
  const rings = levels.map((lvl) => {
    const ring = [];
    for (let i = 0; i < radial; i += 1) {
      const theta = (i / radial) * Math.PI * 2;
      const sx = Math.sin(theta);
      const cz = Math.cos(theta);
      const x = Math.sign(sx) * Math.pow(Math.abs(sx), 0.85) * lvl.rx;
      let z = Math.sign(cz) * Math.pow(Math.abs(cz), 0.88) * lvl.rz;
      if (cz < -0.2 && lvl.y < 0.05) z -= 0.012;
      ring.push([x, lvl.y, z]);
    }
    return ring;
  });

  const beltColor = makeColor("#1e1b24");
  const buckleColor = makeColor("#d4b162");
  const pelvisGeo = createLoftedGeometry(rings, true, true);
  return buildShadedMesh(
    pelvisGeo,
    trouserColor,
    (x, y, z, nx, ny) => {
      if (y > 0.045 && y < 0.095) {
        const isBuckle = Math.abs(x) < 0.026 && z > 0.085;
        return { factor: isBuckle ? 1.45 : 0.72, color: isBuckle ? buckleColor : beltColor };
      }
      const groinShadow = y < -0.03 ? 0.65 : 1.0;
      return clamp((0.90 + 0.12 * ny) * groinShadow, 0.55, 1.05);
    },
    { map: trouserTex }
  );
}

function createSculptedJacket(suitColor, widthScale, suitTex) {
  const radial = 24;
  const heightSteps = 11;
  const rings = [];

  for (let h = 0; h <= heightSteps; h += 1) {
    const t = h / heightSteps;
    const y = -0.105 + t * 0.795;

    let rx, rz;
    if (t < 0.34) {
      const u = t / 0.34;
      rx = THREE.MathUtils.lerp(0.186, 0.152, u) * widthScale;
      rz = THREE.MathUtils.lerp(0.120, 0.104, u);
    } else if (t < 0.80) {
      const u = (t - 0.34) / 0.46;
      const smooth = u * u * (3 - 2 * u);
      rx = THREE.MathUtils.lerp(0.152, 0.252, smooth) * widthScale;
      rz = THREE.MathUtils.lerp(0.104, 0.146, smooth);
    } else if (t < 0.92) {
      const u = (t - 0.80) / 0.12;
      rx = THREE.MathUtils.lerp(0.252, 0.224, u) * widthScale;
      rz = THREE.MathUtils.lerp(0.146, 0.114, u);
    } else {
      const u = (t - 0.92) / 0.08;
      rx = THREE.MathUtils.lerp(0.224, 0.096, u * u);
      rz = THREE.MathUtils.lerp(0.114, 0.086, u);
    }

    const vOpenWidth = t > 0.46 ? THREE.MathUtils.lerp(0.010, 0.078, (t - 0.46) / 0.54) : 0;
    const hemSplitWidth = t < 0.20 ? THREE.MathUtils.lerp(0.046, 0.008, t / 0.20) : 0;
    const ring = [];
    for (let i = 0; i < radial; i += 1) {
      const theta = (i / radial) * Math.PI * 2;
      const sx = Math.sin(theta);
      const cz = Math.cos(theta);
      const x = Math.sign(sx) * Math.pow(Math.abs(sx), 0.83) * rx;
      let z = Math.sign(cz) * Math.pow(Math.abs(cz), 0.87) * rz;

      if (cz > 0.2 && t > 0.50 && t < 0.86) {
        z += Math.sin(((t - 0.50) / 0.36) * Math.PI) * 0.017 * cz;
      }
      if (cz < -0.5 && Math.abs(x) < 0.048 && t > 0.25 && t < 0.88) {
        z += 0.013 * (1 - Math.abs(x) / 0.048);
      }
      if (cz > 0.25 && t > 0.46 && Math.abs(x) < vOpenWidth) {
        const depthBlend = 1 - Math.abs(x) / Math.max(vOpenWidth, 0.001);
        z -= 0.048 * (0.4 + 0.6 * depthBlend);
      }
      // Tailored lower front quarters notch so the leather belt & brass buckle peek through cleanly
      if (cz > 0.62 && t < 0.20 && Math.abs(x) < hemSplitWidth) {
        const splitBlend = 1 - Math.abs(x) / Math.max(hemSplitWidth, 0.001);
        z -= 0.026 * (1 - t / 0.20) * (0.4 + 0.6 * splitBlend);
      }

      ring.push([x, y, z]);
    }
    rings.push(ring);
  }

  const geometry = createLoftedGeometry(rings, true, true);
  // Shift UVs by +0.5 in U so canvas x=64 (with tailored buttons) sits at front center (+Z)
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setX(i, (uv.getX(i) + 0.5) % 1);
  }

  return buildShadedMesh(
    geometry,
    suitColor,
    (x, y, z, nx, ny, nz) => {
      const t = clamp((y + 0.105) / 0.795, 0, 1);
      const inVNeck = z < 0.105 && z > 0.02 && t > 0.46 && Math.abs(x) < 0.086;
      const underarm = Math.abs(x) > 0.16 && t > 0.45 && t < 0.76 ? 0.18 : 0;
      const hemDark = t < 0.26 ? (0.26 - t) * 0.85 : 0;
      const vNeckShadow = inVNeck ? 0.28 : 0;
      const chestHighlight = nz > 0.4 && t > 0.55 && t < 0.86 ? 0.10 : 0;
      const waistPinch = t > 0.28 && t < 0.48 && Math.abs(x) > 0.10 ? 0.08 : 0;
      return clamp(0.90 + 0.13 * ny + chestHighlight - underarm - hemDark - vNeckShadow - waistPinch, 0.48, 1.10);
    },
    { map: suitTex }
  );
}

function createSuitCollarRoll(suitColor, suitTex) {
  // Tailored low-poly jacket collar wrapping around the back & sides of the neck to meet the lapels
  return createTaperedStrand(
    [
      [-0.074, 0.672, 0.076],
      [-0.094, 0.686, 0.015],
      [-0.072, 0.696, -0.068],
      [0.0, 0.702, -0.094],
      [0.072, 0.696, -0.068],
      [0.094, 0.686, 0.015],
      [0.074, 0.672, 0.076]
    ],
    [0.016, 0.018, 0.020, 0.021, 0.020, 0.018, 0.016],
    [0.018, 0.020, 0.022, 0.023, 0.022, 0.020, 0.018],
    6,
    suitColor,
    0.04,
    suitTex
  );
}

function createJacketDetails(suitColor, widthScale, suitTex, definition) {
  const group = new THREE.Group();
  // Tailored hip pocket flaps (skip on Renzi's rolled-sleeve shirt look)
  if (definition.id !== "renzi") {
    for (const s of [-1, 1]) {
      const flap = createTaperedStrand(
        [
          [s * 0.082 * widthScale, 0.085, 0.114],
          [s * 0.132 * widthScale, 0.082, 0.096],
          [s * 0.166 * widthScale, 0.084, 0.056]
        ],
        [0.012, 0.014, 0.010],
        [0.014, 0.016, 0.012],
        5,
        suitColor,
        -0.06,
        suitTex
      );
      group.add(flap);
    }
    // Two crisp 3D low-poly jacket buttons along center front
    for (const [by, bz] of [[0.235, 0.132], [0.115, 0.119]]) {
      const btnGeo = new THREE.CylinderGeometry(0.011, 0.012, 0.008, 6);
      const btn = buildShadedMesh(
        btnGeo,
        definition.id === "meloni" || definition.id === "schlein" ? "#d7b45c" : "#1f1d24",
        (x, y, z, nx, ny) => clamp(0.88 + 0.18 * ny, 0.62, 1.15),
        { roughness: 0.32, metalness: 0.35 }
      );
      btn.rotation.x = Math.PI / 2;
      btn.position.set(0.004, by, bz);
      group.add(btn);
    }
  }
  return group;
}

function createSculptedShoulderCap(suitColor, side, tex) {
  const geo = new THREE.SphereGeometry(0.084, 10, 8);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    // Tailored Italian suit shoulder pad silhouette: crisp flat-ish top, tapered outer deltoid
    if (y > 0) y *= 0.82;
    if (x * side > 0) x *= 1.12;
    z *= 1.06;
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return buildShadedMesh(
    geo,
    suitColor,
    (x, y, z, nx, ny, nz) => {
      const under = ny < -0.25 ? 0.24 : 0;
      const topHi = ny > 0.35 ? 0.10 : 0;
      return clamp(0.90 + 0.12 * ny + 0.05 * nz + topHi - under, 0.54, 1.10);
    },
    { map: tex }
  );
}

function createLapelMesh(side, widthScale, suitColor, suitTex) {
  const s = side;
  const xBase = s * 0.012;
  const xNotch = s * 0.098 * Math.min(widthScale, 1.06);
  const xPeak = s * 0.108 * Math.min(widthScale, 1.06);
  const xCollar = s * 0.072;
  const xInnerMid = s * 0.046;

  const pts = [
    [xBase, 0.275, 0.140],
    [xInnerMid, 0.49, 0.148],
    [xCollar, 0.675, 0.088],
    [xNotch, 0.585, 0.132],
    [xPeak, 0.485, 0.146],
    [xBase, 0.275, 0.120],
    [xInnerMid * 0.85, 0.49, 0.124],
    [xCollar * 0.9, 0.675, 0.068],
    [xNotch * 0.95, 0.585, 0.112],
    [xPeak * 0.95, 0.485, 0.122]
  ];
  const lapelUvs = [
    0.1, 0.0,  0.35, 0.55,  0.5, 1.0,  0.85, 0.78,  0.95, 0.52,
    0.1, 0.0,  0.35, 0.55,  0.5, 1.0,  0.85, 0.78,  0.95, 0.52
  ];

  const positions = pts.flat();
  const frontTris = s > 0
    ? [
        0, 4, 1,  1, 4, 3,  1, 3, 2,
        5, 6, 9,  6, 8, 9,  6, 7, 8,
        0, 5, 9,  0, 9, 4,
        4, 9, 8,  4, 8, 3,
        3, 8, 7,  3, 7, 2,
        0, 1, 6,  0, 6, 5,
        1, 2, 7,  1, 7, 6
      ]
    : [
        0, 1, 4,  1, 3, 4,  1, 2, 3,
        5, 9, 6,  6, 9, 8,  6, 8, 7,
        0, 9, 5,  0, 4, 9,
        4, 8, 9,  4, 3, 8,
        3, 7, 8,  3, 2, 7,
        0, 6, 1,  0, 5, 6,
        1, 7, 2,  1, 6, 7
      ];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(lapelUvs, 2));
  geometry.setIndex(frontTris);
  geometry.computeVertexNormals();

  return buildShadedMesh(
    geometry,
    suitColor,
    (x, y, z, nx, ny, nz) => {
      const isUnderside = nz < 0.2 || z < 0.126;
      const baseShade = isUnderside ? 0.56 : 0.96 + 0.08 * ny + 0.06 * nz;
      const tipShadow = y < 0.34 ? -0.10 : 0;
      return clamp(baseShade + tipShadow, 0.50, 1.08);
    },
    { side: THREE.DoubleSide, map: suitTex }
  );
}

function createShirtChestAndCollar(shirtColor = "#f2eee4", shirtTex) {
  const group = new THREE.Group();

  const rings = [];
  const radial = 10;
  for (let h = 0; h <= 4; h += 1) {
    const t = h / 4;
    const y = 0.27 + t * 0.41;
    const w = THREE.MathUtils.lerp(0.030, 0.084, t);
    const zFront = THREE.MathUtils.lerp(0.128, 0.090, Math.pow(t, 1.3));
    const ring = [];
    for (let i = 0; i < radial; i += 1) {
      const theta = (i / radial) * Math.PI * 2;
      const x = Math.sin(theta) * w;
      const z = zFront - 0.025 + Math.cos(theta) * 0.032;
      ring.push([x, y, z]);
    }
    rings.push(ring);
  }
  const shirtGeo = createLoftedGeometry(rings, true, true);
  group.add(
    buildShadedMesh(
      shirtGeo,
      shirtColor,
      (x, y, z, nx, ny, nz) => {
        const underLapelShadow = Math.abs(x) > 0.025 ? 0.18 : 0;
        const underChinShadow = y > 0.62 ? 0.18 : 0;
        return clamp(0.95 + 0.07 * nz - underLapelShadow - underChinShadow, 0.58, 1.06);
      },
      { map: shirtTex }
    )
  );

  const collarRings = [];
  const cRad = 14;
  for (let h = 0; h <= 2; h += 1) {
    const t = h / 2;
    const y = 0.665 + t * 0.062;
    const rx = THREE.MathUtils.lerp(0.082, 0.072, t);
    const rz = THREE.MathUtils.lerp(0.084, 0.074, t);
    const ring = [];
    for (let i = 0; i < cRad; i += 1) {
      const theta = (i / cRad) * Math.PI * 2;
      ring.push([Math.sin(theta) * rx, y, 0.006 + Math.cos(theta) * rz]);
    }
    collarRings.push(ring);
  }
  group.add(
    buildShadedMesh(
      createLoftedGeometry(collarRings, true, true),
      shirtColor,
      (x, y) => (y < 0.685 ? 0.72 : 0.96),
      { map: shirtTex }
    )
  );

  for (const s of [-1, 1]) {
    const pts = [
      s * 0.015, 0.695, 0.086,
      s * 0.064, 0.690, 0.076,
      s * 0.048, 0.625, 0.106,
      s * 0.016, 0.648, 0.102,
      s * 0.015, 0.695, 0.072,
      s * 0.064, 0.690, 0.062,
      s * 0.048, 0.625, 0.090,
      s * 0.016, 0.648, 0.088
    ];
    const uvs = [0, 1, 1, 1, 0.8, 0, 0.2, 0.2, 0, 1, 1, 1, 0.8, 0, 0.2, 0.2];
    const idx = s > 0
      ? [0, 3, 2, 0, 2, 1, 4, 6, 7, 4, 5, 6, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
      : [0, 2, 3, 0, 1, 2, 4, 7, 6, 4, 6, 5, 0, 5, 1, 0, 4, 5, 1, 6, 2, 1, 5, 6, 2, 7, 3, 2, 6, 7, 3, 4, 0, 3, 7, 4];
    const tipGeo = new THREE.BufferGeometry();
    tipGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    tipGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    tipGeo.setIndex(idx);
    tipGeo.computeVertexNormals();
    group.add(
      buildShadedMesh(
        tipGeo,
        shirtColor,
        (x, y, z, nx, ny, nz) => (nz < 0 ? 0.64 : clamp(0.95 - (0.69 - y) * 1.4, 0.72, 1.04)),
        { map: shirtTex }
      )
    );
  }

  return group;
}

function createKnottedTie(tieColor, tieTex) {
  const group = new THREE.Group();

  const knotRings = [
    [[-0.016, 0.620, 0.108], [0, 0.620, 0.126], [0.016, 0.620, 0.108], [0, 0.620, 0.095]],
    [[-0.028, 0.668, 0.096], [0, 0.668, 0.118], [0.028, 0.668, 0.096], [0, 0.668, 0.082]]
  ];
  group.add(
    buildShadedMesh(
      createLoftedGeometry(knotRings, true, true),
      tieColor,
      (x, y, z, nx, ny, nz) => clamp(0.88 + 0.12 * ny + 0.08 * nz - (y < 0.635 ? 0.16 : 0), 0.56, 1.08),
      { map: tieTex, roughness: 0.45 }
    )
  );

  const bladeSpecs = [
    { y: 0.285, w: 0.004, zF: 0.138, zB: 0.128 },
    { y: 0.340, w: 0.036, zF: 0.147, zB: 0.132 },
    { y: 0.450, w: 0.030, zF: 0.149, zB: 0.132 },
    { y: 0.555, w: 0.023, zF: 0.138, zB: 0.121 },
    { y: 0.625, w: 0.017, zF: 0.124, zB: 0.108 }
  ];
  const bladeRings = bladeSpecs.map((s) => [
    [-s.w, s.y, (s.zF + s.zB) * 0.5],
    [0, s.y, s.zF],
    [s.w, s.y, (s.zF + s.zB) * 0.5],
    [0, s.y, s.zB]
  ]);
  group.add(
    buildShadedMesh(
      createLoftedGeometry(bladeRings, true, true),
      tieColor,
      (x, y, z, nx, ny, nz) => {
        const underKnot = y > 0.59 ? (y - 0.59) * 5.0 : 0;
        const tipShadow = y < 0.33 ? 0.12 : 0;
        return clamp(0.94 + 0.10 * nz - underKnot - tipShadow, 0.56, 1.08);
      },
      { map: tieTex, roughness: 0.45 }
    )
  );

  return group;
}

function createTrapezius(suitColor, widthScale, suitTex) {
  const rings = [];
  const radial = 14;
  const levels = [
    { y: 0.58, rx: 0.235 * widthScale, rz: 0.095 },
    { y: 0.65, rx: 0.175 * widthScale, rz: 0.084 },
    { y: 0.72, rx: 0.072, rz: 0.072 }
  ];
  for (const lvl of levels) {
    const ring = [];
    for (let i = 0; i < radial; i += 1) {
      const theta = (i / radial) * Math.PI * 2;
      ring.push([Math.sin(theta) * lvl.rx, lvl.y, Math.cos(theta) * lvl.rz]);
    }
    rings.push(ring);
  }
  return buildShadedMesh(
    createLoftedGeometry(rings, true, true),
    suitColor,
    (x, y, z, nx, ny) => clamp(0.88 + 0.14 * ny + (y - 0.62) * 0.5, 0.62, 1.06),
    { map: suitTex }
  );
}

function createSculptedKnee(trouserColor, tex) {
  const geo = new THREE.SphereGeometry(0.068, 10, 8);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    let z = pos.getZ(i);
    if (z > 0) z *= 1.15;
    pos.setX(i, x * 0.92);
    pos.setY(i, y * 1.12);
    pos.setZ(i, z);
  }
  geo.computeVertexNormals();
  return buildShadedMesh(
    geo,
    trouserColor,
    (x, y, z, nx, ny, nz) => {
      const backCrease = nz < -0.2 ? 0.22 : 0;
      return clamp(0.90 + 0.10 * ny + 0.06 * nz - backCrease, 0.58, 1.05);
    },
    { map: tex }
  );
}

function createSculptedShoe(side, shoeTex) {
  const group = new THREE.Group();

  const slices = [
    { z: -0.095, w: 0.048, yBot: -0.078, yTop: 0.025 },
    { z: -0.055, w: 0.054, yBot: -0.078, yTop: 0.028 },
    { z: 0.005, w: 0.052, yBot: -0.072, yTop: 0.015 },
    { z: 0.065, w: 0.057, yBot: -0.118, yTop: -0.015 },
    { z: 0.125, w: 0.044, yBot: -0.115, yTop: -0.036 },
    { z: 0.162, w: 0.024, yBot: -0.102, yTop: -0.055 }
  ];

  const radial = 8;
  const rings = slices.map((s) => {
    const yMid = (s.yBot + s.yTop) * 0.5;
    const hHalf = (s.yTop - s.yBot) * 0.5;
    const ring = [];
    for (let i = 0; i < radial; i += 1) {
      const a = (i / radial) * Math.PI * 2;
      const sx = Math.sin(a);
      const cy = Math.cos(a);
      const y = cy < 0 ? s.yBot : yMid + Math.pow(cy, 0.8) * hHalf;
      const x = Math.sign(sx) * Math.pow(Math.abs(sx), 0.78) * s.w;
      ring.push([x, y, s.z]);
    }
    return ring;
  });

  const positions = [];
  const uvs = [];
  const indices = [];
  for (let r = 0; r < rings.length; r += 1) {
    const v = r / (rings.length - 1);
    for (let i = 0; i < radial; i += 1) {
      const [x, y, z] = rings[r][i];
      positions.push(x, y, z);
      uvs.push(i / radial, v);
    }
  }
  for (let r = 0; r < rings.length - 1; r += 1) {
    const row0 = r * radial;
    const row1 = (r + 1) * radial;
    for (let i = 0; i < radial; i += 1) {
      const next = (i + 1) % radial;
      indices.push(row0 + i, row1 + i, row1 + next);
      indices.push(row0 + i, row1 + next, row0 + next);
    }
  }
  const backCenter = positions.length / 3;
  positions.push(0, -0.026, -0.095);
  uvs.push(0.5, 0);
  for (let i = 0; i < radial; i += 1) {
    indices.push(backCenter, i, (i + 1) % radial);
  }
  const frontStart = (rings.length - 1) * radial;
  const frontCenter = positions.length / 3;
  positions.push(0, -0.075, 0.162);
  uvs.push(0.5, 1);
  for (let i = 0; i < radial; i += 1) {
    indices.push(frontCenter, frontStart + ((i + 1) % radial), frontStart + i);
  }

  const upperGeo = new THREE.BufferGeometry();
  upperGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  upperGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  upperGeo.setIndex(indices);
  upperGeo.computeVertexNormals();
  group.add(
    buildShadedMesh(
      upperGeo,
      "#1f1d25",
      (x, y, z, nx, ny) => {
        if (y < -0.088) return 0.54;
        const vampHighlight = ny > 0.35 && z > 0.02 ? 0.22 : 0;
        return clamp(0.86 + 0.14 * ny + vampHighlight, 0.52, 1.15);
      },
      { roughness: 0.34, metalness: 0.16, map: shoeTex }
    )
  );

  // Dark dress sock collar bridging ankle seam smoothly into trouser hem
  const sockCollar = createSculptedLimb(0.044, 0.043, 0.042, 0.065, 8, 2, "#1c1b24", {
    side,
    material: { roughness: 0.86, map: shoeTex }
  });
  sockCollar.position.set(0, 0.016, -0.014);
  group.add(sockCollar);

  const heelRings = [
    [[-0.044, -0.120, -0.022], [0.044, -0.120, -0.022], [0.042, -0.120, -0.094], [-0.042, -0.120, -0.094]],
    [[-0.048, -0.070, -0.020], [0.048, -0.070, -0.020], [0.046, -0.070, -0.096], [-0.046, -0.070, -0.096]]
  ];
  group.add(
    buildShadedMesh(
      createLoftedGeometry(heelRings, true, true),
      "#141218",
      (x, y, z, nx, ny) => (ny < -0.2 ? 0.52 : 0.76),
      { roughness: 0.52, map: shoeTex }
    )
  );

  group.rotation.y = side > 0 ? 0.28 : -0.14;
  return group;
}

function createSculptedFist(side, skinColor, cuffColor, skinTex, cuffTex, options = {}) {
  const isTajani = typeof options === "boolean" ? options : Boolean(options.isTajani);
  const hasWatch = typeof options === "object" && Boolean(options.watch);
  const group = new THREE.Group();
  const s = side;

  const cuff = createSculptedLimb(0.044, 0.043, 0.041, 0.055, 10, 2, cuffColor, {
    side: s,
    material: { roughness: 0.65, map: cuffTex }
  });
  cuff.position.set(0, 0.022, 0);
  group.add(cuff);

  if (hasWatch && s < 0) {
    const bandGeo = new THREE.CylinderGeometry(0.043, 0.042, 0.020, 8);
    const band = buildShadedMesh(
      bandGeo,
      "#c8a24a",
      (x, y, z, nx, ny, nz) => clamp(0.88 + 0.16 * nz + 0.10 * ny, 0.62, 1.15),
      { roughness: 0.28, metalness: 0.58 }
    );
    band.position.set(0, 0.024, 0);
    group.add(band);
  }

  if (isTajani) {
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i += 1) {
      const angle = Math.PI / 2 + (i * Math.PI) / 5;
      const radius = i % 2 ? 0.011 : 0.026;
      if (i === 0) star.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      else star.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    star.closePath();
    const starGeo = new THREE.ShapeGeometry(star);
    const starMesh = buildShadedMesh(
      starGeo,
      "#ffe064",
      () => 1.0,
      { emissive: "#c99214", emissiveIntensity: 0.65, side: THREE.DoubleSide }
    );
    starMesh.position.set(0, 0.022, 0.045);
    group.add(starMesh);
  }

  // 6-sided sculpted low-poly fist with knuckle ridge & curled fingers silhouette
  const fistRings = [
    [
      [-0.026 * s, -0.100, 0.020],
      [0.002 * s, -0.104, 0.030],
      [0.028 * s, -0.100, 0.022],
      [0.030 * s, -0.097, -0.020],
      [0.002 * s, -0.096, -0.026],
      [-0.024 * s, -0.097, -0.020]
    ],
    [
      [-0.036 * s, -0.058, 0.038],
      [0.004 * s, -0.064, 0.048],
      [0.042 * s, -0.068, 0.036],
      [0.040 * s, -0.062, -0.028],
      [0.002 * s, -0.056, -0.034],
      [-0.034 * s, -0.048, -0.026]
    ],
    [
      [-0.035 * s, -0.025, 0.032],
      [0.004 * s, -0.028, 0.040],
      [0.040 * s, -0.030, 0.030],
      [0.038 * s, -0.028, -0.026],
      [0.002 * s, -0.024, -0.031],
      [-0.033 * s, -0.020, -0.024]
    ],
    [
      [-0.031 * s, 0.004, 0.024],
      [0.0, 0.004, 0.030],
      [0.031 * s, 0.004, 0.024],
      [0.031 * s, 0.004, -0.022],
      [0.0, 0.004, -0.026],
      [-0.031 * s, 0.004, -0.022]
    ]
  ];
  const orientedFistRings = s < 0
    ? fistRings.map((ring) => [ring[2], ring[1], ring[0], ring[5], ring[4], ring[3]])
    : fistRings;
  const fistGeo = createLoftedGeometry(orientedFistRings, true, true);
  group.add(
    buildShadedMesh(
      fistGeo,
      skinColor,
      (x, y, z, nx, ny, nz) => {
        const innerPalm = x * s < 0 && z < 0.01 ? 0.24 : 0;
        const knuckleLight = y > -0.075 && y < -0.03 && nz > 0.2 ? 0.12 : 0;
        const fingerFold = y < -0.08 ? 0.12 : 0;
        return clamp(0.86 + 0.14 * ny + knuckleLight - innerPalm - fingerFold, 0.54, 1.10);
      },
      { map: skinTex }
    )
  );

  const thumbGeo = new THREE.CylinderGeometry(0.014, 0.019, 0.066, 6, 2);
  const tPos = thumbGeo.attributes.position;
  for (let i = 0; i < tPos.count; i += 1) {
    const ty = tPos.getY(i);
    if (ty > 0) {
      tPos.setX(i, tPos.getX(i) * 0.78);
      tPos.setZ(i, tPos.getZ(i) * 0.85);
    }
  }
  thumbGeo.computeVertexNormals();
  const thumb = buildShadedMesh(
    thumbGeo,
    skinColor,
    (x, y, z, nx, ny) => clamp(0.86 + 0.15 * ny, 0.58, 1.08),
    { map: skinTex }
  );
  thumb.position.set(-s * 0.033, -0.052, 0.032);
  thumb.rotation.set(0.38, 0, s * 0.68);
  group.add(thumb);

  return group;
}

function createTaperedStrand(spinePoints, radiiX, radiiZ, radialSegments, color, shadeBias = 0, tex = null) {
  const rings = [];
  for (let k = 0; k < spinePoints.length; k += 1) {
    const p = spinePoints[k];
    const rx = radiiX[k];
    const rz = radiiZ[k];

    const prev = spinePoints[Math.max(0, k - 1)];
    const next = spinePoints[Math.min(spinePoints.length - 1, k + 1)];
    const tangent = new THREE.Vector3(next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]).normalize();
    const ref = Math.abs(tangent.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const sideAxis = new THREE.Vector3().crossVectors(ref, tangent).normalize();
    const fwdAxis = new THREE.Vector3().crossVectors(sideAxis, tangent).normalize();

    const ring = [];
    for (let i = 0; i < radialSegments; i += 1) {
      const theta = (i / radialSegments) * Math.PI * 2;
      const sx = Math.sin(theta) * rx;
      const cz = Math.cos(theta) * rz;
      ring.push([
        p[0] + sideAxis.x * sx + fwdAxis.x * cz,
        p[1] + sideAxis.y * sx + fwdAxis.y * cz,
        p[2] + sideAxis.z * sx + fwdAxis.z * cz
      ]);
    }
    rings.push(ring);
  }

  const geo = createLoftedGeometry(rings, true, true);
  return buildShadedMesh(
    geo,
    color,
    (x, y, z, nx, ny, nz) => clamp(0.86 + 0.16 * ny + 0.06 * nz + shadeBias, 0.52, 1.10),
    { roughness: 0.68, map: tex }
  );
}

function createSculptedHairCap(hairColor, definition, hairTex) {
  const radial = 16;
  const rings = [];
  const levels = [
    { y: 0.015, rx: 0.105, rz: 0.118, zOff: -0.020, backDrop: 0.065 },
    { y: 0.095, rx: 0.114, rz: 0.125, zOff: -0.012, backDrop: 0.030 },
    { y: 0.165, rx: 0.114, rz: 0.125, zOff: -0.005, backDrop: 0.005 },
    { y: 0.218, rx: 0.090, rz: 0.101, zOff: -0.004, backDrop: 0 },
    { y: 0.252, rx: 0.042, rz: 0.048, zOff: -0.004, backDrop: 0 }
  ];

  const crownLift = definition.slickHair ? 0.022 : definition.wavyHair ? 0.016 : 0.008;

  for (let l = 0; l < levels.length; l += 1) {
    const lvl = levels[l];
    const ring = [];
    for (let i = 0; i < radial; i += 1) {
      const theta = (i / radial) * Math.PI * 2;
      const sx = Math.sin(theta);
      const cz = Math.cos(theta);
      let y = lvl.y + (l >= 2 ? crownLift * (l / 4) : 0);
      if (cz > 0.25 && l === 0) y += 0.095 * cz;
      if (cz > 0.3 && l === 1) y += 0.035 * cz;
      if (cz < -0.2) y -= lvl.backDrop * (-cz);

      let rx = lvl.rx;
      let rz = lvl.rz;
      if (definition.wavyHair && l >= 1 && l <= 3) {
        const wave = Math.sin(theta * 5) * 0.009;
        rx += wave;
        rz += wave;
      }
      if (definition.slickHair && l >= 2 && cz > 0) {
        y += 0.016 * cz;
      }
      ring.push([sx * rx, y, lvl.zOff + cz * rz]);
    }
    rings.push(ring);
  }

  return buildShadedMesh(
    createLoftedGeometry(rings, true, true),
    hairColor,
    (x, y, z, nx, ny) => {
      const napeDark = z < -0.05 && y < 0.08 ? 0.20 : 0;
      const templeDark = Math.abs(x) > 0.08 && y < 0.10 ? 0.10 : 0;
      return clamp(0.88 + 0.16 * ny - napeDark - templeDark, 0.54, 1.08);
    },
    { roughness: 0.65, map: hairTex }
  );
}

function createSculptedHair(definition, hairTex) {
  const group = new THREE.Group();
  const hairColor = definition.hair;
  group.add(createSculptedHairCap(hairColor, definition, hairTex));

  if (definition.id === "meloni") {
    // Sleek blonde side-parted bob: layered cheek-framing front locks, angled back layers, sweeping bangs
    for (const s of [-1, 1]) {
      group.add(
        createTaperedStrand(
          [[s * 0.078, 0.222, 0.025], [s * 0.120, 0.125, 0.034], [s * 0.122, 0.010, 0.024], [s * 0.098, -0.092, 0.008]],
          [0.032, 0.044, 0.038, 0.013],
          [0.052, 0.068, 0.056, 0.020],
          7,
          hairColor,
          0.02,
          hairTex
        )
      );
      group.add(
        createTaperedStrand(
          [[s * 0.064, 0.185, -0.065], [s * 0.098, 0.080, -0.092], [s * 0.088, -0.065, -0.096]],
          [0.044, 0.050, 0.022],
          [0.036, 0.042, 0.018],
          6,
          hairColor,
          -0.06,
          hairTex
        )
      );
    }
    // Center back bob curtain for full rear silhouette
    group.add(
      createTaperedStrand(
        [[0, 0.175, -0.098], [0, 0.065, -0.118], [0, -0.060, -0.106]],
        [0.064, 0.072, 0.042],
        [0.026, 0.032, 0.018],
        6,
        hairColor,
        -0.08,
        hairTex
      )
    );
    // Asymmetric side-swept blonde fringe
    group.add(
      createTaperedStrand(
        [[-0.045, 0.230, 0.092], [0.025, 0.200, 0.120], [0.096, 0.148, 0.104], [0.112, 0.075, 0.072]],
        [0.028, 0.032, 0.024, 0.010],
        [0.020, 0.025, 0.018, 0.009],
        6,
        hairColor,
        0.06,
        hairTex
      )
    );
  } else if (definition.wavyHair) {
    // Schlein's voluminous dark wavy shoulder-length locks
    for (const s of [-1, 1]) {
      group.add(
        createTaperedStrand(
          [[s * 0.068, 0.232, 0.055], [s * 0.120, 0.165, 0.038], [s * 0.126, 0.072, -0.008], [s * 0.110, -0.045, -0.045]],
          [0.036, 0.044, 0.038, 0.016],
          [0.044, 0.050, 0.046, 0.020],
          7,
          hairColor,
          0.02,
          hairTex
        )
      );
      group.add(
        createTaperedStrand(
          [[s * 0.042, 0.244, 0.086], [s * 0.082, 0.214, 0.105], [s * 0.108, 0.148, 0.088], [s * 0.112, 0.060, 0.052]],
          [0.024, 0.028, 0.022, 0.011],
          [0.024, 0.026, 0.020, 0.010],
          6,
          hairColor,
          0.04,
          hairTex
        )
      );
      group.add(
        createTaperedStrand(
          [[s * 0.055, 0.175, -0.075], [s * 0.088, 0.065, -0.108], [s * 0.078, -0.058, -0.102]],
          [0.044, 0.052, 0.024],
          [0.034, 0.042, 0.020],
          6,
          hairColor,
          -0.06,
          hairTex
        )
      );
    }
  } else if (definition.slickHair) {
    // Conte's signature slicked-back sculpted pompadour ridges
    for (const offsetX of [-0.046, 0, 0.046]) {
      group.add(
        createTaperedStrand(
          [[offsetX * 0.78, 0.206, 0.102], [offsetX, 0.258, 0.028], [offsetX * 1.08, 0.228, -0.075], [offsetX, 0.110, -0.124]],
          [0.028, 0.036, 0.031, 0.016],
          [0.024, 0.030, 0.025, 0.013],
          6,
          hairColor,
          0.04,
          hairTex
        )
      );
    }
    for (const s of [-1, 1]) {
      group.add(
        createTaperedStrand(
          [[s * 0.095, 0.175, 0.052], [s * 0.112, 0.155, -0.025], [s * 0.096, 0.110, -0.098]],
          [0.018, 0.022, 0.015],
          [0.022, 0.026, 0.018],
          6,
          hairColor,
          -0.02,
          hairTex
        )
      );
    }
  } else if (definition.id === "renzi") {
    // Renzi's sculpted executive quiff + crisp side sweeps
    group.add(
      createTaperedStrand(
        [[-0.068, 0.218, 0.084], [-0.005, 0.256, 0.110], [0.072, 0.242, 0.088]],
        [0.024, 0.036, 0.018],
        [0.026, 0.034, 0.018],
        6,
        hairColor,
        0.06,
        hairTex
      )
    );
    group.add(
      createTaperedStrand(
        [[-0.035, 0.236, 0.055], [0.015, 0.252, 0.015], [0.052, 0.228, -0.068]],
        [0.024, 0.030, 0.020],
        [0.022, 0.028, 0.018],
        6,
        hairColor,
        0.02,
        hairTex
      )
    );
  } else if (definition.id === "bonelli") {
    // Bonelli's tousled layered eco-activist crown tufts
    for (const [x0, x1, y1, z0, z1] of [
      [-0.065, -0.015, 0.252, 0.085, 0.096],
      [-0.010, 0.058, 0.256, 0.096, 0.078],
      [0.022, 0.082, 0.236, 0.068, 0.020]
    ]) {
      group.add(
        createTaperedStrand(
          [[x0, 0.218, z0], [(x0 + x1) * 0.5, y1, (z0 + z1) * 0.5 + 0.012], [x1, 0.215, z1]],
          [0.020, 0.030, 0.016],
          [0.020, 0.028, 0.016],
          6,
          hairColor,
          0.03,
          hairTex
        )
      );
    }
  } else {
    // Salvini, Tajani, Calenda: crisp side-parted sculpted executive crown + sideburns
    const sweepSign = definition.id === "tajani" ? -1 : 1;
    group.add(
      createTaperedStrand(
        [[-0.070 * sweepSign, 0.220, 0.084], [0.006, 0.248, 0.102], [0.082 * sweepSign, 0.214, 0.078]],
        [0.020, 0.032, 0.016],
        [0.022, 0.028, 0.016],
        6,
        hairColor,
        0.04,
        hairTex
      )
    );
    if (definition.id === "salvini" || definition.id === "calenda") {
      for (const s of [-1, 1]) {
        group.add(
          createTaperedStrand(
            [[s * 0.102, 0.145, 0.032], [s * 0.104, 0.088, 0.026], [s * 0.096, 0.042, 0.028]],
            [0.015, 0.016, 0.012],
            [0.018, 0.018, 0.014],
            5,
            hairColor,
            -0.04,
            hairTex
          )
        );
      }
    }
  }

  return group;
}

function createTailoredGlasses(definition) {
  const group = new THREE.Group();
  const isThin = definition.id === "salvini";
  const isBonelli = definition.id === "bonelli";
  const frameColor = isThin ? "#2d3038" : isBonelli ? "#342a24" : "#222026";
  const tube = isThin ? 0.0032 : 0.0046;
  const rx = isBonelli ? 0.026 : 0.029;
  const ry = isThin ? 0.020 : isBonelli ? 0.024 : 0.022;
  const lensY = 0.087;
  const lensZ = 0.123;

  for (const s of [-1, 1]) {
    const cx = s * 0.042;
    // Low-poly tailored rectangular/rounded frame rim (8-point closed bevelled loop)
    const rimPts = [
      [cx - rx * 0.85, lensY + ry, lensZ],
      [cx + rx * 0.85, lensY + ry, lensZ],
      [cx + rx, lensY + ry * 0.45, lensZ - 0.003],
      [cx + rx, lensY - ry * 0.55, lensZ - 0.003],
      [cx + rx * 0.72, lensY - ry, lensZ],
      [cx - rx * 0.72, lensY - ry, lensZ],
      [cx - rx, lensY - ry * 0.55, lensZ - 0.003],
      [cx - rx, lensY + ry * 0.45, lensZ - 0.003],
      [cx - rx * 0.85, lensY + ry, lensZ]
    ];
    const rArr = rimPts.map(() => tube);
    group.add(createTaperedStrand(rimPts, rArr, rArr, 5, frameColor, 0.04));

    // Subtle specular tinted low-poly lens pane inside the frame
    const lensGeo = new THREE.PlaneGeometry(rx * 1.82, ry * 1.78, 1, 1);
    const lens = buildShadedMesh(
      lensGeo,
      "#c8e4ff",
      (vx, vy) => clamp(0.85 + (vy + vx * 0.4) * 5.0, 0.65, 1.15),
      {
        roughness: 0.10,
        metalness: 0.35,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        castShadow: false,
        receiveShadow: false
      }
    );
    lens.position.set(cx, lensY, lensZ - 0.002);
    group.add(lens);

    // Temple arm connecting frame hinge cleanly back to top of ear!
    const temple = createTaperedStrand(
      [
        [cx + s * rx, lensY + ry * 0.42, lensZ - 0.004],
        [s * 0.106, lensY + 0.006, 0.056],
        [s * 0.110, 0.084, -0.005],
        [s * 0.105, 0.064, -0.028]
      ],
      [tube * 1.05, tube, tube * 0.95, tube * 0.85],
      [tube * 1.05, tube, tube * 0.95, tube * 0.85],
      5,
      frameColor,
      0
    );
    group.add(temple);
  }

  // Nose bridge connecting inner frame rims
  const bridge = createTaperedStrand(
    [[-0.015, lensY + 0.005, lensZ + 0.002], [0, lensY + 0.008, lensZ + 0.005], [0.015, lensY + 0.005, lensZ + 0.002]],
    [tube, tube * 1.1, tube],
    [tube, tube * 1.1, tube],
    5,
    frameColor,
    0.04
  );
  group.add(bridge);
  return group;
}

function createSculptedBeard(hairColor, hairTex) {
  // Low-poly 3D jaw/chin beard shell hugging Salvini's lower face for bold PS1 silhouette
  const rings = [];
  const levels = [
    { y: -0.072, rx: 0.048, rz: 0.062, zOff: 0.036 },
    { y: -0.042, rx: 0.078, rz: 0.086, zOff: 0.030 },
    { y: -0.005, rx: 0.094, rz: 0.096, zOff: 0.022 },
    { y: 0.032, rx: 0.098, rz: 0.094, zOff: 0.012 }
  ];
  const radial = 10;
  for (let l = 0; l < levels.length; l += 1) {
    const lvl = levels[l];
    const ring = [];
    for (let i = 0; i < radial; i += 1) {
      // Half-loop hugging front & jaw sides (from -0.62*PI to +0.62*PI)
      const t = i / (radial - 1);
      const a = -Math.PI * 0.62 + t * Math.PI * 1.24;
      const sx = Math.sin(a);
      const cz = Math.cos(a);
      const mouthNotch = l === 3 && Math.abs(sx) < 0.35 ? -0.018 * (1 - Math.abs(sx) / 0.35) : 0;
      ring.push([sx * lvl.rx, lvl.y + mouthNotch, lvl.zOff + cz * lvl.rz]);
    }
    rings.push(ring);
  }
  return buildShadedMesh(
    createLoftedGeometry(rings, true, false),
    hairColor,
    (x, y, z, nx, ny, nz) => {
      const under = y < -0.045 ? 0.24 : 0;
      const pepperHi = nz > 0.45 && y > -0.03 ? 0.10 : 0;
      return clamp(0.84 + 0.14 * ny + pepperHi - under, 0.50, 1.06);
    },
    { roughness: 0.84, map: hairTex, side: THREE.DoubleSide }
  );
}

/**
 * Create a 16x16 vertex-sculpted human head mesh with tapered jawline & chin,
 * pronounced cheekbones, brow ridge, recessed eye sockets, sculpted bridge nose,
 * ears, tailored glasses, 3D beard (Salvini), and a 128x128 NearestFilter PS1 face texture.
 */
function createSculptedHead(definition, textures) {
  const headGroup = new THREE.Group();

  // phiStart = -PI/2 puts u=0.5 dead center at +Z (front of face) and seam at -Z (back)
  const skullGeo = new THREE.SphereGeometry(0.139, 16, 16, -Math.PI / 2, Math.PI * 2, 0, Math.PI);
  const pos = skullGeo.attributes.position;
  const uv = skullGeo.attributes.uv;

  const isRenzi = definition.id === "renzi";
  const isSchlein = definition.id === "schlein";
  const isCalenda = definition.id === "calenda";
  const isSalvini = definition.id === "salvini";
  const isMeloni = definition.id === "meloni";

  for (let i = 0; i < pos.count; i += 1) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const u = uv.getX(i);
    const v = uv.getY(i);

    // Base human head proportions (~0.22 wide, 0.32 tall, 0.25 deep)
    x *= isCalenda || isSalvini ? 0.84 : isMeloni ? 0.78 : 0.80;
    y *= 1.185;
    z *= 0.90;

    // Tapered jawline and forward chin
    if (v < 0.45) {
      const jawT = clamp((0.45 - v) / 0.45, 0, 1);
      const jawTaper = isRenzi || isMeloni ? 0.39 : isSalvini ? 0.28 : 0.34;
      x *= 1 - jawTaper * jawT;
      if (z > 0) {
        const chinFocus = Math.exp(-Math.pow((u - 0.5) / 0.085, 2)) * Math.exp(-Math.pow((v - 0.22) / 0.12, 2));
        z += (isRenzi ? 0.023 : isSalvini ? 0.020 : 0.017) * chinFocus;
      } else {
        z *= 1 - 0.30 * jawT;
      }
      if (v < 0.14) y += (0.14 - v) * 0.07;
    }

    // Brow ridge
    const browRidge = Math.exp(-Math.pow((v - 0.65) / 0.055, 2)) * Math.exp(-Math.pow((u - 0.5) / 0.14, 2));
    z += (isCalenda || isConte(definition) ? 0.013 : 0.011) * browRidge;

    // Recessed eye sockets (u = 0.4375 and u = 0.5625, v = 0.57)
    const socketL = Math.exp(-Math.pow((u - 0.4375) / 0.042, 2)) * Math.exp(-Math.pow((v - 0.57) / 0.055, 2));
    const socketR = Math.exp(-Math.pow((u - 0.5625) / 0.042, 2)) * Math.exp(-Math.pow((v - 0.57) / 0.055, 2));
    z -= 0.015 * (socketL + socketR);

    // Pronounced cheekbones
    const cheekL = Math.exp(-Math.pow((u - 0.38) / 0.065, 2)) * Math.exp(-Math.pow((v - 0.46) / 0.065, 2));
    const cheekR = Math.exp(-Math.pow((u - 0.62) / 0.065, 2)) * Math.exp(-Math.pow((v - 0.46) / 0.065, 2));
    const cheek = cheekL + cheekR;
    x += Math.sign(x) * 0.008 * cheek;
    z += 0.012 * cheek;

    // Sculpted bridge nose & tip directly in head mesh (prominent aquiline profile for Schlein)
    const noseBridge = Math.exp(-Math.pow((u - 0.5) / 0.034, 2));
    const noseTip = Math.exp(-Math.pow((v - 0.455) / 0.075, 2)) * 0.026;
    const noseUpper = Math.exp(-Math.pow((v - 0.555) / 0.055, 2)) * 0.015;
    z += noseBridge * (noseTip + noseUpper) * (isSchlein ? 1.32 : 1.02);

    // Subtle mouth/muzzle projection
    const muzzle = Math.exp(-Math.pow((u - 0.5) / 0.065, 2)) * Math.exp(-Math.pow((v - 0.33) / 0.05, 2));
    z += 0.007 * muzzle;

    pos.setXYZ(i, x, y + 0.08, z);
  }
  skullGeo.computeVertexNormals();

  const headMesh = buildShadedMesh(
    skullGeo,
    definition.skin,
    (x, y, z, nx, ny, nz) => {
      const underJaw = y < 0.03 && ny < -0.15 ? 0.32 * Math.max(0, -ny) : 0;
      const eyeSocket = z > 0.07 && y > 0.06 && y < 0.12 && Math.abs(x) > 0.015 && Math.abs(x) < 0.068 ? 0.15 : 0;
      const neckShadow = y < -0.03 && z < 0.03 ? 0.22 : 0;
      const browHighlight = nz > 0.5 && y > 0.12 && y < 0.18 ? 0.08 : 0;
      return clamp(0.95 + 0.11 * ny + browHighlight - underJaw - eyeSocket - neckShadow, 0.52, 1.10);
    },
    { map: textures.face, roughness: 0.70 }
  );
  headGroup.add(headMesh);

  // Sculpted ears on sides of head
  for (const s of [-1, 1]) {
    const earGeo = new THREE.CylinderGeometry(0.018, 0.013, 0.052, 6, 2);
    const ePos = earGeo.attributes.position;
    for (let i = 0; i < ePos.count; i += 1) {
      if (ePos.getZ(i) > 0) ePos.setZ(i, ePos.getZ(i) * 0.72);
    }
    earGeo.computeVertexNormals();
    const ear = buildShadedMesh(
      earGeo,
      definition.skin,
      (x, y, z, nx, ny, nz) => clamp(0.78 + 0.16 * ny - (nz > 0.2 ? 0.10 : 0), 0.58, 0.98),
      { map: textures.skin }
    );
    ear.position.set(s * 0.106, 0.065, -0.008);
    ear.rotation.z = -s * 0.15;
    ear.scale.set(0.55, 1, 0.85);
    headGroup.add(ear);
  }

  // 3D sculpted low-poly beard cap for Salvini
  if (definition.beard) {
    headGroup.add(createSculptedBeard(definition.hair, textures.hair));
  }

  // Tailored low-poly glasses with frames, specular lenses & temple arms
  if (definition.glasses) {
    headGroup.add(createTailoredGlasses(definition));
  }

  // Sculpted hair MUST remain last child so buildFighterModel attaches it to hairPivot
  headGroup.add(createSculptedHair(definition, textures.hair));
  return headGroup;
}

function isConte(definition) {
  return definition.id === "conte";
}

function addShadedBox(parent, size, position, color, options = {}) {
  const geo = new THREE.BoxGeometry(...size);
  const mesh = buildShadedMesh(
    geo,
    color,
    (x, y, z, nx, ny, nz) => clamp(0.86 + 0.14 * ny + 0.06 * nz, 0.58, 1.08),
    options
  );
  mesh.position.set(...position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  parent.add(mesh);
  return mesh;
}

function addShadedSphere(parent, radius, position, color, scale = [1, 1, 1]) {
  const geo = new THREE.SphereGeometry(radius, 10, 8);
  const mesh = buildShadedMesh(geo, color, (x, y, z, nx, ny, nz) => clamp(0.86 + 0.14 * ny + 0.06 * nz, 0.60, 1.08));
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

function makePropFlag(parent, x, y, z, colors) {
  const poleGeo = new THREE.CylinderGeometry(0.015, 0.017, 0.78, 6);
  const pole = buildShadedMesh(poleGeo, "#d9c28a", (vx, vy, vz, nx, ny) => clamp(0.88 + 0.14 * ny, 0.65, 1.12), {
    roughness: 0.38,
    metalness: 0.42
  });
  pole.position.set(x, y + 0.36, z);
  parent.add(pole);
  const finial = buildShadedMesh(new THREE.OctahedronGeometry(0.032, 0), "#f5cf52", (vx, vy) => clamp(0.95 + vy * 6, 0.72, 1.18), {
    roughness: 0.26,
    metalness: 0.58
  });
  finial.position.set(x, y + 0.77, z);
  parent.add(finial);
  colors.forEach((color, index) => {
    const waveZ = (index - 1) * 0.014;
    addShadedBox(parent, [0.27, 0.21, 0.022], [x + 0.15, y + 0.60 - index * 0.21, z + waveZ], color, {
      rotation: [0, (index % 2 ? 0.12 : -0.10), 0]
    });
  });
}

function createProp(hand, fighter) {
  const prop = new THREE.Group();
  prop.name = `${fighter.id}-prop`;
  prop.position.set(0, -0.045, 0.015);
  prop.rotation.z = -2.2;
  hand.add(prop);

  switch (fighter.prop) {
    case "shovel":
      addShadedBox(prop, [0.34, 0.14, 0.22], [0.14, 0.06, 0], "#dfaa22");
      addShadedBox(prop, [0.18, 0.12, 0.20], [0.06, 0.17, 0], "#2b303a", { roughness: 0.35, metalness: 0.25 });
      addShadedBox(prop, [0.10, 0.58, 0.12], [0.33, 0.29, 0], "#efc52e", { rotation: [0, 0, -0.55] });
      addShadedSphere(prop, 0.08, [0.48, 0.52, 0], "#4b4b48");
      addShadedBox(prop, [0.10, 0.44, 0.12], [0.62, 0.38, 0], "#f4ca36", { rotation: [0, 0, 0.65] });
      addShadedBox(prop, [0.27, 0.16, 0.25], [0.72, 0.18, 0], "#efbd21", { rotation: [0, 0, 0.35] });
      addShadedBox(prop, [0.27, 0.032, 0.26], [0.75, 0.10, 0], "#6e6145");
      for (const tz of [-0.08, 0, 0.08]) {
        addShadedBox(prop, [0.07, 0.025, 0.025], [0.88, 0.08, tz], "#4e4a44", { metalness: 0.45 });
      }
      break;
    case "briefcase":
      addShadedBox(prop, [0.48, 0.35, 0.18], [0.10, -0.14, 0], "#7d4f2f", { roughness: 0.52 });
      addShadedBox(prop, [0.50, 0.035, 0.19], [0.10, -0.02, 0], "#5c3922", { roughness: 0.58 });
      addShadedBox(prop, [0.17, 0.04, 0.04], [0.10, 0.075, 0], "#3c2618");
      for (const cx of [-0.05, 0.25]) {
        addShadedBox(prop, [0.045, 0.05, 0.195], [cx, -0.02, 0], "#e2be62", { roughness: 0.30, metalness: 0.55 });
      }
      break;
    case "dossier":
      for (let i = 0; i < 5; i += 1) {
        addShadedBox(prop, [0.56, 0.092, 0.38], [0.10, i * 0.09 - 0.17, 0.04], i % 2 ? "#fffaf0" : "#e5e1d8");
        addShadedBox(prop, [0.055, 0.09, 0.39], [-0.15, i * 0.09 - 0.17, 0.04], i % 2 ? "#b9453c" : "#2f578c");
      }
      addShadedBox(prop, [0.58, 0.024, 0.06], [0.10, 0.02, 0.04], "#c84038");
      break;
    case "microphone": {
      const handleGeo = new THREE.CylinderGeometry(0.030, 0.024, 0.44, 7);
      const handle = buildShadedMesh(handleGeo, "#2d2c36", (x, y, z, nx, ny) => clamp(0.84 + 0.16 * ny, 0.58, 1.08), {
        roughness: 0.42,
        metalness: 0.35
      });
      handle.position.set(0, 0.16, 0);
      prop.add(handle);
      addShadedBox(prop, [0.12, 0.12, 0.12], [0, 0.26, 0], "#d95043");
      const grille = buildShadedMesh(new THREE.IcosahedronGeometry(0.088, 1), "#8e929e", (x, y, z, nx, ny) => clamp(0.82 + 0.20 * ny, 0.58, 1.12), {
        roughness: 0.36,
        metalness: 0.52
      });
      grille.position.set(0, 0.42, 0);
      grille.scale.set(1, 1.22, 1);
      prop.add(grille);
      break;
    }
    case "palette":
      addShadedBox(prop, [0.44, 0.30, 0.065], [0.06, 0.02, 0], "#dfc8a4", { roughness: 0.65 });
      ["#e25b54", "#f0cb48", "#5eb87c", "#5086ce", "#b864b4"].forEach((color, index) => {
        const angle = -0.9 + index * 0.45;
        addShadedSphere(prop, 0.056, [0.06 + Math.sin(angle) * 0.15, 0.02 + Math.cos(angle) * 0.09, 0.052], color);
      });
      break;
    case "pen": {
      const barrel = buildShadedMesh(new THREE.CylinderGeometry(0.038, 0.032, 0.64, 8), "#222430", (x, y, z, nx, ny) => clamp(0.85 + 0.18 * ny, 0.60, 1.12), {
        roughness: 0.28,
        metalness: 0.38
      });
      barrel.position.set(0, 0.15, 0);
      prop.add(barrel);
      addShadedBox(prop, [0.09, 0.055, 0.09], [0, 0.04, 0], "#e6be58", { roughness: 0.26, metalness: 0.62 });
      addShadedBox(prop, [0.022, 0.28, 0.024], [0.045, 0.08, 0], "#f1d27b", { roughness: 0.26, metalness: 0.62 });
      const nibGeo = new THREE.ConeGeometry(0.064, 0.19, 4);
      const nib = buildShadedMesh(nibGeo, "#ffdf7b", (x, y) => clamp(0.9 + y * 2, 0.7, 1.15), {
        roughness: 0.25,
        metalness: 0.65
      });
      nib.position.y = 0.56;
      prop.add(nib);
      break;
    }
    case "plant": {
      const pot = buildShadedMesh(new THREE.CylinderGeometry(0.17, 0.12, 0.25, 8), "#b9644a", (x, y, z, nx, ny) => clamp(0.84 + 0.16 * ny, 0.56, 1.08), {
        roughness: 0.82
      });
      pot.position.set(0, -0.24, 0);
      prop.add(pot);
      const rim = buildShadedMesh(new THREE.CylinderGeometry(0.19, 0.175, 0.055, 8), "#cb7256", (x, y, z, nx, ny) => clamp(0.88 + 0.16 * ny, 0.60, 1.10), {
        roughness: 0.78
      });
      rim.position.set(0, -0.12, 0);
      prop.add(rim);
      addShadedBox(prop, [0.068, 0.90, 0.068], [0, 0.28, 0], "#6f512f");
      for (const [r, px, py, pz, col] of [
        [0.21, 0, 0.78, 0, "#4f9b5a"],
        [0.15, -0.15, 0.63, 0.03, "#78b566"],
        [0.15, 0.15, 0.67, -0.02, "#67ae5d"],
        [0.13, 0.02, 0.92, 0.04, "#8ac472"]
      ]) {
        const crown = buildShadedMesh(new THREE.IcosahedronGeometry(r, 0), col, (x, y, z, nx, ny) => clamp(0.82 + 0.22 * ny, 0.56, 1.12), {
          roughness: 0.76
        });
        crown.position.set(px, py, pz);
        prop.add(crown);
      }
      break;
    }
    default:
      makePropFlag(prop, 0, 0, 0, ["#17965d", "#f7f1e4", "#d94c4c"]);
  }
  return prop;
}

function makeJoint(parent, name, position, rotationOrder = "XYZ") {
  const joint = new THREE.Group();
  joint.name = name;
  joint.rotation.order = rotationOrder;
  joint.position.set(...position);
  parent.add(joint);
  return joint;
}

const _qHips = new THREE.Quaternion();
const _qHip = new THREE.Quaternion();
const _qKnee = new THREE.Quaternion();
const _qThigh = new THREE.Quaternion();
const _qShin = new THREE.Quaternion();
const _qInvShin = new THREE.Quaternion();
const _vLocalUp = new THREE.Vector3();
const _vHipOffset = new THREE.Vector3();
const _vThigh = new THREE.Vector3();
const _vCalf = new THREE.Vector3();

function computeLegChain(qHips, hipJoint, kneeJoint, ankleJoint, thighLen, calfLen, soleHeight, levelAnkle) {
  _vHipOffset.copy(hipJoint.position).applyQuaternion(qHips);
  _qHip.setFromEuler(hipJoint.rotation);
  _qThigh.multiplyQuaternions(qHips, _qHip);
  _vThigh.set(0, -thighLen, 0).applyQuaternion(_qThigh);

  _qKnee.setFromEuler(kneeJoint.rotation);
  _qShin.multiplyQuaternions(_qThigh, _qKnee);
  _vCalf.set(0, -calfLen, 0).applyQuaternion(_qShin);

  if (levelAnkle && ankleJoint) {
    // Counter-rotate ankle pitch (X) and roll (Z) so planted boot sole stays flat on the floor
    _qInvShin.copy(_qShin).invert();
    _vLocalUp.set(0, 1, 0).applyQuaternion(_qInvShin);
    const rz = -Math.asin(clamp(_vLocalUp.x, -0.92, 0.92));
    const rx = Math.atan2(_vLocalUp.z, _vLocalUp.y);
    ankleJoint.rotation.set(rx, 0, rz);
  }

  return -(_vHipOffset.y + _vThigh.y + _vCalf.y) + soleHeight;
}

/**
 * Compute anatomical ground anchoring for a fighter rig:
 * - Keeps the root grounded while adjusting `hips.position.y` proportionally to knee/hip bend
 * - Counter-tilts planted ankle(s) so standing boots remain flat on the arena floor
 */
export function updateGroundedRig(joints, { support = "both", lift = 0 } = {}) {
  const { hips, leftHip, leftKnee, leftAnkle, rightHip, rightKnee, rightAnkle } = joints;
  const thighLen = hips.userData.legThigh ?? 0.56;
  const calfLen = hips.userData.legCalf ?? 0.53;
  const soleHeight = hips.userData.soleHeight ?? 0.12;
  const floorLocalY = hips.userData.floorLocalY ?? 0.11;

  _qHips.setFromEuler(hips.rotation);

  const leftDrop = computeLegChain(
    _qHips,
    leftHip,
    leftKnee,
    leftAnkle,
    thighLen,
    calfLen,
    soleHeight,
    support === "left" || support === "both"
  );
  const rightDrop = computeLegChain(
    _qHips,
    rightHip,
    rightKnee,
    rightAnkle,
    thighLen,
    calfLen,
    soleHeight,
    support === "right" || support === "both"
  );

  const activeDrop =
    support === "left" ? leftDrop :
    support === "right" ? rightDrop :
    Math.max(leftDrop, rightDrop);

  hips.position.y = floorLocalY + Math.max(0.25, activeDrop) + lift;
  return hips.position.y;
}

const smooth01 = (t) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

/**
 * Evaluate the 3-phase martial arts kick curve across normalized progress [0.0 .. 1.0]:
 * - Phase 1 (0.00 - 0.28): Chamber (hip pivots open, thigh lifts, knee bends to 1.65 rad, standing leg dips)
 * - Phase 2 (0.28 - 0.62): Snap Extension & Hold (knee snaps to 0.08 rad, peaking at progress 0.42)
 * - Phase 3 (0.62 - 1.00): Re-Chamber & Plant (knee folds back to 1.20 rad, then lowers to guard)
 */
export function evaluateKickCurve(progress) {
  const p = clamp(progress, 0, 1);

  let lift = 0;
  let kneeAngle = 0.14;
  let extension = 0;
  let standDip = 0;
  let phase = "chamber";

  if (p <= 0.28) {
    phase = "chamber";
    const t = p / 0.28;
    const ease = 1 - Math.pow(1 - t, 2.2);
    lift = 0.84 * ease;
    kneeAngle = THREE.MathUtils.lerp(0.14, 1.65, ease);
    extension = 0;
    standDip = smooth01(t);
  } else if (p <= 0.62) {
    phase = "extend";
    if (p <= 0.42) {
      const t = (p - 0.28) / 0.14;
      const snap = 1 - Math.pow(1 - t, 3);
      lift = THREE.MathUtils.lerp(0.84, 1.0, snap);
      kneeAngle = THREE.MathUtils.lerp(1.65, 0.08, snap);
      extension = snap;
    } else {
      const t = (p - 0.42) / 0.20;
      lift = THREE.MathUtils.lerp(1.0, 0.94, t * t);
      kneeAngle = 0.08;
      extension = 1.0;
    }
    standDip = 1.0;
  } else {
    phase = "rechamber";
    if (p <= 0.80) {
      const t = (p - 0.62) / 0.18;
      const fold = smooth01(t);
      lift = THREE.MathUtils.lerp(0.94, 0.62, fold);
      kneeAngle = THREE.MathUtils.lerp(0.08, 1.2, fold);
      extension = 1 - fold;
      standDip = THREE.MathUtils.lerp(1.0, 0.55, fold);
    } else {
      const t = (p - 0.80) / 0.20;
      const plant = smooth01(t);
      lift = THREE.MathUtils.lerp(0.62, 0, plant);
      kneeAngle = THREE.MathUtils.lerp(1.2, 0.14, plant);
      extension = 0;
      standDip = THREE.MathUtils.lerp(0.55, 0, plant);
    }
  }

  return { phase, progress: p, lift, kneeAngle, extension, standDip };
}

export const KICK_ACTIVE_WINDOW = { start: 0.30, end: 0.55 };

/**
 * Return true when a kick attack is inside its active snap-extension hitbox window
 * (`progress` in [0.30, 0.55]) and has not yet scored a hit.
 */
export function isKickHitboxActive(attack, window = KICK_ACTIVE_WINDOW) {
  if (!attack || attack.hit) return false;
  const duration = Math.max(attack.duration || 0, 0.001);
  const progress = (attack.age || 0) / duration;
  const start = typeof attack.activeStart === "number" ? attack.activeStart : window.start;
  const end = typeof attack.activeEnd === "number" ? attack.activeEnd : window.end;
  return progress >= start - 1e-6 && progress <= end + 1e-6;
}

/**
 * Apply 3-phase martial arts kick animation (roundhouse, side kick, or jumping/spinning axe finisher)
 * onto a fighter's skeletal joints and ground the supporting pelvis/ankle cleanly.
 */
export function applyKickAnimation(joints, { style = "roundhouse", side = "left", progress = 0, height = "high" } = {}) {
  const curve = evaluateKickCurve(progress);
  const { lift, kneeAngle, extension, standDip } = curve;
  const isLeft = side === "left";

  const hip = isLeft ? joints.leftHip : joints.rightHip;
  const knee = isLeft ? joints.leftKnee : joints.rightKnee;
  const ankle = isLeft ? joints.leftAnkle : joints.rightAnkle;
  const supportHip = isLeft ? joints.rightHip : joints.leftHip;
  const supportKnee = isLeft ? joints.rightKnee : joints.leftKnee;
  const leadArm = joints.leftShoulder;
  const leadElbow = joints.leftElbow;
  const rearArm = joints.rightShoulder;
  const rearElbow = joints.rightElbow;

  let support = isLeft ? "right" : "left";
  let verticalLift = 0;

  // Keep standing knee as a clean anatomical hinge (no sideways knee bow)
  supportKnee.rotation.z = THREE.MathUtils.lerp(supportKnee.rotation.z, 0, standDip);
  supportHip.rotation.z = THREE.MathUtils.lerp(supportHip.rotation.z, 0, standDip);

  if (style === "axe") {
    // Combo Finisher (3rd hit of U->I->K or J->K->K): Jumping spinning heel-axe kick
    const p = curve.progress;
    const jumpArc = p < 0.10
      ? -0.06 * smooth01(p / 0.10)
      : Math.sin(clamp((p - 0.10) / 0.84, 0, 1) * Math.PI);
    verticalLift = jumpArc > 0 ? 0.38 * jumpArc : jumpArc;

    // Front-load the 360-degree aerial spin so the fighter faces the opponent (+X) during the active chop window
    const baseYaw = joints.hips.rotation.y;
    const spinT = smooth01((p - 0.04) / 0.38);
    joints.hips.rotation.y = baseYaw + Math.PI * 2 * spinT;
    joints.hips.rotation.z = THREE.MathUtils.lerp(joints.hips.rotation.z, 0.14, lift);

    // Standing leg tucks athletically in the air then extends to catch the landing
    supportHip.rotation.x -= 0.42 * standDip;
    supportKnee.rotation.x += 0.82 * standDip;

    // Leg whips overhead during apex (0.28..0.42) then chops straight down along +X (0.42..0.62)
    const chopT = clamp((p - 0.42) / 0.20, 0, 1);
    const targetHipX = p <= 0.42
      ? THREE.MathUtils.lerp(-1.95, -2.28, extension)
      : THREE.MathUtils.lerp(-2.28, -1.12, chopT * chopT);
    const targetHipYaw = Math.PI * 0.5 - baseYaw;
    hip.rotation.y = THREE.MathUtils.lerp(hip.rotation.y, targetHipYaw, lift);
    hip.rotation.x = THREE.MathUtils.lerp(hip.rotation.x, targetHipX, lift);
    hip.rotation.z = THREE.MathUtils.lerp(hip.rotation.z, 0.06, lift);
    knee.rotation.x = kneeAngle;
    knee.rotation.z = THREE.MathUtils.lerp(knee.rotation.z, 0, lift);
    ankle.rotation.x = THREE.MathUtils.lerp(ankle.rotation.x, -0.25, lift);

    joints.torso.rotation.z = THREE.MathUtils.lerp(joints.torso.rotation.z, 0.38, lift);
    joints.torso.rotation.x = THREE.MathUtils.lerp(joints.torso.rotation.x, -0.14, lift);
    leadArm.rotation.y = THREE.MathUtils.lerp(leadArm.rotation.y, -0.35, lift);
    leadArm.rotation.z = THREE.MathUtils.lerp(leadArm.rotation.z, 1.75, lift);
    leadElbow.rotation.z = THREE.MathUtils.lerp(leadElbow.rotation.z, 0.95, lift);
    rearArm.rotation.y = THREE.MathUtils.lerp(rearArm.rotation.y, -0.25, lift);
    rearArm.rotation.z = THREE.MathUtils.lerp(rearArm.rotation.z, 1.65, lift);
    rearElbow.rotation.z = THREE.MathUtils.lerp(rearElbow.rotation.z, 0.95, lift);
    support = "both";
  } else if (style === "roundhouse") {
    // KICK_L: Crisp High (or Low leg-sweep) Roundhouse / Mawashi Geri aimed dead-on along +X
    supportHip.rotation.x -= 0.34 * standDip;
    supportKnee.rotation.x += 0.68 * standDip;

    // Pivot pelvis open toward opponent (+X) and tilt hip socket up cleanly
    const pelvisTargetYaw = isLeft ? 1.38 : 1.24;
    joints.hips.rotation.y = THREE.MathUtils.lerp(joints.hips.rotation.y, pelvisTargetYaw, lift);
    joints.hips.rotation.z = THREE.MathUtils.lerp(joints.hips.rotation.z, height === "low" ? 0.08 : 0.22, lift);
    // Counter-rotate support hip slightly so planted knee & foot stay anatomically aligned
    supportHip.rotation.y = THREE.MathUtils.lerp(supportHip.rotation.y, -0.55, lift);

    // Chamber open toward camera-front, then whip horizontally across +X into target!
    const chamberYaw = isLeft ? -0.36 : 0.36;
    const impactYaw = isLeft ? 0.16 : 0.30;
    const kickPitch = height === "low" ? -1.04 : -1.84;
    hip.rotation.y = THREE.MathUtils.lerp(hip.rotation.y, THREE.MathUtils.lerp(chamberYaw, impactYaw, extension), lift);
    hip.rotation.x = THREE.MathUtils.lerp(hip.rotation.x, kickPitch, lift);
    hip.rotation.z = THREE.MathUtils.lerp(hip.rotation.z, (isLeft ? 0.16 : -0.12) * (1 - extension * 0.4), lift);
    knee.rotation.x = kneeAngle;
    knee.rotation.z = THREE.MathUtils.lerp(knee.rotation.z, 0, lift);
    ankle.rotation.x = THREE.MathUtils.lerp(ankle.rotation.x, 0.45, lift);

    // Counterbalance torso away from kick; lead arm whips down for momentum, rear hand guards chin
    joints.torso.rotation.z = THREE.MathUtils.lerp(joints.torso.rotation.z, height === "low" ? 0.26 : 0.44, lift);
    joints.torso.rotation.x = THREE.MathUtils.lerp(joints.torso.rotation.x, -0.14, lift);
    joints.torso.rotation.y = THREE.MathUtils.lerp(joints.torso.rotation.y, -0.68, lift);

    leadArm.rotation.y = THREE.MathUtils.lerp(leadArm.rotation.y, -0.25, lift);
    leadArm.rotation.z = THREE.MathUtils.lerp(leadArm.rotation.z, 0.22, lift);
    leadArm.rotation.x = THREE.MathUtils.lerp(leadArm.rotation.x, 0.45, lift);
    leadElbow.rotation.z = THREE.MathUtils.lerp(leadElbow.rotation.z, 0.35, lift);
    rearArm.rotation.y = THREE.MathUtils.lerp(rearArm.rotation.y, -0.30, lift);
    rearArm.rotation.z = THREE.MathUtils.lerp(rearArm.rotation.z, 1.18, lift);
    rearArm.rotation.x = THREE.MathUtils.lerp(rearArm.rotation.x, -0.42, lift);
    rearElbow.rotation.z = THREE.MathUtils.lerp(rearElbow.rotation.z, 2.05, lift);
  } else {
    // KICK_R: Heavy Thrusting Side Kick / Yoko Geri straight down the +X combat line
    supportHip.rotation.x -= 0.34 * standDip;
    supportKnee.rotation.x += 0.68 * standDip;

    // Turn pelvis cleanly side-on (facing camera +Z) so kicking hip aligns straight along +X
    joints.hips.rotation.y = THREE.MathUtils.lerp(joints.hips.rotation.y, -0.04, lift);
    joints.hips.rotation.z = THREE.MathUtils.lerp(joints.hips.rotation.z, 0.16, lift);
    supportHip.rotation.y = THREE.MathUtils.lerp(supportHip.rotation.y, -0.22, lift);

    // Align leg hinge plane directly along +X: tuck knee tightly back (-1.38), then blast straight out (-1.60)
    hip.rotation.y = THREE.MathUtils.lerp(hip.rotation.y, 1.56, lift);
    hip.rotation.x = THREE.MathUtils.lerp(hip.rotation.x, THREE.MathUtils.lerp(-1.38, -1.60, extension), lift);
    hip.rotation.z = THREE.MathUtils.lerp(hip.rotation.z, 0.04, lift);
    knee.rotation.x = kneeAngle;
    knee.rotation.z = THREE.MathUtils.lerp(knee.rotation.z, 0, lift);
    ankle.rotation.x = THREE.MathUtils.lerp(ankle.rotation.x, -0.25, lift);

    // Sharp torso counterbalance away from the +X thrusting kick
    joints.torso.rotation.z = THREE.MathUtils.lerp(joints.torso.rotation.z, 0.54, lift);
    joints.torso.rotation.x = THREE.MathUtils.lerp(joints.torso.rotation.x, -0.08, lift);
    joints.torso.rotation.y = THREE.MathUtils.lerp(joints.torso.rotation.y, 0.20, lift);

    leadArm.rotation.y = THREE.MathUtils.lerp(leadArm.rotation.y, 0.15, lift);
    leadArm.rotation.z = THREE.MathUtils.lerp(leadArm.rotation.z, 0.85, lift);
    leadElbow.rotation.z = THREE.MathUtils.lerp(leadElbow.rotation.z, 1.75, lift);
    rearArm.rotation.y = THREE.MathUtils.lerp(rearArm.rotation.y, 0.10, lift);
    rearArm.rotation.z = THREE.MathUtils.lerp(rearArm.rotation.z, 1.25, lift);
    rearElbow.rotation.z = THREE.MathUtils.lerp(rearElbow.rotation.z, 1.90, lift);
  }

  updateGroundedRig(joints, { support, lift: verticalLift });
  return { ...curve, support, verticalLift };
}

/**
 * Compute floor-safe model offset (x, y) when tilting/tumbling a fighter around Z by `airRotation`.
 * Keeps the fighter centered near their torso/hips during airborne tumbles and prevents any limb
 * or head from penetrating below the stage floor (y = 0.11) at any angle including upside-down (PI).
 */
export function computeAirborneModelOffset(airRotation, height = 1, options = {}) {
  if (!airRotation || Math.abs(airRotation) < 1e-5) {
    return { x: 0, y: 0 };
  }
  const h = height || 1;
  const floorY = options.floorY ?? 0.11;
  const yMinLocal = floorY / h;
  const yMaxLocal = options.topLocalY ?? 2.56;
  const xMinLocal = options.minXLocal ?? -0.50;
  const xMaxLocal = options.maxXLocal ?? 0.56;
  const pivotCenterLocal = options.pivotCenterLocal ?? 1.18;

  const c = Math.cos(airRotation);
  const s = Math.sin(airRotation);
  const minRotatedY = h * (
    Math.min(xMinLocal * s, xMaxLocal * s) +
    Math.min(yMinLocal * c, yMaxLocal * c)
  );
  const y = Math.max(0, floorY - minRotatedY);
  const x = pivotCenterLocal * h * s;
  return { x, y };
}

/**
 * Build a 7.5-heads-tall PS1 Tekken-3-proportioned 3D fighter model
 * with sculpted musculature, tailored suit geometry, 128x128 NearestFilter textures,
 * and Gouraud vertex colors.
 */
function alternateMirrorPalette(definition) {
  const suit = new THREE.Color(definition.suit);
  const hsl = { h: 0, s: 0, l: 0 };
  suit.getHSL(hsl);
  // Shift P2 mirror suit noticeably darker & cooler/warmer so both candidates are distinct
  const newHue = (hsl.h + (hsl.h > 0.5 && hsl.h < 0.72 ? -0.18 : 0.14) + 1) % 1;
  const newSat = Math.min(1, hsl.s + 0.08);
  const newLight = hsl.l > 0.45 ? hsl.l * 0.58 : Math.max(0.08, hsl.l * 0.72);
  suit.setHSL(newHue, newSat, newLight);

  const trousers = new THREE.Color(getTrouserColor(definition));
  trousers.offsetHSL(hsl.h > 0.5 && hsl.h < 0.72 ? -0.14 : 0.12, 0.05, -0.05);

  const tie = new THREE.Color(definition.tie);
  tie.offsetHSL(0.38, 0.1, -0.06);

  return {
    ...definition,
    suit: `#${suit.getHexString()}`,
    trousers: `#${trousers.getHexString()}`,
    tie: `#${tie.getHexString()}`
  };
}

export function createFloorRing(color = "#ffd447") {
  const geo = new THREE.RingGeometry(0.46, 0.58, 24);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "playerFloorRing";
  mesh.position.y = 0.125;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

export function buildFighterModel(rawDefinition, facing, { altSuit = false, ringColor = null } = {}) {
  const definition = altSuit ? alternateMirrorPalette(rawDefinition) : rawDefinition;
  const root = new THREE.Group();
  root.scale.x = facing;
  const model = new THREE.Group();
  model.scale.setScalar(definition.height);
  root.add(model);

  if (ringColor) {
    root.add(createFloorRing(ringColor));
  }

  const textures = generateFighterTextures(definition);
  const clothing = [];

  const widthScale =
    definition.id === "meloni" ? 0.90 :
    definition.id === "schlein" ? 1.05 :
    definition.id === "salvini" ? 1.06 :
    definition.id === "calenda" ? 1.08 : 1.0;

  const shoulderX = 0.255 * widthScale;
  const hipX = 0.115 * (definition.id === "meloni" ? 0.94 : 1.0);

  const thighLen = 0.56;
  const calfLen = 0.53;
  const soleHeight = 0.12;
  const floorLocalY = 0.11 / definition.height;
  const baseHipY = thighLen + calfLen + soleHeight + floorLocalY;

  // 7.5-heads-tall skeletal rig (YXZ order on hips, torso & hip sockets prevents gimbal twist on kicks)
  const hips = makeJoint(model, "hips", [0, baseHipY, 0], "YXZ");
  hips.userData.baseY = baseHipY;
  hips.userData.floorLocalY = floorLocalY;
  hips.userData.legThigh = thighLen;
  hips.userData.legCalf = calfLen;
  hips.userData.soleHeight = soleHeight;

  const torso = makeJoint(hips, "torso", [0, 0.06, 0], "YXZ");
  const head = makeJoint(torso, "head", [0, 0.87, 0.01], "YXZ");
  const leftShoulder = makeJoint(torso, "leftShoulder", [-shoulderX, 0.64, 0.01], "YXZ");
  const rightShoulder = makeJoint(torso, "rightShoulder", [shoulderX, 0.64, 0.01], "YXZ");
  const leftElbow = makeJoint(leftShoulder, "leftElbow", [0, -0.39, 0], "YXZ");
  const rightElbow = makeJoint(rightShoulder, "rightElbow", [0, -0.39, 0], "YXZ");
  const leftHip = makeJoint(hips, "leftHip", [-hipX, 0, 0], "YXZ");
  const rightHip = makeJoint(hips, "rightHip", [hipX, 0, 0], "YXZ");
  const leftKnee = makeJoint(leftHip, "leftKnee", [0, -thighLen, 0], "YXZ");
  const rightKnee = makeJoint(rightHip, "rightKnee", [0, -thighLen, 0], "YXZ");
  const leftAnkle = makeJoint(leftKnee, "leftAnkle", [0, -calfLen, 0], "YXZ");
  const rightAnkle = makeJoint(rightKnee, "rightAnkle", [0, -calfLen, 0], "YXZ");
  const joints = {
    hips,
    torso,
    head,
    leftShoulder,
    leftElbow,
    rightShoulder,
    rightElbow,
    leftHip,
    leftKnee,
    leftAnkle,
    rightHip,
    rightKnee,
    rightAnkle
  };

  const trouserColor = getTrouserColor(definition);

  hips.add(createSculptedPelvis(trouserColor, widthScale, textures.trousers));

  torso.add(createSculptedJacket(definition.suit, widthScale, textures.suit));
  torso.add(createTrapezius(definition.suit, widthScale, textures.suit));
  torso.add(createSuitCollarRoll(definition.suit, textures.suit));
  torso.add(createJacketDetails(definition.suit, widthScale, textures.suit, definition));
  torso.add(createLapelMesh(-1, widthScale, definition.suit, textures.suit));
  torso.add(createLapelMesh(1, widthScale, definition.suit, textures.suit));
  torso.add(createShirtChestAndCollar("#f2eee4", textures.shirt));
  const tiePivot = makeJoint(torso, "tiePivot", [0, 0.64, 0.11]);
  const tieMesh = createKnottedTie(definition.tie, textures.tie);
  tieMesh.position.set(0, -0.64, -0.11);
  tiePivot.add(tieMesh);
  torso.add(tiePivot);
  clothing.push({ joint: tiePivot, side: 1, kind: "tie" });

  const neck = createSculptedLimb(0.056, 0.058, 0.068, 0.21, 10, 4, definition.skin, {
    anatomy: "neck",
    material: { map: textures.skin }
  });
  neck.position.set(0, 0.775, 0.006);
  torso.add(neck);

  if (definition.id === "salvini") {
    const placket = createTaperedStrand(
      [[0, 0.24, 0.145], [0, 0.45, 0.155], [0, 0.65, 0.115]],
      [0.015, 0.015, 0.013],
      [0.010, 0.010, 0.009],
      6,
      "#afd0e3"
    );
    torso.add(placket);
    const pocketTrim = createTaperedStrand(
      [[-0.145, 0.48, 0.142], [-0.085, 0.48, 0.148]],
      [0.016, 0.016],
      [0.010, 0.010],
      6,
      "#245d9c"
    );
    torso.add(pocketTrim);
  }
  if (definition.id === "conte") {
    const pocketSq = new THREE.BufferGeometry();
    pocketSq.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([
        -0.148, 0.495, 0.144,
        -0.095, 0.495, 0.148,
        -0.120, 0.545, 0.150,
        -0.148, 0.495, 0.132,
        -0.095, 0.495, 0.136,
        -0.120, 0.545, 0.138
      ], 3)
    );
    pocketSq.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1, 0, 0, 1, 0, 0.5, 1], 2)
    );
    pocketSq.setIndex([0, 1, 2, 3, 5, 4, 0, 2, 5, 0, 5, 3, 1, 4, 5, 1, 5, 2, 0, 3, 4, 0, 4, 1]);
    pocketSq.computeVertexNormals();
    torso.add(
      buildShadedMesh(
        pocketSq,
        "#f4ede0",
        (x, y) => clamp(0.88 + (y - 0.5) * 2.5, 0.72, 1.05),
        { map: textures.shirt }
      )
    );
  }
  if (definition.pin) {
    const pinGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.010, 8);
    const pinMesh = buildShadedMesh(pinGeo, "#edc735", (x, y, z, nx, ny) => clamp(0.92 + 0.12 * ny, 0.75, 1.1), {
      roughness: 0.35,
      metalness: 0.4
    });
    pinMesh.rotation.x = Math.PI / 2;
    pinMesh.position.set(-0.082, 0.505, 0.149);
    torso.add(pinMesh);
  }
  if (definition.scarf) {
    const scarfTex = createSuitTexture("#428555", "#6bb97a");
    const scarfRing = createTaperedStrand(
      [
        [0.09, 0.67, 0.06],
        [0.0, 0.67, 0.105],
        [-0.095, 0.67, 0.05],
        [-0.09, 0.69, -0.06],
        [0.0, 0.69, -0.095],
        [0.09, 0.68, -0.05],
        [0.09, 0.67, 0.06]
      ],
      [0.036, 0.040, 0.042, 0.038, 0.038, 0.036, 0.036],
      [0.032, 0.036, 0.038, 0.034, 0.034, 0.032, 0.032],
      8,
      "#428555",
      0,
      scarfTex
    );
    torso.add(scarfRing);
    const scarfTailPivot = makeJoint(torso, "scarfEnd", [-0.085, 0.66, -0.05]);
    const scarfTail = createTaperedStrand(
      [[0, 0, 0], [-0.06, -0.14, -0.105], [-0.13, -0.34, -0.155]],
      [0.042, 0.046, 0.034],
      [0.016, 0.018, 0.014],
      6,
      "#5ca565",
      -0.04,
      scarfTex
    );
    scarfTailPivot.add(scarfTail);
    torso.add(scarfTailPivot);
    clothing.push({ joint: scarfTailPivot, side: -1, kind: "scarf" });
  }

  const upperArmColor = definition.id === "salvini" ? "#d8dfdf" : definition.suit;
  const forearmColor = definition.rolledSleeves ? definition.skin : upperArmColor;
  const forearmTex = definition.rolledSleeves ? textures.skin : textures.sleeve;
  const wristCuffColor = definition.rolledSleeves ? definition.skin : "#f2eee4";
  const wristCuffTex = definition.rolledSleeves ? textures.skin : textures.shirt;

  for (const [side, shoulder, elbow] of [[-1, leftShoulder, leftElbow], [1, rightShoulder, rightElbow]]) {
    const shoulderCap = createSculptedShoulderCap(upperArmColor, side, textures.sleeve);
    shoulderCap.position.set(0, -0.01, 0);
    shoulder.add(shoulderCap);

    const upperArm = createSculptedLimb(0.072, 0.066, 0.054, 0.42, 10, 6, upperArmColor, {
      anatomy: "upperArm",
      side,
      material: { map: textures.sleeve }
    });
    upperArm.position.set(0, -0.195, 0);
    shoulder.add(upperArm);

    const elbowCap = createSculptedKnee(forearmColor, forearmTex);
    elbowCap.scale.setScalar(0.72);
    elbow.add(elbowCap);

    const forearm = createSculptedLimb(0.055, 0.052, 0.039, 0.36, 10, 5, forearmColor, {
      anatomy: "forearm",
      side,
      material: { map: forearmTex }
    });
    forearm.position.set(0, -0.18, 0);
    elbow.add(forearm);

    if (definition.rolledSleeves) {
      const rolledCuff = createSculptedLimb(0.063, 0.063, 0.059, 0.075, 10, 2, "#f1eee5", {
        side,
        material: { map: textures.shirt }
      });
      rolledCuff.position.set(0, -0.04, 0);
      elbow.add(rolledCuff);
    }
  }

  const leftHand = makeJoint(leftElbow, "leftHand", [0, -0.36, 0.01]);
  const rightHand = makeJoint(rightElbow, "rightHand", [0, -0.36, 0.01]);
  leftHand.add(
    createSculptedFist(-1, definition.skin, wristCuffColor, textures.skin, wristCuffTex, {
      isTajani: definition.id === "tajani",
      watch: Boolean(definition.rolledSleeves)
    })
  );
  rightHand.add(
    createSculptedFist(1, definition.skin, wristCuffColor, textures.skin, wristCuffTex, {
      isTajani: definition.id === "tajani"
    })
  );

  const legScale = definition.id === "meloni" ? 0.92 : 1.0;
  for (const [side, hip, knee, ankle] of [[-1, leftHip, leftKnee, leftAnkle], [1, rightHip, rightKnee, rightAnkle]]) {
    const thigh = createSculptedLimb(
      0.095 * legScale,
      0.088 * legScale,
      0.067 * legScale,
      0.58,
      12,
      7,
      trouserColor,
      { anatomy: "thigh", side, trouserCrease: true, material: { map: textures.trousers } }
    );
    thigh.position.set(0, -0.28, 0);
    hip.add(thigh);

    knee.add(createSculptedKnee(trouserColor, textures.trousers));

    const calf = createSculptedLimb(
      0.069 * legScale,
      0.076 * legScale,
      0.053 * legScale,
      0.53,
      12,
      7,
      trouserColor,
      { anatomy: "calf", side, trouserCrease: true, material: { map: textures.trousers } }
    );
    calf.position.set(0, -0.265, 0);
    knee.add(calf);

    const shoe = createSculptedShoe(side, textures.shoe);
    ankle.add(shoe);
  }

  const hairPivot = makeJoint(head, "hairPivot", [0, 0.14, 0]);
  const hairMesh = createSculptedHead(definition, textures);
  // Extract sculpted hair group onto hairPivot for subtle reactive cloth/hair spring motion
  const hairChild = hairMesh.children[hairMesh.children.length - 1];
  hairChild.position.y -= 0.14;
  hairPivot.add(hairChild);
  hairMesh.add(hairPivot);
  head.add(hairMesh);
  clothing.push({ joint: hairPivot, side: 1, kind: "hair" });

  const prop = createProp(rightHand, definition);
  return { root, model, joints, leftHand, rightHand, prop, clothing };
}

const _glowGold = new THREE.Color("#ffd447");
const _glowCyan = new THREE.Color("#4ef2ff");
const _glowColor = new THREE.Color();

/**
 * Apply or clear a pulsing gold/cyan rim emissive aura around the fighter's hands and prop
 * when their Super Meter reaches 100%.
 */
export function setSpecialReadyGlow(fighter, ready, time = 0) {
  if (!fighter) return;
  const pulse = 0.5 + 0.5 * Math.sin(time * 7.5);
  if (ready) {
    _glowColor.copy(_glowGold).lerp(_glowCyan, pulse);
  }
  const intensity = ready ? 0.45 + pulse * 0.35 : 0;

  for (const part of [fighter.leftHand, fighter.rightHand, fighter.prop]) {
    if (!part) continue;
    part.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat || !mat.emissive) continue;
        if (ready) {
          mat.emissive.copy(_glowColor);
          mat.emissiveIntensity = intensity;
        } else {
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
        }
      }
    });
  }
}
