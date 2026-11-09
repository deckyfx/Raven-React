# Plan: raven-tsx

raven-tsx is one library that makes Raven's native widgets from TSX. It is split into a core, which knows only Raven, and an adapter for each framework. React is the first adapter. Solid is the second, if a short test of its compiler on Bun works out.

Nothing has been published to npm yet.

## Where things stand

Before the split, the package was about 3,300 lines, not counting the generated binding in `vendor/` or the tools. About three quarters of it does not use React:

| Without React (about 2,500 lines) | With React (about 800 lines) |
|---|---|
| `widget-instance.ts`: the tree of native widgets, `HostNode` | `host-config.ts`: the React reconciler |
| `window-instance.ts`: windows | `root.ts`: `RavenRoot`, `runApp`, `createWindow`, `createPortal` |
| `events.ts`, `frame.ts`: handlers, actions, frames | `hooks.ts`: `useAction`, `useShortcut`, `useFrame` |
| `props.ts`: props to attributes and handlers (one `ReactNode` in a type) | `tags.ts`: `registerTag` renders a React component in a tag of Raven |
| `theme.ts`, `web.ts`, `native.ts`, `library-check.ts`, `errors.ts`, `raven.ts` | `components.generated.ts`: React props (`key`, `ref`, `children`) and `createElement` |

PR #7 helps here: a node now lives only in JavaScript until it is placed, and `materialize()` makes it in Raven then. Solid needs the same thing, because it gives a node its props one by one after creating it, while Raven needs `Markup` at creation.

## Package layout

**Recommended: one package, with a subpath for each framework.**

```ts
import { Button, Label, runApp, VBox } from "@decky.fx/raven-tsx/react";
import { Button, Label, runApp, VBox } from "@decky.fx/raven-tsx/solid";
import { defineTheme, loadTheme, raven } from "@decky.fx/raven-tsx";   // the core, for code that is not a component
```

- `react` (with `react-reconciler`) and `solid-js` are optional peer dependencies. An app installs only the one it uses.
- Each adapter also exports everything in the core, so an app needs a single import.
- There is one version and one set of native packages, `@decky.fx/raven-tsx-<platform>`.

The alternative is separate packages (`raven-tsx-core`, `raven-tsx-react`, `raven-tsx-solid`). That means three versions to keep in step for no gain while one person maintains them all. It is easy to change to later, because the folders below already separate the parts.

## Phase 1: rename

Done. The packages, the folders, the messages and the GitHub repository (`deckyfx/raven-tsx`) all carry the new name.

## Phase 2: separate the core from React

React users see one change: they import from `@decky.fx/raven-tsx/react`. Nothing else changes.

**Folders:**

```
packages/raven-tsx/src/
  core/     widget-instance, window-instance, events, frame, props, theme, web, native,
            library-check, errors, raven, tags (the Raven half), props.generated
  react/    host-config, root, hooks, tags (the React half), components.generated, index
  solid/    (phase 4)
  tools/  vendor/
  test/core/  test/react/
```

**What has to change, beyond moving files:**
- **`props.ts`.** `PropValue` names `ReactNode` for children. The core reads children only for their text (`childrenText`), so it can take them without the React type, and each adapter gives its own child type.
- **The component generator.** It now emits one file. Instead it emits:
  - `core/props.generated.ts`, with the props of each tag (`ButtonProps`, `VBoxProps`…) and no framework types;
  - `react/components.generated.ts`, with the React wrappers that add `key`, `ref` and `children`.
  - Phase 4 adds a Solid file next to it.
- **End of commit.** `host-config.ts` drains `placedInThisCommit` in `resetAfterCommit`. The core instead exports one function that an adapter calls at the end of each batch of changes, `finishPlacing()`.
- **`registerTag`.** Raven asks for a tag's widgets, and the code then renders a React component into them. The Raven half (callbacks, slots, adopted widgets) moves to the core, behind a small interface that each adapter implements: `mount(component, props, container)`, returning an object with `update` and `unmount`.
- **Hooks.** The core exports plain subscriptions that each return a function to stop them: `onAction(name, handler)`, `onShortcut(window, keys, handler)`, `onFrame(handler)`. The React hooks wrap them. `updatePriority` in `events.ts` gives React's event priority, so it moves to `react/`.
- **A test that keeps the core clean.** It fails if any file in `core/` imports `react`, `react-reconciler` or `solid-js`, in the style of `coverage.test.ts`.

The tests split with the code. The tests of the core run once; the renderer tests stay in `test/react/`.

## Phase 3: Node.js backend (separate, in parallel)

This is the Node-API binding recommended on 2026-11-08: `bindings/node` upstream, and the backend chosen by `exports` conditions. It is a layer *below* the core, while adapters are a layer above it, so it is independent of phases 2 and 4.

Its first step lives in the core folder that phase 2 creates: move the 36 direct uses of `bun:ffi` (`events.ts`, `frame.ts`, `tags.ts`), `web.ts` (`dlopen`) and `native.ts` (`Bun.file`, `Bun.hash`) behind a backend interface. So do phase 2 first, or both PRs will touch the same lines.

## Phase 4: Solid adapter

### 4a. Test the compiler first (half a day, decides whether to go on)

