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

/**
 * Paint a 128x128 PS1 pixel-shaded face texture aligned to the 16x16 sculpted head UVs:
 * u = 0.5 (x = 64) is center of face (+Z); v = 0.5 (y = 64) is mid-face equator.
 */
export function createFaceTexture(definition) {
  const surf = new PixelSurface(128, 128);
  const skin = hexToRgb(definition.skin);
  const skinShadow = scaleRgb(skin, 0.72, 6, -4, -2);
  const skinDeep = scaleRgb(skin, 0.56, 4, -6, -4);
  const skinLight = scaleRgb(skin, 1.12, 6, 4, 2);
  const blush = scaleRgb(skin, 0.94, 18, -6, -6);
  const hair = hexToRgb(definition.hair);
  const hairDark = scaleRgb(hair, 0.65);

  surf.fill(skin);

  // Subtle PS1 dithered skin shading & scalp/temple/jaw contours
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const bayer = ((x & 1) * 2 + (y & 1)) * 0.25 - 0.375;
      const distFromCenter = Math.abs(x - 64);

      // Scalp / hairline blend at top & back of head
      const hairlineY = 34 + Math.max(0, distFromCenter - 10) * 0.45;
      if (y < hairlineY) {
        const blend = clamp((hairlineY - y) / 5, 0, 1);
        const streak = ((x % 3 === 0) ? 1.06 : 0.92) + bayer * 0.06;
        surf.blendPixel(x, y, scaleRgb(hair, streak), blend);
        continue;
      }

      // Sideburns / back neck shadow
      if (distFromCenter > 30) {
        const sideT = clamp((distFromCenter - 30) / 14, 0, 1);
        surf.blendPixel(x, y, skinShadow, sideT * 0.55);
      }

      // Under-jaw & neck shadow at bottom
      if (y > 97) {
        const jawT = clamp((y - 97) / 18, 0, 1);
        surf.blendPixel(x, y, skinDeep, jawT * 0.80);
      }

      // Subtle forehead center highlight + dither
      if (y >= 36 && y <= 46 && distFromCenter < 16) {
        surf.blendPixel(x, y, skinLight, 0.22 + bayer * 0.06);
      }
    }
  }

  // Pronounced cheekbone highlights & warm blush
  for (const s of [-1, 1]) {
    surf.blendEllipse(64 + s * 15, 67, 7, 5, skinLight, 0.42, 1.5);
    surf.blendEllipse(64 + s * 14, 71, 6, 4, blush, 0.26, 1.6);
    // Hollow under cheekbone for sculpted Tekken 3 face planes
    surf.blendEllipse(64 + s * 16, 78, 7, 6, skinShadow, 0.32, 1.4);
  }

  // Renzi & Calenda sharp jawline shading
  if (definition.id === "renzi" || definition.id === "calenda") {
    for (const s of [-1, 1]) {
      surf.drawSegment(64 + s * 22, 82, 64 + s * 10, 99, 1.4, skinDeep, 0.55);
    }
  }

  // Recessed shaded eye sockets (centered at x = 56 and 72, y = 55)
  const isMeloni = definition.id === "meloni";
  const isCalenda = definition.id === "calenda";
  const isConte = definition.id === "conte";
  const irisColor =
    isMeloni ? [74, 128, 178] :
    definition.id === "tajani" ? [98, 108, 118] :
    [66, 46, 36];

  for (const s of [-1, 1]) {
    const ex = 64 + s * 8;
    const ey = 56;
    // Orbital shadow
    surf.blendEllipse(ex, ey - 1, 6.5, 4.8, skinShadow, 0.68, 1.3);
    surf.blendEllipse(ex - s * 2, ey - 2, 3.5, 3.2, skinDeep, 0.45, 1.3);

    // Sclera & upper-lid shadow
    const eyeH = isMeloni ? 2.4 : isCalenda ? 1.9 : 2.2;
    surf.fillRect(ex - 3, ey - 1, 7, isCalenda ? 2 : 3, [238, 232, 220], 0.95);
    surf.fillRect(ex - 3, ey - 1, 7, 1, [190, 182, 172], 0.85);

    // Iris, pupil, specular pixel catchlight
    surf.fillRect(ex - 1, ey - 1, 3, 3, irisColor, 0.96);
    surf.blendPixel(ex, ey, [22, 18, 24], 1.0);
    surf.blendPixel(ex - 1, ey - 1, [255, 252, 242], 0.9);

    // Upper lash line (sharper angled wing for Meloni)
    const lashY0 = ey - 2;
    const lashY1 = isMeloni ? ey - 3 : ey - 2;
    surf.drawSegment(ex - s * 3, lashY0, ex + s * 4, lashY1, 0.5, [28, 22, 26], 0.92);
    // Lower eyelid crease
    surf.drawSegment(ex - 2, ey + Math.round(eyeH), ex + 2, ey + Math.round(eyeH), 0.4, skinShadow, 0.65);

    // Expressive eyebrows (y = 46..49)
    const browColor = definition.id === "meloni"
      ? scaleRgb(hair, 0.62)
      : definition.id === "tajani"
        ? scaleRgb(hair, 0.72)
        : hairDark;
    const bxIn = 64 + s * 4;
    const bxOut = 64 + s * 13;
    const byIn = isCalenda ? 49 : isMeloni ? 48 : 47;
    const byMid = isConte ? 45 : isMeloni ? 45 : 46;
    const byOut = isMeloni ? 46 : isConte ? 47 : 48;
    surf.drawSegment(bxIn, byIn, 64 + s * 8.5, byMid, isConte || isCalenda ? 1.0 : 0.85, browColor, 0.95);
    surf.drawSegment(64 + s * 8.5, byMid, bxOut, byOut, 0.7, browColor, 0.90);
  }

  // Sculpted nose bridge highlight, side shadows & nostrils
  const bridgeWidth = definition.id === "schlein" ? 1.5 : 1.1;
  surf.drawSegment(64, 51, 64, 69, bridgeWidth, skinLight, 0.78);
  surf.blendEllipse(64, 70, 2.4, 2.0, skinLight, 0.55, 1.5);
  for (const s of [-1, 1]) {
    surf.drawSegment(64 + s * 2.5, 53, 64 + s * 3.0, 70, 0.8, skinShadow, 0.52);
    surf.blendPixel(64 + s * 2, 72, skinDeep, 0.88);
    surf.blendPixel(64 + s * 3, 72, skinShadow, 0.65);
  }
  surf.drawSegment(62, 74, 66, 74, 0.6, skinShadow, 0.62);

  // Nasolabial folds (stronger on Calenda, Tajani, Salvini, Conte)
  const foldAlpha = isMeloni || definition.id === "schlein" ? 0.34 : 0.62;
  for (const s of [-1, 1]) {
    surf.drawSegment(64 + s * 4, 72, 64 + s * 9, 85, 0.65, skinShadow, foldAlpha);
  }

  // Lip shading & philtrum
  surf.drawSegment(64, 76, 64, 81, 0.5, skinShadow, 0.40);
  const lipUpper = isMeloni || definition.id === "schlein" ? [178, 92, 92] : [148, 86, 80];
  const lipLower = scaleRgb(lipUpper, 1.20, 12, 8, 6);
  const mouthLine = [64, 34, 38];
  surf.drawSegment(59, 85, 64, 84, 0.8, lipUpper, 0.85);
  surf.drawSegment(64, 84, 69, 85, 0.8, lipUpper, 0.85);
  surf.drawSegment(58, 86, 70, 86, 0.45, mouthLine, 0.90);
  surf.drawSegment(60, 88, 68, 88, 0.9, lipLower, 0.78);
  // Chin cleft shadow
  surf.drawSegment(61, 91, 67, 91, 0.6, skinShadow, 0.55);

  // Salvini's salt-and-pepper beard across cheeks, jawline, chin & mustache
  if (definition.beard) {
    const pepper = [176, 182, 190];
    const darkHair = scaleRgb(hair, 0.78);
    for (let y = 74; y <= 114; y += 1) {
      for (let x = 40; x <= 88; x += 1) {
        const dx = Math.abs(x - 64);
        const inJaw = y >= 88 && dx <= 22 - (y - 88) * 0.32;
        const inCheek = y >= 74 && y < 88 && dx >= 10 && dx <= 22;
        const inMustache = y >= 78 && y <= 84 && dx <= 8;
        const inSoulPatch = y >= 89 && y <= 95 && dx <= 4;
        if (inJaw || inCheek || inMustache || inSoulPatch) {
          // Leave lips visible
          if (y >= 84 && y <= 89 && dx <= 7) continue;
          const n = hash2d(x, y);
          const edgeFade = inCheek && y < 78 ? 0.45 : 0.82;
          const tone = n > 0.72 ? pepper : n > 0.35 ? hair : darkHair;
          surf.blendPixel(x, y, tone, edgeFade * (0.65 + n * 0.35));
        }
      }
    }
  }

  return surf.toCanvasTexture();
}

