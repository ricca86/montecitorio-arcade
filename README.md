# Montecitorio: Floor Fight!

A small, static 3D arcade fighter built with Three.js and ES modules. No build step is required.

## Run locally

From this directory, start a static server:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. The browser needs internet access to load Three.js from jsDelivr.

## Controls

- `A` / `D`: move
- Double-tap `W` / `S`: sidestep
- `U` / `I` / `J` / `K`: left punch, right punch, left kick, right kick
- `S` + `I`: launcher
- `L`: signature move
- Arrow keys and `Enter`: character select

## Publishing

Pushes to `main` deploy the site to GitHub Pages using the workflow in `.github/workflows/pages.yml`.