Solid's TSX is not React's. Babel compiles it with `babel-preset-solid`, set to `generate: "universal"` and to a `moduleName` naming our renderer. Bun's own JSX cannot do that. Check that a Bun plugin can:
- `@dschz/bun-plugin-solid` passes `generate` through to Babel, but documents only DOM and SSR output; universal output is unconfirmed. Otherwise, a 20-line `Bun.plugin` calling Babel ourselves.
- It runs under `bun run`, loaded through `preload` in `bunfig.toml`.
- It works with `bun build --compile` (plugins through the JavaScript API), since apps ship as one binary.
- `bun check` type-checks with `jsx: "preserve"` and `jsxImportSource: "solid-js"` in the Solid examples' own tsconfig.
- Measure what Babel costs at startup.

If one of these fails, stop and write down why. React stays the only adapter.

### 4b. The renderer

`solid-js/universal`'s `createRenderer` asks for these functions:

| Solid asks | raven-tsx does |
|---|---|
| `createElement(tag)` | `WidgetInstance.create(tag, {})`, or a `WindowInstance` for `Window`. It stays pending: nothing in Raven yet. |
| `setProperty(node, name, value)` | Writes the prop into the node's props and asks for a flush. A pending node takes its props when it is made; a live one gets `update(props)` at the flush. |
| `insertNode(parent, node, anchor)` | Under a pending parent, the node is only recorded, as `appendInitial` does now. Under a live parent, `insertBefore` or `append`, which makes it in Raven. |
| `removeNode(parent, node)` | `remove`, then `forgetTree` and `dispose`. |
| `createTextNode`, `replaceText`, `isTextNode` | A small text node in JavaScript only. A widget's text children become its `Text` attribute, as with React; text next to widgets is an error, as with React. |
| `getParentNode`, `getFirstChild`, `getNextSibling` | Read from the `children` lists the nodes already keep. |

**The flush.** Solid has no commit, so one is made: `setProperty` and `insertNode` schedule one `queueMicrotask`. It runs `update` once per changed node with all its props, then `finishPlacing()`. That keeps one Raven call per node per batch, as with React, and reuses `update` as it is.

**What `WidgetInstance` needs** for this:
- A pending node whose props change before it is made, through a `setPending(props)` that resolves them again.
- `append` and `insertBefore` on a pending parent that only record the child, instead of making it at once.

**Errors are simpler than with React.** Solid makes nodes without a render phase that it throws away. A part that fails is never inserted, so it stays pending and nothing reaches Raven. That is the model of PR #7, so the trade-off with error boundaries described there does not exist in Solid.

### 4c. The rest of the adapter
- **`runApp`, `createWindow`, `RavenRoot`** on Solid's `render(() => <App />, container)`.
- **Hooks** as Solid functions: `createAction`, `createShortcut`, `createFrame`, each on `onCleanup`. They don't need React's "latest value" ref.
- **`registerTag`** through the phase 2 interface, with `render` into the container.
- **A portal**, the equivalent of `createPortal`, which renders into a widget.
- **Refs.** `ref={el}` gives the `WidgetInstance` or `WindowInstance`, as with React.
- **Generated components** in `solid/components.generated.ts`, from the same prop interfaces.

### 4d. Check
- Port the renderer tests that do not depend on React, to `test/solid/`:
  - mounting, updates, removing and reordering children, text;
  - windows, handler counts back to zero, controlled values, a part that fails.
- Port two examples, `hello` and `components`. Run them headless and compare screenshots with their React versions, which should be the same pixels.

### Risks to settle in 4a and 4b
- **Controlled values.** React puts a controlled value back after an event (`controlledSync`). In Solid, a signal that did not change never calls `setProperty`, so typing in a `TextInput` whose `Text` is a constant would stay. This needs a rule, and probably the same put-back that React uses.
- **Moving nodes.** Check that Solid moves a node by inserting it again, without `removeNode`. Otherwise `removeNode` cannot mean "dispose", and dispose has to wait for the flush.
- **Prop order.** Check whether `setProperty` can run after `insertNode` for a static prop. If it can, `Markup` could arrive after the node is made.

## Not planned

- **Svelte.** Svelte components are `.svelte` files compiled by Svelte, not TSX, so it does not fit "TSX, any framework". Its custom-renderer API is also not released: the Svelte docs say it is "not yet available", and the work is tracked in sveltejs/svelte#15470.
- **Vue.** This is the better third candidate, if one is wanted: it has an official, stable `createRenderer` and supports TSX through its JSX Babel plugin. The adapter interface of phase 2 should not rule it out, but it is not part of this plan.

## Order and size

| Phase | Depends on | Size |
|---|---|---|
| 1. Rename | PR #7 merged | half a day |
| 2. Core and React separated | 1 | 1–2 days |
| 3. Node.js backend | 2 (shares the core folder), an upstream binding | its own plan |
| 4a. Solid compiler test | 2 | half a day |
| 4b–d. Solid adapter, tests, two examples | 4a works | 3–5 days |

## Decisions for the user

1. **Package layout.** One package with subpaths (recommended), or separate packages.
2. **Repository name.** Decided: `raven-tsx`, all lowercase.
3. **Whether to do Solid** after phase 2, or stop at a clean core until someone asks for it.