export function createSuitTexture(suitColor, accentColor, options = {}) {
  const surf = new PixelSurface(128, 128);
  const base = hexToRgb(suitColor);
  const dark = scaleRgb(base, 0.82);
  const stripe = scaleRgb(base, 1.18, 8, 8, 10);
  const buttonCol = [28, 26, 32];
  const buttonHi = [96, 94, 105];

  surf.fill(base);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      // Crisp PS1 pinstripe every 8px + subtle wool weave dither
      if (x % 8 === 0) {
        surf.blendPixel(x, y, stripe, 0.55);
      } else if ((x + y) % 2 === 0) {
        surf.blendPixel(x, y, dark, 0.14);
      }
    }
  }

  if (options.buttons) {
    // Two tailored jacket buttons along center-front u ~ 0 (or front center seam)
    for (const by of [86, 104]) {
      surf.blendEllipse(64, by, 3, 3, buttonCol, 0.95, 0.6);
      surf.blendPixel(63, by - 1, buttonHi, 0.9);
    }
  }

  if (accentColor) {
    const acc = hexToRgb(accentColor);
    surf.drawSegment(0, 124, 127, 124, 0.8, acc, 0.35);
  }

  return surf.toCanvasTexture();
}

export function createTieTexture(tieColor, accentColor) {
  const surf = new PixelSurface(128, 128);
  const base = hexToRgb(tieColor);
  const dark = scaleRgb(base, 0.76);
  const light = scaleRgb(base, 1.22, 10, 10, 10);
  const acc = accentColor ? hexToRgb(accentColor) : light;

  surf.fill(base);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const diag = (x + y) % 12;
      if (diag < 2) {
        surf.blendPixel(x, y, mixRgb(light, acc, 0.45), 0.55);
      } else if (diag === 6) {
        surf.blendPixel(x, y, dark, 0.35);
      } else if ((x + y) % 2 === 0) {
        surf.blendPixel(x, y, dark, 0.12);
      }
    }
  }
  return surf.toCanvasTexture();
}

