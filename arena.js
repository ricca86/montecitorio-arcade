import * as THREE from "./vendor/three/three.module.min.js";
import { PixelSurface as ArenaSurface, scaleRgb } from "./pixel-surface.js";

const clamp = THREE.MathUtils.clamp;

/**
 * 256x256 PS1 NearestFilter fighting floor texture:
 * Central dark crimson parliamentary carpet bordered by inlaid Carrara marble tiles & brass trim.
 */
export function createFightFloorTexture() {
  const size = 256;
  const surf = new ArenaSurface(size, size);
  const crimson = [104, 24, 40];
  const crimsonDeep = [72, 16, 28];
  const crimsonHi = [132, 34, 52];
  const marble = [222, 217, 206];
  const marbleVein = [154, 152, 156];
  const marbleGrout = [110, 102, 96];
  const brass = [212, 174, 88];
  const brassDark = [148, 112, 46];

  const half = size * 0.5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const r = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const bayer = ((x & 1) * 2 + (y & 1)) * 0.25 - 0.375;

      if (r < 0.62) {
        // Dark crimson parliamentary carpet with subtle diamond weave & center medallion ring
        const diamond = ((Math.abs(x - y) % 8 === 0) || ((x + y) % 8 === 0)) ? 1 : 0;
        let col = diamond ? crimsonHi : ((x + y) % 2 ? crimson : crimsonDeep);
        if (r > 0.57 && r < 0.60) col = brass;
        else if (r > 0.16 && r < 0.185) col = brassDark;
        else if (r < 0.08) col = crimsonDeep;
        surf.setPixel(x, y, scaleRgb(col, 1 + bayer * 0.06), 1);
      } else if (r < 0.93) {
        // Inlaid Carrara marble tiles with radial & concentric grout + veining
        const radialTile = Math.abs(Math.sin(angle * 12));
        const ringBand = Math.abs(((r - 0.62) / 0.31) * 3 % 1 - 0.5);
        const isGrout = radialTile < 0.055 || ringBand > 0.465;
        if (isGrout) {
          surf.setPixel(x, y, marbleGrout, 1);
        } else {
          const veinWave = Math.sin(x * 0.11 + Math.sin(y * 0.08) * 3.2) + Math.cos(y * 0.09 - x * 0.05);
          const tileShade = ((Math.floor(angle * 6 / Math.PI) + Math.floor(r * 9)) % 2 === 0) ? 1.0 : 0.93;
          const col = veinWave > 1.35 ? marbleVein : scaleRgb(marble, tileShade + bayer * 0.04);
          surf.setPixel(x, y, col, 1);
        }
      } else {
        // Outer brass trim band
        const bevel = r > 0.965 ? brassDark : brass;
        surf.setPixel(x, y, scaleRgb(bevel, 1 + bayer * 0.05), 1);
      }
    }
  }
  return surf.toCanvasTexture([1, 1]);
}

export function createWalnutWoodTexture() {
  const surf = new ArenaSurface(128, 128);
  const wood = [92, 52, 34];
  const grain = [62, 33, 20];
  const hi = [122, 72, 46];
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const wave = Math.sin(x * 0.25 + Math.sin(y * 0.08) * 2.2);
      let col = wave > 0.45 ? hi : wave < -0.35 ? grain : wood;
      if (x % 32 === 0 || y % 64 === 0) col = grain;
      surf.setPixel(x, y, col, 1);
    }
  }
  return surf.toCanvasTexture([2, 1]);
}

export function createVelvetTexture() {
  const surf = new ArenaSurface(128, 128);
  const base = [118, 30, 48];
  const dark = [78, 18, 32];
  const hi = [150, 44, 66];
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const seam = x % 32 === 0;
      const tuft = (x % 16 === 8) && (y % 16 === 8);
      let col = (x + y) % 2 === 0 ? base : dark;
      if (y < 24) col = hi;
      if (seam || tuft) col = dark;
      surf.setPixel(x, y, col, 1);
    }
  }
  return surf.toCanvasTexture([3, 1]);
}

