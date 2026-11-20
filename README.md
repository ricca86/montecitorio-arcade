# Montecitorio: Floor Fight!

A small, static 3D arcade fighter built with Three.js and ES modules. No build step is required.
Fighters are assembled procedurally from low-poly meshes and 64×64 nearest-filtered
canvas textures; no external character models or texture assets are needed.
Their accessories use spring follow-through, while sidesteps leave brief visual
afterimages. Signature poses and jumps are visual only and do not change hit timing
or movement rules.

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

Attacks can be buffered for 300 ms. Combo strings: `U U I` (straight
knockdown), `U I K` (spinning roundhouse), `J K K` (heel drop), `U U S+I`
(launcher), and `I I L` (signature). Airborne opponents can be juggled with
up to four gravity-assisted follow-up hits; the hit counter clears on recovery.

## Elezioni 2027 Arcade Ladder

Fight seven unique rivals followed by a stronger Palazzo Chigi boss: Meloni,
or Schlein when playing as Meloni. Matches are best of three; each round win
awards 1,000 points plus ten points per remaining health point. A loss after two
rounds offers nine seconds to continue from the same stage with score and streak
reset. Press Enter to continue or Escape to return to character select. Winning
the final stage completes the tournament. A timer tie goes to the player.
The ladder reveals each challenger as you progress and advances automatically
after three seconds (or immediately with Enter or Space). The champion screen
shows elapsed real time from character selection through the final win,
including ladder screens and continues.

Sound effects start after your first interaction. Use the **Music** button to
toggle the optional synth-bass loop, which plays only during a match.

## Publishing

Pushes to `main` deploy the site to GitHub Pages using the workflow in `.github/workflows/pages.yml`.

## License

This project is licensed under the [GNU General Public License, version 3](LICENSE) (GPL-3.0-only).
Three.js is distributed under its own [MIT license](vendor/three/LICENSE).