export function createTrouserTexture(trouserColor) {
  const surf = new PixelSurface(128, 128);
  const base = hexToRgb(trouserColor);
  const dark = scaleRgb(base, 0.74);
  const stripe = scaleRgb(base, 1.15, 4, 4, 6);

  surf.fill(base);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      if (x % 8 === 0) surf.blendPixel(x, y, stripe, 0.38);
      if ((x + y) % 2 === 0) surf.blendPixel(x, y, dark, 0.16);
      if (y > 106) surf.blendPixel(x, y, dark, ((y - 106) / 22) * 0.45);
    }
  }
  return surf.toCanvasTexture();
}

export function createSkinTexture(skinColor) {
  const surf = new PixelSurface(128, 128);
  const base = hexToRgb(skinColor);
  const shadow = scaleRgb(base, 0.84, 4, -2, -2);
  const light = scaleRgb(base, 1.08, 4, 3, 2);

  surf.fill(base);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      if ((x + y) % 2 === 0) {
        surf.blendPixel(x, y, shadow, 0.10);
      } else if (x > 40 && x < 88 && y > 32 && y < 96) {
        surf.blendPixel(x, y, light, 0.10);
      }
    }
  }
  return surf.toCanvasTexture();
}

export function createHairTexture(hairColor, definition) {
  const surf = new PixelSurface(128, 128);
  const base = hexToRgb(hairColor);
  const dark = scaleRgb(base, 0.68);
  const light = scaleRgb(base, 1.24, 8, 6, 4);
  const silver = [218, 224, 232];

  surf.fill(base);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const strand = (x + Math.floor(Math.sin(y * 0.18) * (definition.wavyHair ? 2.5 : 0.8))) % 6;
      if (strand === 0 || strand === 1) {
        surf.blendPixel(x, y, dark, 0.55);
      } else if (strand === 3) {
        const hi = definition.id === "tajani" ? silver : light;
        surf.blendPixel(x, y, hi, 0.45);
      }
      if (y > 96) surf.blendPixel(x, y, dark, ((y - 96) / 32) * 0.45);
    }
  }
  return surf.toCanvasTexture();
}

export function createShirtTexture(shirtColor) {
  const surf = new PixelSurface(128, 128);
  const base = hexToRgb(shirtColor);
  const weave = scaleRgb(base, 0.90);

  surf.fill(base);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      if ((x + y) % 2 === 0) surf.blendPixel(x, y, weave, 0.25);
      if (x === 62 || x === 66) surf.blendPixel(x, y, weave, 0.55);
    }
  }
  return surf.toCanvasTexture();
}

export function createShoeTexture(shoeColor = "#1f1d25") {
  const surf = new PixelSurface(128, 128);
  const base = hexToRgb(shoeColor);
  const hi = scaleRgb(base, 1.45, 8, 8, 10);
  const sole = [14, 12, 18];

  surf.fill(base);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      if (y < 26) surf.blendPixel(x, y, sole, 0.85);
      else if (y > 68 && y < 96 && x > 42 && x < 86) surf.blendPixel(x, y, hi, 0.28);
    }
  }
  return surf.toCanvasTexture();
}

/**
 * Generate the full set of 128x128 NearestFilter PS1 textures for one fighter.
 */
