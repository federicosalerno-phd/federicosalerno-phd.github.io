# federicosalerno-phd.github.io

Personal website and academic portfolio of **Federico Salerno** — live at
**<https://federicosalerno-phd.github.io>**.

## What's inside

| Page | Content |
|---|---|
| `index.html` | Home: short bio and the site's sections |
| `about.html` | About me |
| `projects.html` | My projects: a portfolio of designed and 3D-printed objects, each with photos and an interactive 3D model |
| `biomedical.html` | Biomedical tools and research: index of the published works |
| `biomedical-artifact.html` | AR tooltip tracking measuring artifact — *Computers in Industry*, 2026 |
| `biomedical-platform.html` | Benchmarking platform for optical tracking systems — *SN Computer Science*, 2026 |
| `cv.html` | Academic CV (also as [PDF](federico_salerno_cv.pdf)) |
| `dogs.html` | Ludovico |

## How it is built

- **Static, no build step, no framework.** Every page is self-contained: hand-written
  HTML with its CSS and JavaScript inline. What is in the repository is exactly what is
  served.
- **One external library**: [`<model-viewer>`](https://modelviewer.dev) from CDN, for the
  interactive 3D models (glTF assets under `assets/`). Fonts from Google Fonts
  (IBM Plex Sans).
- **Design**: a single greyscale palette defined as CSS variables in `:root` of each
  page; full-width rows, no outlines ("Ledger" style).
- **Hosting**: GitHub Pages, published from the `main` branch. Every push to `main` goes
  live within minutes — `main` is the production site.

## Repository layout

```
├── index.html, about.html, projects.html, cv.html, dogs.html
├── biomedical.html, biomedical-artifact.html, biomedical-platform.html
├── federico_salerno_cv.pdf
└── assets/
    ├── avatar.jpg              profile photo
    ├── creations/<slug>/       per-project 3D model, photos, download
    ├── biomedical/<slug>/      per-work 3D model, photos, download
    ├── papers/                 publication PDFs and covers
    └── dogs/                   photos
```

## Local development

Serve the repository root with any static server, e.g.:

```sh
python -m http.server 5500
```

then open <http://127.0.0.1:5500/>. Asset paths are absolute from the root
(`/assets/...`), so they work identically in local serving and on GitHub Pages.

## License

© Federico Salerno. Code may be read for reference; content, images, publications and 3D
models are personal and may not be reused without permission.
