import * as THREE from "./vendor/three/three.module.min.js";

const clamp = THREE.MathUtils.clamp;

export function hexToRgb(hex) {
  const c = new THREE.Color(hex);
  const toByte = (v) =>
    Math.round(clamp(v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055, 0, 1) * 255);
  return [toByte(c.r), toByte(c.g), toByte(c.b)];
}

export function scaleRgb(rgb, factor, dr = 0, dg = 0, db = 0) {
  return [
    clamp(Math.round(rgb[0] * factor + dr), 0, 255),
    clamp(Math.round(rgb[1] * factor + dg), 0, 255),
    clamp(Math.round(rgb[2] * factor + db), 0, 255)
  ];
}

export function mixRgb(a, b, t) {
  const k = clamp(t, 0, 1);
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k)
  ];
}

/**
 * Shared RGBA pixel rasterizer that outputs a THREE.CanvasTexture
 * configured with THREE.NearestFilter for crisp 1998 PS1 arcade texels.
 */
export class PixelSurface {
  constructor(width = 128, height = 128) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  fill(rgb) {
    for (let i = 0; i < this.width * this.height; i += 1) {
      const idx = i * 4;
      this.data[idx] = rgb[0];
      this.data[idx + 1] = rgb[1];
      this.data[idx + 2] = rgb[2];
      this.data[idx + 3] = 255;
    }
  }

  blendPixel(x, y, rgb, alpha = 1) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || px >= this.width || py < 0 || py >= this.height) return;
    const idx = (py * this.width + px) * 4;
    const a = clamp(alpha, 0, 1);
    const inv = 1 - a;
    this.data[idx] = Math.round(this.data[idx] * inv + rgb[0] * a);
    this.data[idx + 1] = Math.round(this.data[idx + 1] * inv + rgb[1] * a);
    this.data[idx + 2] = Math.round(this.data[idx + 2] * inv + rgb[2] * a);
    this.data[idx + 3] = 255;
  }

  setPixel(x, y, rgb, alpha = 1) {
    this.blendPixel(x, y, rgb, alpha);
  }

  fillRect(x0, y0, w, h, rgb, alpha = 1) {
    const startX = Math.max(0, Math.floor(x0));
    const endX = Math.min(this.width - 1, Math.floor(x0 + w - 1));
    const startY = Math.max(0, Math.floor(y0));
    const endY = Math.min(this.height - 1, Math.floor(y0 + h - 1));
    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        this.blendPixel(x, y, rgb, alpha);
      }
    }
  }

  blendEllipse(cx, cy, rx, ry, rgb, alpha = 1, power = 1.6) {
    const x0 = Math.max(0, Math.floor(cx - rx));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = (x - cx) / Math.max(rx, 0.5);
        const dy = (y - cy) / Math.max(ry, 0.5);
        const d = Math.hypot(dx, dy);
        if (d <= 1) {
          const w = Math.pow(1 - d, power) * alpha;
          this.blendPixel(x, y, rgb, w);
        }
      }
    }
  }

  drawSegment(x0, y0, x1, y1, radius, rgb, alpha = 1) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (radius <= 0.6) {
        this.blendPixel(x, y, rgb, alpha);
      } else {
        this.blendEllipse(x, y, radius, radius, rgb, alpha, 0.6);
      }
    }
  }

  toCanvasTexture(repeat = null) {
    let canvas;
    if (typeof document !== "undefined" && typeof document.createElement === "function") {
      canvas = document.createElement("canvas");
      canvas.width = this.width;
      canvas.height = this.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const img = ctx.createImageData(this.width, this.height);
        img.data.set(this.data);
        ctx.putImageData(img, 0, 0);
      }
    } else {
      canvas = { width: this.width, height: this.height, data: this.data };
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    if (Array.isArray(repeat) && repeat.length >= 2) {
      texture.repeat.set(repeat[0], repeat[1]);
    }
    texture.userData.pixels = this.data;
    texture.needsUpdate = true;
    return texture;
  }
}