export function generateFighterTextures(definition) {
  return {
    face: createFaceTexture(definition),
    suit: createSuitTexture(definition.suit, definition.accent, { buttons: true }),
    sleeve: createSuitTexture(definition.id === "salvini" ? "#d8dfdf" : definition.suit, null),
    tie: createTieTexture(definition.tie, definition.accent),
    trousers: createTrouserTexture("#2f2c38"),
    skin: createSkinTexture(definition.skin),
    hair: createHairTexture(definition.hair, definition),
    shirt: createShirtTexture("#f2eee4"),
    shoe: createShoeTexture("#1f1d25")
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

    let factor = 0.88 + 0.14 * ny + 0.06 * nz;
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
    roughness: options.roughness ?? 0.72,
    metalness: options.metalness ?? 0.04,
    vertexColors: true,
    flatShading: false,
    side: options.side ?? THREE.FrontSide,
    emissive: options.emissive ?? "#000000",
    emissiveIntensity: options.emissiveIntensity ?? 0
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
  const heightSteps = 10;
  const rings = [];

  for (let h = 0; h <= heightSteps; h += 1) {
    const t = h / heightSteps;
    const y = -0.06 + t * 0.75;

    let rx, rz;
    if (t < 0.30) {
      const u = t / 0.30;
      rx = THREE.MathUtils.lerp(0.180, 0.152, u) * widthScale;
      rz = THREE.MathUtils.lerp(0.114, 0.102, u);
    } else if (t < 0.80) {
      const u = (t - 0.30) / 0.50;
      const smooth = u * u * (3 - 2 * u);
      rx = THREE.MathUtils.lerp(0.152, 0.246, smooth) * widthScale;
      rz = THREE.MathUtils.lerp(0.102, 0.144, smooth);
    } else if (t < 0.92) {
      const u = (t - 0.80) / 0.12;
      rx = THREE.MathUtils.lerp(0.246, 0.220, u) * widthScale;
      rz = THREE.MathUtils.lerp(0.144, 0.112, u);
    } else {
      const u = (t - 0.92) / 0.08;
      rx = THREE.MathUtils.lerp(0.220, 0.096, u * u);
      rz = THREE.MathUtils.lerp(0.112, 0.084, u);
    }

    const vOpenWidth = t > 0.44 ? THREE.MathUtils.lerp(0.010, 0.078, (t - 0.44) / 0.56) : 0;
    const ring = [];
    for (let i = 0; i < radial; i += 1) {
      const theta = (i / radial) * Math.PI * 2;
      const sx = Math.sin(theta);
      const cz = Math.cos(theta);
      const x = Math.sign(sx) * Math.pow(Math.abs(sx), 0.84) * rx;
      let z = Math.sign(cz) * Math.pow(Math.abs(cz), 0.88) * rz;

      if (cz > 0.2 && t > 0.50 && t < 0.86) {
        z += Math.sin(((t - 0.50) / 0.36) * Math.PI) * 0.015 * cz;
      }
      if (cz < -0.5 && Math.abs(x) < 0.045 && t > 0.25 && t < 0.88) {
        z += 0.012 * (1 - Math.abs(x) / 0.045);
      }
      if (cz > 0.25 && t > 0.44 && Math.abs(x) < vOpenWidth) {
        const depthBlend = 1 - Math.abs(x) / Math.max(vOpenWidth, 0.001);
        z -= 0.046 * (0.4 + 0.6 * depthBlend);
      }
      if (cz > 0.7 && t < 0.14 && Math.abs(x) < 0.028) {
        z -= 0.014 * (1 - t / 0.14);
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
      const t = clamp((y + 0.06) / 0.75, 0, 1);
      const inVNeck = z < 0.105 && z > 0.02 && t > 0.44 && Math.abs(x) < 0.085;
      const underarm = Math.abs(x) > 0.16 && t > 0.45 && t < 0.76 ? 0.14 : 0;
      const hemDark = t < 0.24 ? (0.24 - t) * 0.65 : 0;
      const vNeckShadow = inVNeck ? 0.24 : 0;
      const chestHighlight = nz > 0.4 && t > 0.55 && t < 0.85 ? 0.07 : 0;
      return clamp(0.92 + 0.10 * ny + chestHighlight - underarm - hemDark - vNeckShadow, 0.52, 1.08);
    },
    { map: suitTex }
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
        if (y < -0.088) return 0.58;
        const vampHighlight = ny > 0.35 && z > 0.02 ? 0.18 : 0;
        return clamp(0.88 + 0.12 * ny + vampHighlight, 0.55, 1.12);
      },
      { roughness: 0.42, metalness: 0.12, map: shoeTex }
    )
  );

  const heelRings = [
    [[-0.044, -0.120, -0.022], [0.044, -0.120, -0.022], [0.042, -0.120, -0.094], [-0.042, -0.120, -0.094]],
    [[-0.048, -0.070, -0.020], [0.048, -0.070, -0.020], [0.046, -0.070, -0.096], [-0.046, -0.070, -0.096]]
  ];
  group.add(
    buildShadedMesh(
      createLoftedGeometry(heelRings, true, true),
      "#141218",
      (x, y, z, nx, ny) => (ny < -0.2 ? 0.54 : 0.78),
      { roughness: 0.55, map: shoeTex }
    )
  );

  group.rotation.y = side > 0 ? 0.28 : -0.14;
  return group;
}

