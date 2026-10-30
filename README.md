# Interactive UML Class Diagram Generator (React)

A web-based editor for **UML class diagrams** built with **React + Vite**. Design classes,
interfaces, abstract classes and enums visually, connect them with relationships, and the app
**generates the matching Java source code live**.

## Features

- Drag-and-drop canvas (pan, zoom, snap-to-grid, auto layout, fit to screen)
- Class, abstract class, interface and enum nodes with attributes and methods
  (visibility, static, abstract, types, default values, parameters)
- Relationships: inheritance, realization, association, aggregation, composition, dependency,
  with multiplicities, labels and role names (self-relationships supported)
- **Live Java generation** with syntax highlighting, one file per class
  - `extends` / `implements`, constructors (including `super(...)` calls), getters and setters
  - association / aggregation / composition become fields (`List<T>` when multiplicity > 1)
  - inherited abstract methods are stubbed with `@Override`, so the output compiles
  - optional package name, automatic imports (`List`, `ArrayList`, ...)
- Diagram checks (invalid names, duplicate classes, inheritance cycles, multiple class inheritance)
- Undo / redo, autosave to the browser, import / export diagram as JSON
- Export the diagram as PNG or SVG, and the code as a `.java` file or a `.zip`

## Getting started

Requires Node.js 18+.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the production build
```

## How to use

| Action | How |
| --- | --- |
| Add a class | **Add** buttons, or double-click the canvas |
| Edit a class | Click it, then use the **Properties** tab |
| Move a class | Drag it (hold **Alt** to disable snapping) |
| Pan / zoom | Drag the background / **Ctrl + wheel** (or the +/- buttons) |
| Draw a relationship | Pick a type under **Link**, click the source class, then the target class |
| Edit a relationship | Click the line (multiplicity, label, field name, reverse direction) |
| Delete | Select and press **Delete** |
| Undo / redo | **Ctrl+Z** / **Ctrl+Shift+Z** |
| Cancel a tool | **Esc** |
| Get the code | **Java code** tab, or **Download Java (.zip)** |

### Relationship direction

Relations point from `source` to `target`:

| Type | Generated Java |
| --- | --- |
| Inheritance / Realization | `source extends|implements target` |
| Association / Aggregation / Composition | field of type `target` inside `source` |
| Dependency | comment `// Depends on: target` |

## Project structure

```
src/
  App.jsx                 state, undo/redo, file actions
  components/
    Canvas.jsx            SVG canvas: pan, zoom, drag, relationship drawing
    ClassNode.jsx         UML class box
    EdgeShape.jsx         relationship line + UML end markers
    Toolbar.jsx           toolbar and File menu
    Inspector.jsx         property editors + diagram checks
    CodePanel.jsx         generated Java with syntax highlighting
  utils/
    model.js              data model, sample diagram
    javaGenerator.js      diagram -> Java, plus validation
    geometry.js           node sizes and edge routing
    layout.js             auto layout
    download.js           file / zip / PNG helpers
```

## Push to GitHub

1. Create an **empty** repository on GitHub (no README / .gitignore / license), e.g. `uml-class-diagram-generator`.
2. In this project folder:

```bash
git init
git add .
git commit -m "Initial commit: UML class diagram generator"
git branch -M main
git remote add origin https://github.com/<your-username>/uml-class-diagram-generator.git
git push -u origin main
```

If GitHub asks for a password, use a **Personal Access Token**
(GitHub > Settings > Developer settings > Personal access tokens) or sign in with the GitHub CLI (`gh auth login`).

### Optional: publish the app on GitHub Pages

A workflow is included (`.github/workflows/deploy.yml`). After pushing, open the repository's
**Settings > Pages** and set **Source** to **GitHub Actions**. Every push to `main` then deploys the
site to `https://<your-username>.github.io/uml-class-diagram-generator/`.

## License

MIT - use it freely for coursework and projects.