export function createMarbleTexture() {
  const surf = new ArenaSurface(128, 128);
  const base = [214, 205, 192];
  const vein = [152, 146, 142];
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const v = Math.sin(x * 0.12 + Math.sin(y * 0.09) * 2.5);
      surf.setPixel(x, y, v > 0.72 ? vein : scaleRgb(base, (x + y) % 2 ? 1.0 : 0.96), 1);
    }
  }
  return surf.toCanvasTexture([1, 2]);
}

/**
 * 256x256 Art Nouveau Velario stained-glass skylight texture.
 */
export function createVelarioTexture() {
  const size = 256;
  const surf = new ArenaSurface(size, size);
  const amber = [245, 190, 82];
  const gold = [255, 226, 138];
  const ivory = [248, 234, 198];
  const rose = [216, 124, 114];
  const teal = [92, 146, 152];
  const iron = [54, 38, 34];

  const half = size * 0.5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const petal = Math.abs(Math.sin(a * 6));
      const rib = petal < 0.06 || Math.abs(r - 0.24) < 0.018 || Math.abs(r - 0.56) < 0.020 || Math.abs(r - 0.86) < 0.022;

      if (rib) {
        surf.setPixel(x, y, iron, 1);
      } else if (r < 0.24) {
        surf.setPixel(x, y, r < 0.11 ? gold : amber, 1);
      } else if (r < 0.56) {
        const idx = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12);
        surf.setPixel(x, y, idx % 2 === 0 ? ivory : amber, 1);
      } else if (r < 0.86) {
        const idx = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 24);
        surf.setPixel(x, y, idx % 3 === 0 ? rose : idx % 3 === 1 ? amber : teal, 1);
      } else {
        surf.setPixel(x, y, amber, 1);
      }
    }
  }
  return surf.toCanvasTexture([1, 1]);
}

function makeMat(color, roughness = 0.75, metalness = 0.05, map = null, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color: map ? "#ffffff" : color,
    map,
    roughness,
    metalness,
    flatShading: false,
    ...extra
  });
}

function addBox(parent, size, pos, mat, rot = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...pos);
  if (rot) mesh.rotation.set(...rot);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/**
 * Sweep a 2D `[radius, y]` cross-section around a hemicycle arc centered at `(0, 0, centerZ)`.
 * Angle `0` points toward `-Z` (`sin(a)*r`, `-cos(a)*r + centerZ`).
 */
function createArcExtrusion(profile, startAngle, endAngle, arcSegments, centerZ) {
  const pLen = profile.length;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let s = 0; s <= arcSegments; s += 1) {
    const t = s / arcSegments;
    const angle = startAngle + (endAngle - startAngle) * t;
    const sa = Math.sin(angle);
    const ca = Math.cos(angle);
    for (let i = 0; i < pLen; i += 1) {
      const [r, y] = profile[i];
      positions.push(sa * r, y, -ca * r + centerZ);
      uvs.push(t * 2, i / pLen);
    }
  }

  for (let s = 0; s < arcSegments; s += 1) {
    const row0 = s * pLen;
    const row1 = (s + 1) * pLen;
    for (let i = 0; i < pLen; i += 1) {
      const next = (i + 1) % pLen;
      const a = row0 + i;
      const b = row0 + next;
      const c = row1 + next;
      const d = row1 + i;
      indices.push(a, d, b);
      indices.push(b, d, c);
    }
  }

  // End caps at startAngle and endAngle
  const addCap = (ringStart, reverse) => {
    let cr = 0, cy = 0;
    for (const [r, y] of profile) {
      cr += r; cy += y;
    }
    cr /= pLen;
    cy /= pLen;
    const angle = reverse ? endAngle : startAngle;
    const centerIdx = positions.length / 3;
    positions.push(Math.sin(angle) * cr, cy, -Math.cos(angle) * cr + centerZ);
    uvs.push(0.5, 0.5);
    for (let i = 0; i < pLen; i += 1) {
      const next = (i + 1) % pLen;
      if (reverse) indices.push(centerIdx, ringStart + next, ringStart + i);
      else indices.push(centerIdx, ringStart + i, ringStart + next);
    }
  };
  addCap(0, false);
  addCap(arcSegments * pLen, true);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function makeFlag(parent, x, y, z, colors, brassMat) {
  addBox(parent, [0.04, 1.0, 0.04], [x, y + 0.45, z], brassMat);
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 6), brassMat);
  finial.position.set(x, y + 1.0, z);
  parent.add(finial);
  colors.forEach((color, index) => {
    addBox(parent, [0.34, 0.27, 0.03], [x + 0.18, y + 0.78 - index * 0.27, z], makeMat(color, 0.8));
  });
}