function createSculptedFist(side, skinColor, cuffColor, skinTex, cuffTex, isTajani = false) {
  const group = new THREE.Group();
  const s = side;

  const cuff = createSculptedLimb(0.044, 0.043, 0.041, 0.055, 10, 2, cuffColor, {
    side: s,
    material: { roughness: 0.65, map: cuffTex }
  });
  cuff.position.set(0, 0.022, 0);
  group.add(cuff);

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

  const fistRings = [
    [
      [-0.028 * s, -0.100, 0.024],
      [0.030 * s, -0.100, 0.024],
      [0.032 * s, -0.098, -0.022],
      [-0.026 * s, -0.098, -0.022]
    ],
    [
      [-0.036 * s, -0.056, 0.044],
      [0.042 * s, -0.068, 0.038],
      [0.040 * s, -0.062, -0.030],
      [-0.034 * s, -0.046, -0.028]
    ],
    [
      [-0.036 * s, -0.024, 0.036],
      [0.040 * s, -0.030, 0.032],
      [0.038 * s, -0.028, -0.028],
      [-0.034 * s, -0.020, -0.026]
    ],
    [
      [-0.032 * s, 0.004, 0.028],
      [0.032 * s, 0.004, 0.028],
      [0.032 * s, 0.004, -0.024],
      [-0.032 * s, 0.004, -0.024]
    ]
  ];
  const orientedFistRings = s < 0
    ? fistRings.map((ring) => [ring[1], ring[0], ring[3], ring[2]])
    : fistRings;
  const fistGeo = createLoftedGeometry(orientedFistRings, true, true);
  group.add(
    buildShadedMesh(
      fistGeo,
      skinColor,
      (x, y, z, nx, ny, nz) => {
        const innerPalm = x * s < 0 && z < 0.01 ? 0.20 : 0;
        const knuckleLight = y > -0.075 && y < -0.03 && nz > 0.2 ? 0.08 : 0;
        return clamp(0.88 + 0.12 * ny + knuckleLight - innerPalm, 0.56, 1.08);
      },
      { map: skinTex }
    )
  );

  const thumbGeo = new THREE.CylinderGeometry(0.015, 0.019, 0.064, 6, 2);
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
    (x, y, z, nx, ny) => clamp(0.86 + 0.14 * ny, 0.60, 1.06),
    { map: skinTex }
  );
  thumb.position.set(-s * 0.032, -0.054, 0.030);
  thumb.rotation.set(0.35, 0, s * 0.65);
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
    for (const s of [-1, 1]) {
      group.add(
        createTaperedStrand(
          [[s * 0.082, 0.215, 0.015], [s * 0.118, 0.120, 0.028], [s * 0.122, 0.015, 0.022], [s * 0.102, -0.085, 0.006]],
          [0.032, 0.044, 0.038, 0.014],
          [0.052, 0.068, 0.056, 0.022],
          7,
          hairColor,
          0,
          hairTex
        )
      );
      group.add(
        createTaperedStrand(
          [[s * 0.065, 0.180, -0.065], [s * 0.095, 0.080, -0.090], [s * 0.086, -0.055, -0.095]],
          [0.042, 0.048, 0.020],
          [0.035, 0.040, 0.018],
          6,
          hairColor,
          -0.06,
          hairTex
        )
      );
    }
    group.add(
      createTaperedStrand(
        [[-0.035, 0.228, 0.096], [0.028, 0.195, 0.118], [0.092, 0.148, 0.102]],
        [0.026, 0.030, 0.012],
        [0.020, 0.024, 0.010],
        6,
        hairColor,
        0.05,
        hairTex
      )
    );
  } else if (definition.wavyHair) {
    for (const s of [-1, 1]) {
      group.add(
        createTaperedStrand(
          [[s * 0.068, 0.232, 0.055], [s * 0.116, 0.165, 0.035], [s * 0.120, 0.075, -0.010], [s * 0.100, -0.025, -0.045]],
          [0.034, 0.042, 0.036, 0.015],
          [0.042, 0.048, 0.044, 0.018],
          7,
          hairColor,
          0,
          hairTex
        )
      );
      group.add(
        createTaperedStrand(
          [[s * 0.042, 0.246, 0.086], [s * 0.078, 0.218, 0.102], [s * 0.104, 0.155, 0.086]],
          [0.024, 0.028, 0.012],
          [0.024, 0.026, 0.012],
          6,
          hairColor,
          0.04,
          hairTex
        )
      );
    }
  } else if (definition.slickHair) {
    for (const offsetX of [-0.042, 0, 0.042]) {
      group.add(
        createTaperedStrand(
          [[offsetX * 0.8, 0.205, 0.098], [offsetX, 0.258, 0.025], [offsetX * 1.1, 0.228, -0.075], [offsetX, 0.115, -0.122]],
          [0.026, 0.034, 0.030, 0.016],
          [0.022, 0.028, 0.024, 0.012],
          6,
          hairColor,
          0.03,
          hairTex
        )
      );
    }
  } else if (definition.id === "renzi") {
    group.add(
      createTaperedStrand(
        [[-0.065, 0.218, 0.082], [-0.005, 0.254, 0.105], [0.068, 0.242, 0.086]],
        [0.022, 0.034, 0.016],
        [0.024, 0.032, 0.016],
        6,
        hairColor,
        0.05,
        hairTex
      )
    );
  } else {
    const sweepSign = definition.id === "tajani" ? -1 : 1;
    group.add(
      createTaperedStrand(
        [[-0.068 * sweepSign, 0.222, 0.082], [0.005, 0.244, 0.098], [0.078 * sweepSign, 0.214, 0.076]],
        [0.018, 0.028, 0.014],
        [0.020, 0.026, 0.014],
        6,
        hairColor,
        0.03,
        hairTex
      )
    );
  }

  return group;
}

