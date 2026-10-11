# Marble Chaos

Design marble-race stages in the browser and run them as elimination tournaments.

- **Marble race**: country flags, colours, designed marbles or your own logos race through the stages; each stage
  knocks some out until one is left.
- **Letter slots** (the default): marbles pour into a strip of lettered slots; the letter that catches the fewest is out each round. Levels come up in random order.

## Develop

```sh
npm install --include=dev
npm run dev      # editor at http://localhost:5173
npm run build    # type-check and build to dist/
```

Pushing to `main` builds and publishes to GitHub Pages (`.github/workflows/pages.yml`).

Flags come from [flag-icons](https://github.com/lipis/flag-icons); physics is [Rapier](https://rapier.rs). The
textures, backdrops and marble designs under `public/` were generated with OpenAI's image model.