function createWoodenChair(woodMat, velvetMat) {
  const chair = new THREE.Group();
  addBox(chair, [0.46, 0.07, 0.44], [0, 0.46, 0], velvetMat);
  addBox(chair, [0.48, 0.10, 0.46], [0, 0.41, 0], woodMat);
  addBox(chair, [0.44, 0.58, 0.07], [0, 0.77, -0.20], velvetMat);
  addBox(chair, [0.50, 0.64, 0.05], [0, 0.79, -0.23], woodMat);
  for (const sx of [-0.21, 0.21]) {
    addBox(chair, [0.05, 0.44, 0.05], [sx, 0.22, 0.18], woodMat);
    addBox(chair, [0.05, 0.44, 0.05], [sx, 0.22, -0.18], woodMat);
    addBox(chair, [0.05, 0.18, 0.36], [sx, 0.58, -0.02], woodMat);
  }
  return chair;
}

function createGooseneckMic(brassMat) {
  const mic = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.025, 8), brassMat);
  base.position.y = 0.012;
  mic.add(base);

  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.02, 0),
    new THREE.Vector3(0, 0.16, 0.02),
    new THREE.Vector3(0, 0.26, 0.10),
    new THREE.Vector3(0, 0.24, 0.17)
  ]);
  const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.008, 6, false), brassMat);
  mic.add(stem);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.020, 8, 6), makeMat("#222028", 0.45, 0.2));
  head.position.set(0, 0.235, 0.185);
  mic.add(head);
  return mic;
}

function createFlutedPilaster(marbleMat, brassMat) {
  const group = new THREE.Group();
  addBox(group, [0.64, 0.32, 0.48], [0, 0.16, 0], marbleMat);

  // Fluted shaft built by indenting alternating radial vertices
  const shaftGeo = new THREE.CylinderGeometry(0.21, 0.24, 4.4, 16, 2);
  const pos = shaftGeo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const angle = Math.atan2(x, z);
    const flute = Math.sin(angle * 8) * 0.016;
    const scale = (r + flute) / r;
    pos.setX(i, x * scale);
    pos.setZ(i, z * scale);
  }
  shaftGeo.computeVertexNormals();
  const shaft = new THREE.Mesh(shaftGeo, marbleMat);
  shaft.position.y = 2.52;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  group.add(shaft);

  addBox(group, [0.66, 0.22, 0.52], [0, 4.82, 0], marbleMat);
  addBox(group, [0.58, 0.08, 0.46], [0, 4.68, 0], brassMat);
  return group;
}

function createBallotBoxProp(woodMat, brassMat, paperMat) {
  const group = new THREE.Group();
  // Wooden urn box resting with bottom at local y = 0
  addBox(group, [0.46, 0.54, 0.40], [0, 0.27, 0], woodMat);
  addBox(group, [0.52, 0.06, 0.46], [0, 0.57, 0], woodMat);
  addBox(group, [0.22, 0.025, 0.05], [0, 0.605, 0], brassMat);
  // Subtle ballot slot & paper peeking out
  addBox(group, [0.16, 0.015, 0.018], [0, 0.62, 0], makeMat("#161218", 0.9));
  addBox(group, [0.12, 0.09, 0.01], [0.02, 0.65, 0], paperMat, [0.15, 0.1, -0.08]);
  // Corner brass brackets
  for (const sx of [-0.22, 0.22]) {
    addBox(group, [0.04, 0.52, 0.41], [sx, 0.27, 0], brassMat);
  }
  return group;
}