/**
 * Create a 16x16 vertex-sculpted human head mesh with tapered jawline & chin,
 * pronounced cheekbones, brow ridge, recessed eye sockets, sculpted bridge nose,
 * ears, and a 128x128 NearestFilter PS1 face texture.
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

  for (let i = 0; i < pos.count; i += 1) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const u = uv.getX(i);
    const v = uv.getY(i);

    // Base human head proportions (~0.22 wide, 0.32 tall, 0.25 deep)
    x *= isCalenda ? 0.83 : 0.80;
    y *= 1.185;
    z *= 0.90;

    // Tapered jawline and forward chin
    if (v < 0.45) {
      const jawT = clamp((0.45 - v) / 0.45, 0, 1);
      const jawTaper = isRenzi ? 0.39 : 0.34;
      x *= 1 - jawTaper * jawT;
      if (z > 0) {
        const chinFocus = Math.exp(-Math.pow((u - 0.5) / 0.085, 2)) * Math.exp(-Math.pow((v - 0.22) / 0.12, 2));
        z += (isRenzi ? 0.022 : 0.017) * chinFocus;
      } else {
        z *= 1 - 0.30 * jawT;
      }
      if (v < 0.14) y += (0.14 - v) * 0.07;
    }

    // Brow ridge
    const browRidge = Math.exp(-Math.pow((v - 0.65) / 0.055, 2)) * Math.exp(-Math.pow((u - 0.5) / 0.14, 2));
    z += 0.011 * browRidge;

    // Recessed eye sockets (u = 0.4375 and u = 0.5625, v = 0.57)
    const socketL = Math.exp(-Math.pow((u - 0.4375) / 0.042, 2)) * Math.exp(-Math.pow((v - 0.57) / 0.055, 2));
    const socketR = Math.exp(-Math.pow((u - 0.5625) / 0.042, 2)) * Math.exp(-Math.pow((v - 0.57) / 0.055, 2));
    z -= 0.015 * (socketL + socketR);

    // Pronounced cheekbones
    const cheekL = Math.exp(-Math.pow((u - 0.38) / 0.065, 2)) * Math.exp(-Math.pow((v - 0.46) / 0.065, 2));
    const cheekR = Math.exp(-Math.pow((u - 0.62) / 0.065, 2)) * Math.exp(-Math.pow((v - 0.46) / 0.065, 2));
    const cheek = cheekL + cheekR;
    x += Math.sign(x) * 0.007 * cheek;
    z += 0.011 * cheek;

    // Sculpted bridge nose & tip directly in head mesh (prominent profile for Schlein)
    const noseBridge = Math.exp(-Math.pow((u - 0.5) / 0.034, 2));
    const noseTip = Math.exp(-Math.pow((v - 0.455) / 0.075, 2)) * 0.026;
    const noseUpper = Math.exp(-Math.pow((v - 0.555) / 0.055, 2)) * 0.015;
    z += noseBridge * (noseTip + noseUpper) * (isSchlein ? 1.28 : 1.0);

    // Subtle mouth/muzzle projection
    const muzzle = Math.exp(-Math.pow((u - 0.5) / 0.065, 2)) * Math.exp(-Math.pow((v - 0.33) / 0.05, 2));
    z += 0.006 * muzzle;

    pos.setXYZ(i, x, y + 0.08, z);
  }
  skullGeo.computeVertexNormals();

  const headMesh = buildShadedMesh(
    skullGeo,
    definition.skin,
    (x, y, z, nx, ny, nz) => {
      const underJaw = y < 0.03 && ny < -0.15 ? 0.28 * Math.max(0, -ny) : 0;
      const eyeSocket = z > 0.07 && y > 0.06 && y < 0.12 && Math.abs(x) > 0.015 && Math.abs(x) < 0.068 ? 0.12 : 0;
      const neckShadow = y < -0.03 && z < 0.03 ? 0.18 : 0;
      const browHighlight = nz > 0.5 && y > 0.12 && y < 0.18 ? 0.06 : 0;
      return clamp(0.95 + 0.09 * ny + browHighlight - underJaw - eyeSocket - neckShadow, 0.56, 1.08);
    },
    { map: textures.face, roughness: 0.70 }
  );
  headGroup.add(headMesh);

  // Sculpted ears on sides of head
  for (const s of [-1, 1]) {
    const earGeo = new THREE.CylinderGeometry(0.017, 0.013, 0.050, 6, 2);
    const ePos = earGeo.attributes.position;
    for (let i = 0; i < ePos.count; i += 1) {
      if (ePos.getZ(i) > 0) ePos.setZ(i, ePos.getZ(i) * 0.75);
    }
    earGeo.computeVertexNormals();
    const ear = buildShadedMesh(
      earGeo,
      definition.skin,
      (x, y, z, nx, ny) => clamp(0.80 + 0.14 * ny, 0.60, 0.96),
      { map: textures.skin }
    );
    ear.position.set(s * 0.107, 0.064, -0.008);
    ear.rotation.z = -s * 0.14;
    ear.scale.set(0.55, 1, 0.85);
    headGroup.add(ear);
  }

  // Thin-rimmed / tailored glasses aligned cleanly with textured eye sockets
  if (definition.glasses) {
    const isThin = definition.id === "salvini";
    const tube = isThin ? 0.0032 : 0.0048;
    const rimRadius = isThin ? 0.027 : 0.028;
    for (const x of [-0.042, 0.042]) {
      const rimGeo = new THREE.TorusGeometry(rimRadius, tube, 5, 12);
      const rim = buildShadedMesh(
        rimGeo,
        "#25242a",
        (vx, vy) => clamp(0.86 + vy * 3.0, 0.68, 1.05),
        { roughness: 0.32, metalness: 0.35 }
      );
      rim.position.set(x, 0.088, 0.123);
      headGroup.add(rim);
    }
    const bridge = createTaperedStrand(
      [[-0.016, 0.091, 0.125], [0, 0.093, 0.127], [0.016, 0.091, 0.125]],
      [tube, tube, tube],
      [tube, tube, tube],
      5,
      "#25242a"
    );
    headGroup.add(bridge);
  }

  headGroup.add(createSculptedHair(definition, textures.hair));
  return headGroup;
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
  addShadedBox(parent, [0.028, 0.72, 0.028], [x, y + 0.34, z], "#d9c7a0");
  colors.forEach((color, index) => {
    addShadedBox(parent, [0.25, 0.21, 0.022], [x + 0.14, y + 0.58 - index * 0.21, z], color);
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
      addShadedBox(prop, [0.34, 0.14, 0.21], [0.14, 0.06, 0], "#dfaa22");
      addShadedBox(prop, [0.10, 0.58, 0.12], [0.33, 0.29, 0], "#efc52e", { rotation: [0, 0, -0.55] });
      addShadedSphere(prop, 0.08, [0.48, 0.52, 0], "#4b4b48");
      addShadedBox(prop, [0.10, 0.44, 0.12], [0.62, 0.38, 0], "#f4ca36", { rotation: [0, 0, 0.65] });
      addShadedBox(prop, [0.27, 0.16, 0.25], [0.72, 0.18, 0], "#efbd21", { rotation: [0, 0, 0.35] });
      addShadedBox(prop, [0.27, 0.032, 0.26], [0.75, 0.10, 0], "#6e6145");
      break;
    case "briefcase":
      addShadedBox(prop, [0.48, 0.35, 0.18], [0.10, -0.14, 0], "#8c5c37");
      addShadedBox(prop, [0.17, 0.04, 0.04], [0.10, 0.09, 0.10], "#d7b15d");
      break;
    case "dossier":
      for (let i = 0; i < 5; i += 1) {
        addShadedBox(prop, [0.56, 0.095, 0.38], [0.10, i * 0.09 - 0.17, 0.04], i % 2 ? "#fffaf0" : "#e5e1d8");
        addShadedBox(prop, [0.055, 0.09, 0.39], [-0.15, i * 0.09 - 0.17, 0.04], "#b9453c");
      }
      break;
    case "microphone":
      addShadedBox(prop, [0.06, 0.44, 0.06], [0, 0.16, 0], "#33323a");
      addShadedSphere(prop, 0.088, [0, 0.42, 0], "#55545d", [1, 1.25, 1]);
      break;
    case "palette":
      addShadedBox(prop, [0.42, 0.28, 0.07], [0.06, 0.02, 0], "#e5d3b6");
      ["#e2655e", "#e7c854", "#70b988", "#618dc8"].forEach((color, index) => {
        addShadedSphere(prop, 0.065, [-0.07 + index * 0.095, 0.04, 0.06], color);
      });
      break;
    case "pen": {
      addShadedBox(prop, [0.075, 0.64, 0.075], [0, 0.15, 0], "#d8ad4c", { metalness: 0.45 });
      addShadedBox(prop, [0.26, 0.052, 0.07], [0, 0.04, 0], "#f1d27b", { metalness: 0.45 });
      const nibGeo = new THREE.ConeGeometry(0.068, 0.18, 4);
      const nib = buildShadedMesh(nibGeo, "#ffdf7b", (x, y) => clamp(0.9 + y * 2, 0.7, 1.1), {
        roughness: 0.3,
        metalness: 0.5
      });
      nib.position.y = 0.55;
      prop.add(nib);
      break;
    }
    case "plant":
      addShadedBox(prop, [0.075, 0.96, 0.075], [0, 0.25, 0], "#785a35");
      addShadedBox(prop, [0.30, 0.24, 0.26], [0, -0.24, 0], "#b96951");
      addShadedSphere(prop, 0.20, [0, 0.76, 0], "#5da465", [1, 1.25, 0.8]);
      addShadedSphere(prop, 0.14, [-0.14, 0.62, 0], "#82b96d");
      addShadedSphere(prop, 0.14, [0.14, 0.66, 0], "#73b568");
      break;
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
export function applyKickAnimation(joints, { style = "roundhouse", side = "left", progress = 0 } = {}) {
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

  if (style === "axe") {
    // Combo Finisher (3rd hit of U->I->K or J->K->K): Jumping spinning heel-axe kick
    const p = curve.progress;
    const jumpArc = p < 0.10
      ? -0.06 * smooth01(p / 0.10)
      : Math.sin(clamp((p - 0.10) / 0.84, 0, 1) * Math.PI);
    verticalLift = jumpArc > 0 ? 0.35 * jumpArc : jumpArc;
    const spinT = smooth01((p - 0.04) / 0.84);
    joints.hips.rotation.y += Math.PI * 2 * spinT;

    // Stand leg stays tucked slightly in air then catches landing smoothly
    supportHip.rotation.x -= 0.34 * standDip;
    supportKnee.rotation.x += 0.68 * standDip;

    // Leg rises overhead in Phase 1 then chops downward from peak (0.36..0.62) before re-chambering
    const overhead = p <= 0.42
      ? lift * 1.15
      : THREE.MathUtils.lerp(1.15, 0.52, clamp((p - 0.42) / 0.20, 0, 1)) * (p > 0.62 ? lift / 0.94 : 1);
    hip.rotation.y = THREE.MathUtils.lerp(hip.rotation.y, 0.35, lift);
    hip.rotation.x = THREE.MathUtils.lerp(hip.rotation.x, -2.05 * overhead, lift);
    hip.rotation.z = THREE.MathUtils.lerp(hip.rotation.z, 0.72 * lift, lift);
    knee.rotation.x = kneeAngle;
    knee.rotation.z = THREE.MathUtils.lerp(knee.rotation.z, 0, lift);
    ankle.rotation.x = THREE.MathUtils.lerp(ankle.rotation.x, -0.25, lift);

    joints.torso.rotation.z += 0.40 * lift;
    joints.torso.rotation.x -= 0.18 * lift;
    leadArm.rotation.z = THREE.MathUtils.lerp(leadArm.rotation.z, 1.9, lift);
    rearArm.rotation.z = THREE.MathUtils.lerp(rearArm.rotation.z, 1.8, lift);
    support = "both";
  } else if (style === "roundhouse") {
    // KICK_L: Fast High Roundhouse / Mawashi Geri
    // Standing knee bends to dip pelvis -0.08 while glued to floor
    supportHip.rotation.x -= 0.32 * standDip;
    supportKnee.rotation.x += 0.64 * standDip;

    // Hip pivots open cleanly (YXZ), whipping leg horizontally across head height
    joints.hips.rotation.y += 1.1 * lift;
    hip.rotation.y = THREE.MathUtils.lerp(hip.rotation.y, 0.52 + 0.38 * extension, lift);
    hip.rotation.x = THREE.MathUtils.lerp(hip.rotation.x, -1.52, lift);
    hip.rotation.z = THREE.MathUtils.lerp(hip.rotation.z, 0.45 + 0.55 * extension, lift);
    knee.rotation.x = kneeAngle;
    knee.rotation.z = THREE.MathUtils.lerp(knee.rotation.z, 0, lift);
    ankle.rotation.x = THREE.MathUtils.lerp(ankle.rotation.x, 0.45, lift);

    // Torso leans back and away; lead arm whips downward for angular momentum while rear hand guards chin
    joints.torso.rotation.z += 0.45 * lift;
    joints.torso.rotation.x -= 0.24 * lift;
    joints.torso.rotation.y -= 0.48 * lift;

    leadArm.rotation.z = THREE.MathUtils.lerp(leadArm.rotation.z, 0.22, lift);
    leadArm.rotation.x = THREE.MathUtils.lerp(leadArm.rotation.x, 0.52, lift);
    leadElbow.rotation.z = THREE.MathUtils.lerp(leadElbow.rotation.z, 0.35, lift);
    rearArm.rotation.z = THREE.MathUtils.lerp(rearArm.rotation.z, 1.25, lift);
    rearArm.rotation.x = THREE.MathUtils.lerp(rearArm.rotation.x, -0.55, lift);
    rearElbow.rotation.z = THREE.MathUtils.lerp(rearElbow.rotation.z, 2.05, lift);
  } else {
    // KICK_R: Heavy Thrusting Side Kick / Yoko Geri
    // Standing knee bends to dip pelvis -0.08 while glued to floor
    supportHip.rotation.x -= 0.32 * standDip;
    supportKnee.rotation.x += 0.64 * standDip;

    // Hips turn perpendicular (-PI/2 relative to opponent face-on -> -0.32.. side orientation), rear leg chambers high to chest then thrusts along +X
    joints.hips.rotation.y += -Math.PI / 2 * 0.25 * lift;
    hip.rotation.y = THREE.MathUtils.lerp(hip.rotation.y, -Math.PI / 2 * 0.22, lift);
    hip.rotation.z = THREE.MathUtils.lerp(hip.rotation.z, 1.10 + 0.46 * extension, lift);
    hip.rotation.x = THREE.MathUtils.lerp(hip.rotation.x, -0.95 * (1 - extension * 0.85), lift);
    knee.rotation.x = kneeAngle;
    knee.rotation.z = THREE.MathUtils.lerp(knee.rotation.z, 0.04, lift);
    ankle.rotation.x = THREE.MathUtils.lerp(ankle.rotation.x, -0.25, lift);

    // Torso counterbalances away from the thrusting X-axis kick
    joints.torso.rotation.z += 0.55 * lift;
    joints.torso.rotation.x -= 0.14 * lift;
    joints.torso.rotation.y += 0.28 * lift;

    leadArm.rotation.z = THREE.MathUtils.lerp(leadArm.rotation.z, 0.95, lift);
    leadElbow.rotation.z = THREE.MathUtils.lerp(leadElbow.rotation.z, 1.75, lift);
    rearArm.rotation.z = THREE.MathUtils.lerp(rearArm.rotation.z, 1.35, lift);
    rearElbow.rotation.z = THREE.MathUtils.lerp(rearElbow.rotation.z, 1.85, lift);
  }

  updateGroundedRig(joints, { support, lift: verticalLift });
  return { ...curve, support, verticalLift };
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

  const tie = new THREE.Color(definition.tie);
  tie.offsetHSL(0.38, 0.1, -0.06);

  return {
    ...definition,
    suit: `#${suit.getHexString()}`,
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
  const leftShoulder = makeJoint(torso, "leftShoulder", [-shoulderX, 0.64, 0.05]);
  const rightShoulder = makeJoint(torso, "rightShoulder", [shoulderX, 0.64, 0.01]);
  const leftElbow = makeJoint(leftShoulder, "leftElbow", [0, -0.39, 0]);
  const rightElbow = makeJoint(rightShoulder, "rightElbow", [0, -0.39, 0]);
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

  const trouserColor = "#2f2c38";

  hips.add(createSculptedPelvis(trouserColor, widthScale, textures.trousers));

  torso.add(createSculptedJacket(definition.suit, widthScale, textures.suit));
  torso.add(createTrapezius(definition.suit, widthScale, textures.suit));
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
    createSculptedFist(-1, definition.skin, wristCuffColor, textures.skin, wristCuffTex, definition.id === "tajani")
  );
  rightHand.add(
    createSculptedFist(1, definition.skin, wristCuffColor, textures.skin, wristCuffTex, definition.id === "tajani")
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
