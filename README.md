# Montecitorio: Floor Fight!

A small, static 3D arcade fighter built with Three.js and ES modules. No build step is required.

## Run locally

From this directory, start a static server:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Three.js is bundled with the project, so no external CDN is needed.

## Controls

- `A` / `D`: move
- Double-tap `W` / `S`: sidestep
- `U` / `I` / `J` / `K`: left punch, right punch, left kick, right kick
- `S` + `I`: launcher
- `L`: signature move
- Arrow keys and `Enter`: character select

Sound effects start after your first interaction. Use the **Music** button to
toggle the optional synth-bass loop, which plays only during a match.

## Publishing

Pushes to `main` deploy the site to GitHub Pages using the workflow in `.github/workflows/pages.yml`.

## License

This project is licensed under the [GNU General Public License, version 3](LICENSE) (GPL-3.0-only).
Three.js is distributed under its own [MIT license](vendor/three/LICENSE).