function createBrassStanchionProp(brassMat, velvetMat) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 0.05, 12), brassMat);
  base.position.y = 0.025;
  base.castShadow = true;
  group.add(base);

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.84, 10), brassMat);
  post.position.y = 0.47;
  post.castShadow = true;
  group.add(post);

  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), brassMat);
  finial.position.y = 0.91;
  finial.castShadow = true;
  group.add(finial);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.014, 6, 12), velvetMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.80;
  group.add(collar);
  return group;
}

/**
 * Construct the 1998 Tekken 3 Montecitorio Chamber of Deputies 3D arena:
 * - Octagonal marble/crimson carpet fighting floor with subtle reflective sheen
 * - President's podium, Banco del Governo, leather blotters, brass rails & gooseneck mics
 * - 4 ascending tiers of curved red velvet parliamentary benches & fluted marble pilasters
 * - Overhead Art Nouveau Velario stained-glass skylight with light shafts
 * - Destructible/reactive ballot boxes & brass stanchions at the ring edges
 */
export function createArena(scene) {
  const arenaGroup = new THREE.Group();
  arenaGroup.name = "montecitorio-arena";
  scene.add(arenaGroup);

  const textures = [
    createFightFloorTexture(),
    createWalnutWoodTexture(),
    createVelvetTexture(),
    createMarbleTexture(),
    createVelarioTexture()
  ];
  const [floorTex, woodTex, velvetTex, marbleTex, velarioTex] = textures;

  const woodMat = makeMat("#5a3422", 0.65, 0.06, woodTex);
  const velvetMat = makeMat("#741f32", 0.86, 0.02, velvetTex);
  const marbleMat = makeMat("#d8cfc2", 0.36, 0.05, marbleTex);
  const brassMat = makeMat("#d8b25c", 0.30, 0.62);
  const leatherMat = makeMat("#1c5838", 0.58, 0.04);
  const paperMat = makeMat("#f6efdc", 0.9, 0);

  // 1. Subfloor & Polished Marble / Crimson Carpet Fight Floor (top at y = 0.11)
  const outerFloor = new THREE.Mesh(
    new THREE.CylinderGeometry(13.2, 13.4, 0.14, 32),
    marbleMat
  );
  outerFloor.position.y = -0.06;
  outerFloor.receiveShadow = true;
  arenaGroup.add(outerFloor);

  // Octagonal / 16-sided central fighting floor with procedural crimson carpet + Carrara marble border
  const fightFloorGeo = new THREE.CylinderGeometry(7.75, 7.95, 0.20, 16);
  const fightFloorMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: floorTex,
    roughness: 0.24,
    metalness: 0.08
  });
  const fightFloor = new THREE.Mesh(fightFloorGeo, fightFloorMat);
  fightFloor.position.set(0, 0.01, -0.15);
  fightFloor.receiveShadow = true;
  fightFloor.castShadow = true;
  arenaGroup.add(fightFloor);

  // Subtle semi-transparent reflective sheen layer so boots & spotlights gleam on the stone
  const reflectiveMat = new THREE.MeshStandardMaterial({
    color: "#fff8ec",
    roughness: 0.08,
    metalness: 0.45,
    transparent: true,
    opacity: 0.16,
    depthWrite: false
  });
  const reflectiveSheen = new THREE.Mesh(
    new THREE.CircleGeometry(7.68, 16),
    reflectiveMat
  );
  reflectiveSheen.rotation.x = -Math.PI / 2;
  reflectiveSheen.position.set(0, 0.112, -0.15);
  reflectiveSheen.receiveShadow = true;
  arenaGroup.add(reflectiveSheen);

  // Brass trim ring around the fighting pit
  const brassRing = new THREE.Mesh(
    new THREE.TorusGeometry(7.68, 0.055, 8, 32),
    brassMat
  );
  brassRing.rotation.x = Math.PI / 2;
  brassRing.position.set(0, 0.115, -0.15);
  arenaGroup.add(brassRing);

  // 2. President's Podium & Banco del Governo (behind combat line at -Z)
  const banco = new THREE.Group();
  banco.name = "banco-del-governo";
  banco.position.set(0, 0.11, -5.25);
  addBox(banco, [5.2, 0.88, 0.86], [0, 0.44, 0], woodMat);
  addBox(banco, [5.45, 0.10, 1.00], [0, 0.92, 0], woodMat);
  // Green leather blotters & brass trim along Banco del Governo
  for (const bx of [-1.75, 0, 1.75]) {
    addBox(banco, [1.22, 0.025, 0.56], [bx, 0.985, 0.05], leatherMat);
  }
  addBox(banco, [5.2, 0.05, 0.06], [0, 0.99, 0.45], brassMat);
  for (const px of [-2.4, -1.2, 0, 1.2, 2.4]) {
    addBox(banco, [0.04, 0.16, 0.04], [px, 1.05, 0.45], brassMat);
  }
  addBox(banco, [5.2, 0.035, 0.035], [0, 1.13, 0.45], brassMat);

  // Twin gooseneck microphones on Banco del Governo & chairs behind it
  for (const mx of [-0.18, 0.18, -1.75, 1.75]) {
    const mic = createGooseneckMic(brassMat);
    mic.position.set(mx, 0.98, 0.16);
    banco.add(mic);
  }
  for (const cx of [-1.75, 0, 1.75]) {
    const chair = createWoodenChair(woodMat, velvetMat);
    chair.position.set(cx, 0, -0.68);
    banco.add(chair);
  }
  arenaGroup.add(banco);

  // Elevated President's Rostrum (Scranno) behind Banco del Governo
  const podium = new THREE.Group();
  podium.name = "presidents-podium";
  podium.position.set(0, 0.11, -6.95);
  addBox(podium, [3.2, 0.34, 1.5], [0, 0.17, 0], marbleMat); // stepped marble dais
  addBox(podium, [2.75, 1.38, 0.92], [0, 1.03, 0], woodMat);
  addBox(podium, [3.0, 0.12, 1.10], [0, 1.76, 0], woodMat);
  addBox(podium, [1.8, 0.72, 0.06], [0, 1.15, 0.47], woodMat);
  addBox(podium, [2.75, 0.07, 0.07], [0, 1.84, 0.48], brassMat);
  addBox(podium, [1.45, 0.03, 0.56], [0, 1.83, 0.04], leatherMat);

  // Brass Republic seal & twin gooseneck microphones on President's lectern
  const seal = new THREE.Mesh(new THREE.CircleGeometry(0.24, 16), brassMat);
  seal.position.set(0, 1.15, 0.51);
  podium.add(seal);

  for (const mx of [-0.22, 0.22]) {
    const mic = createGooseneckMic(brassMat);
    mic.position.set(mx, 1.83, 0.22);
    podium.add(mic);
  }

  // Tall high-back President's chair behind rostrum
  const presChair = createWoodenChair(woodMat, velvetMat);
  presChair.position.set(0, 0.34, -0.66);
  presChair.scale.set(1.2, 1.35, 1.15);
  podium.add(presChair);
  arenaGroup.add(podium);

  makeFlag(arenaGroup, -2.15, 2.25, -7.75, ["#17965d", "#f7f1e4", "#d94c4c"], brassMat);
  makeFlag(arenaGroup, 2.15, 2.25, -7.75, ["#2757ac", "#efc74b", "#2757ac"], brassMat);

  // 3. 4 Ascending Tiers of Curved Red Velvet Benches (left & right hemicycle arcs)
  const centerZ = 0.2;
  const arcSpan = [
    [-1.42, -0.34], // Left hemicycle wing
    [0.34, 1.42]    // Right hemicycle wing
  ];

  for (let tier = 0; tier < 4; tier += 1) {
    const rInner = 8.15 + tier * 1.02;
    const yBase = 0.12 + tier * 0.34;

    for (const [aStart, aEnd] of arcSpan) {
      // Marble step riser
      const stepGeo = createArcExtrusion(
        [
          [rInner - 0.12, 0],
          [rInner - 0.12, yBase],
          [rInner + 0.96, yBase],
          [rInner + 0.96, 0]
        ],
        aStart,
        aEnd,
        14,
        centerZ
      );
      const stepMesh = new THREE.Mesh(stepGeo, marbleMat);
      stepMesh.receiveShadow = true;
      stepMesh.castShadow = true;
      arenaGroup.add(stepMesh);

      // Curved walnut desk ledge in front of bench
      const deskGeo = createArcExtrusion(
        [
          [rInner, yBase],
          [rInner, yBase + 0.44],
          [rInner + 0.24, yBase + 0.44],
          [rInner + 0.24, yBase]
        ],
        aStart,
        aEnd,
        14,
        centerZ
      );
      const deskMesh = new THREE.Mesh(deskGeo, woodMat);
      deskMesh.castShadow = true;
      deskMesh.receiveShadow = true;
      arenaGroup.add(deskMesh);

      // Curved red velvet seat cushion & backrest
      const seatGeo = createArcExtrusion(
        [
          [rInner + 0.28, yBase + 0.16],
          [rInner + 0.28, yBase + 0.34],
          [rInner + 0.68, yBase + 0.34],
          [rInner + 0.68, yBase + 0.16]
        ],
        aStart,
        aEnd,
        14,
        centerZ
      );
      const seatMesh = new THREE.Mesh(seatGeo, velvetMat);
      seatMesh.castShadow = true;
      seatMesh.receiveShadow = true;
      arenaGroup.add(seatMesh);

      const backGeo = createArcExtrusion(
        [
          [rInner + 0.64, yBase + 0.28],
          [rInner + 0.64, yBase + 0.72],
          [rInner + 0.86, yBase + 0.72],
          [rInner + 0.86, yBase + 0.28]
        ],
        aStart,
        aEnd,
        14,
        centerZ
      );
      const backMesh = new THREE.Mesh(backGeo, velvetMat);
      backMesh.castShadow = true;
      backMesh.receiveShadow = true;
      arenaGroup.add(backMesh);
    }
  }

  // Curved hemicycle chamber wall, warm wood wainscoting & fluted marble pilasters
  const wallGeo = createArcExtrusion(
    [
      [12.35, 0],
      [12.35, 6.4],
      [12.75, 6.4],
      [12.75, 0]
    ],
    -1.52,
    1.52,
    24,
    centerZ
  );
  arenaGroup.add(new THREE.Mesh(wallGeo, makeMat("#3f2c3f", 0.85)));

  const wainscotGeo = createArcExtrusion(
    [
      [12.18, 0],
      [12.18, 2.2],
      [12.36, 2.2],
      [12.36, 0]
    ],
    -1.50,
    1.50,
    24,
    centerZ
  );
  arenaGroup.add(new THREE.Mesh(wainscotGeo, woodMat));

  const corniceGeo = createArcExtrusion(
    [
      [11.95, 6.15],
      [11.95, 6.55],
      [12.45, 6.55],
      [12.45, 6.15]
    ],
    -1.52,
    1.52,
    24,
    centerZ
  );
  arenaGroup.add(new THREE.Mesh(corniceGeo, woodMat));

  for (let i = 0; i < 11; i += 1) {
    const angle = -1.35 + (2.70 * i) / 10;
    const pilaster = createFlutedPilaster(marbleMat, brassMat);
    pilaster.position.set(Math.sin(angle) * 12.1, 1.35, -Math.cos(angle) * 12.1 + centerZ);
    pilaster.rotation.y = -angle;
    arenaGroup.add(pilaster);
  }

  // 4. Art Nouveau Stained-Glass Skylight (Velario) & Dramatic Light Shafts
  const velarioGroup = new THREE.Group();
  velarioGroup.name = "velario-skylight";
  velarioGroup.position.set(0, 6.45, -0.8);

  const domeGeo = new THREE.SphereGeometry(12.6, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const domeMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: velarioTex,
    emissive: "#ffb84d",
    emissiveMap: velarioTex,
    emissiveIntensity: 0.72,
    roughness: 0.35,
    side: THREE.BackSide
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.scale.set(1, 0.34, 1);
  velarioGroup.add(dome);

  // 3D warm gold/bronze Art Nouveau ribs & oculus rings
  const ribMat = makeMat("#b98e3d", 0.38, 0.55);
  for (const ringRadius of [2.9, 6.8, 10.6]) {
    const h = Math.sqrt(Math.max(0, 12.6 * 12.6 - ringRadius * ringRadius)) * 0.34;
    const torus = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, 0.08, 6, 32), ribMat);
    torus.rotation.x = Math.PI / 2;
    torus.position.y = h - 0.05;
    velarioGroup.add(torus);
  }
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const archCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * 2.9, 4.12, Math.sin(a) * 2.9),
      new THREE.Vector3(Math.cos(a) * 7.0, 3.55, Math.sin(a) * 7.0),
      new THREE.Vector3(Math.cos(a) * 11.4, 1.80, Math.sin(a) * 11.4)
    ]);
    velarioGroup.add(new THREE.Mesh(new THREE.TubeGeometry(archCurve, 8, 0.065, 5, false), ribMat));
  }

  // Dramatic soft light shafts descending from Velario toward the fight floor
  const shaftMat = new THREE.MeshBasicMaterial({
    color: "#ffd98a",
    transparent: true,
    opacity: 0.045,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  for (const [sx, sz, tiltX, tiltZ] of [[0, -0.4, 0.06, 0], [-2.2, 0.2, 0.04, 0.14], [2.2, 0.2, 0.04, -0.14]]) {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 3.4, 8.6, 16, 1, true), shaftMat);
    shaft.position.set(sx, -1.6, sz);
    shaft.rotation.set(tiltX, 0, tiltZ);
    velarioGroup.add(shaft);
  }

  const velarioLight = new THREE.PointLight("#ffd27d", 38, 22, 1.5);
  velarioLight.position.set(0, 2.2, 0);
  velarioGroup.add(velarioLight);
  arenaGroup.add(velarioGroup);

  // 5. Destructible / Reactive Stage Props (wooden ballot boxes & brass stanchions at ring edges)
  const propConfigs = [
    { kind: "urna", x: -5.85, y: 0.11, z: -1.10 },
    { kind: "urna", x: 5.85, y: 0.11, z: -1.10 },
    { kind: "stanchion", x: -5.95, y: 0.11, z: 1.35 },
    { kind: "stanchion", x: 5.95, y: 0.11, z: 1.35 }
  ];

  const props = propConfigs.map((cfg) => {
    const mesh = cfg.kind === "urna"
      ? createBallotBoxProp(woodMat, brassMat, paperMat)
      : createBrassStanchionProp(brassMat, velvetMat);
    mesh.position.set(cfg.x, cfg.y, cfg.z);
    mesh.name = `stage-${cfg.kind}-${cfg.x < 0 ? "left" : "right"}`;
    arenaGroup.add(mesh);
    return {
      ...cfg,
      mesh,
      state: "intact", // "intact" | "rattling" | "tipped"
      rattleTime: 0,
      tiltAngle: 0,
      tiltVel: 0,
      fallDir: Math.sign(cfg.x) || 1,
      vx: 0,
      vz: 0,
      hitCooldown: 0
    };
  });

  function resetProps() {
    for (const p of props) {
      p.state = "intact";
      p.rattleTime = 0;
      p.tiltAngle = 0;
      p.tiltVel = 0;
      p.vx = 0;
      p.vz = 0;
      p.hitCooldown = 0;
      p.mesh.position.set(p.x, p.y, p.z);
      p.mesh.rotation.set(0, 0, 0);
    }
  }

  function update(dt, combatants, onBallotBurst) {
    for (const p of props) {
      p.hitCooldown = Math.max(0, p.hitCooldown - dt);

      if (p.state !== "tipped" && combatants && p.hitCooldown <= 0) {
        for (const c of combatants) {
          if (!c) continue;
          const dist = Math.hypot(c.x - p.mesh.position.x, c.z - p.mesh.position.z);
          const impactSpeed = Math.hypot(c.vx || 0, c.vz || 0);
          const knocked = c.airborne || (c.stun || 0) > 0.12 || impactSpeed > 1.4;
          if (dist < 1.15 && knocked) {
            p.hitCooldown = 0.35;
            const pushDir = Math.sign(p.x - c.x) || Math.sign(p.x) || 1;
            p.fallDir = pushDir;
            const heavyKnock = c.airborne || impactSpeed > 2.1 || (c.stun || 0) > 0.2;
            if (heavyKnock || p.state === "rattling") {
              p.state = "tipped";
              p.tiltVel = 4.6;
              p.vx = pushDir * 1.15;
              p.vz = (p.z - c.z) * 0.45;
              if (onBallotBurst) {
                const count = p.kind === "urna" ? 8 : 3;
                for (let b = 0; b < count; b += 1) {
                  onBallotBurst(
                    p.mesh.position.x,
                    p.mesh.position.y + 0.55,
                    p.mesh.position.z,
                    pushDir
                  );
                }
              }
            } else {
              p.state = "rattling";
              p.rattleTime = 0.5;
              if (onBallotBurst && p.kind === "urna") {
                for (let b = 0; b < 3; b += 1) {
                  onBallotBurst(p.mesh.position.x, p.mesh.position.y + 0.6, p.mesh.position.z, pushDir);
                }
              }
            }
            break;
          }
        }
      }

      if (p.state === "rattling") {
        p.rattleTime -= dt;
        const wobble = Math.sin(p.rattleTime * 36) * 0.16 * clamp(p.rattleTime * 2, 0, 1);
        p.mesh.rotation.z = wobble;
        p.mesh.rotation.x = Math.cos(p.rattleTime * 28) * 0.08 * clamp(p.rattleTime * 2, 0, 1);
        if (p.rattleTime <= 0) {
          p.state = "intact";
          p.mesh.rotation.set(0, 0, 0);
        }
      } else if (p.state === "tipped") {
        const targetTilt = Math.PI / 2;
        if (p.tiltAngle < targetTilt) {
          p.tiltVel += 12 * dt;
          p.tiltAngle = Math.min(targetTilt, p.tiltAngle + p.tiltVel * dt);
        }
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.z += p.vz * dt;
        p.vx *= Math.exp(-4 * dt);
        p.vz *= Math.exp(-4 * dt);
        p.mesh.position.y = p.y + Math.sin(p.tiltAngle) * 0.12;
        p.mesh.rotation.z = -p.fallDir * p.tiltAngle;
        p.mesh.rotation.x = Math.sin(p.tiltAngle) * 0.22 * Math.sign(p.z || 1);
      }
    }
  }

  function setLightingMood(preset) {
    if (!preset) return;
    if (preset.velarioEmissive) domeMat.emissive.set(preset.velarioEmissive);
    if (typeof preset.velarioEmissiveIntensity === "number") {
      domeMat.emissiveIntensity = preset.velarioEmissiveIntensity;
    }
    if (preset.shaftColor) shaftMat.color.set(preset.shaftColor);
    if (typeof preset.shaftOpacity === "number") shaftMat.opacity = preset.shaftOpacity;
    if (preset.velarioLightColor) velarioLight.color.set(preset.velarioLightColor);
    if (typeof preset.velarioLightIntensity === "number") {
      velarioLight.intensity = preset.velarioLightIntensity;
    }
    if (typeof preset.sheenOpacity === "number") reflectiveMat.opacity = preset.sheenOpacity;
  }

  function dispose() {
    scene.remove(arenaGroup);
    const mats = new Set();
    arenaGroup.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.geometry.dispose();
      const mList = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mList) mats.add(m);
    });
    mats.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  }

  return { group: arenaGroup, props, update, resetProps, setLightingMood, dispose };
}
