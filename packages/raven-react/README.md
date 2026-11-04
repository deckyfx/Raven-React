# raven-react

A React renderer for [Raven](https://github.com/oscar-soirey/Raven), for [Bun](https://bun.com): write native desktop interfaces in TSX, on Raven's real widgets. No XML and no build step, as Bun compiles TSX itself.

```tsx
import { useState } from "react";
import { Button, Label, runApp, VBox } from "@decky.fx/raven-react";

function App() {
	const [count, setCount] = useState(0);
	return (
		<VBox Spacing={12} Slot={{ Padding: 24 }}>
			<Label>Clicked {count} times</Label>
			<Button Style="Primary" OnClicked={() => setCount(count + 1)}>Click me</Button>
		</VBox>
	);
}

await runApp(<App />, { Title: "Hello", Width: 480, Height: 240 });
```

## Install

Not on npm yet, and the name of the package is not final. Once it is published:

    bun add @decky.fx/raven-react react

```json
{ "compilerOptions": { "jsx": "react-jsx", "types": ["bun", "react"] } }
```

Raven's native library comes with it: there is a package per platform, and the package manager installs the one that fits. No install script runs, and nothing is compiled on your machine.

| Platform | Package |
|---|---|
| Linux x64, arm64 | `@decky.fx/raven-react-linux-x64`, `-linux-arm64` |
| macOS Apple Silicon, Intel | `@decky.fx/raven-react-darwin-arm64`, `-darwin-x64` |
| Windows x64 | `@decky.fx/raven-react-win32-x64` |

What the system must have: a Vulkan driver, and on Linux libX11. On macOS Vulkan comes from MoltenVK: `brew install molten-vk`.

`RAVEN_LIBRARY` set to the path of a library has priority, to try a build of your own.

## One executable

`bun build --compile` holds Bun, your code and the native library in one file:

    bun build --compile src/index.tsx --outfile app

For another platform, install its package first:

    bun install --os=win32 --cpu=x64
    bun build --compile --target=bun-windows-x64 src/index.tsx --outfile app.exe

## How props work

The components, with their props, are generated from Raven's own schema.

| XML | TSX |
|---|---|
| `Text="Hi"` | `Text="Hi"`, or `<Label>Hi</Label>` |
| `Width="120"` | `Width={120}` |
| `Slot.Padding="24"` | `Slot={{ Padding: 24 }}`, since JSX has no dots in names |
| `Items="a\|b"` | `Items={["a", "b"]}` |
| `OnClicked="name"` | `OnClicked={() => ...}` |

## Events

Events with a value give it to the function, at each change. A `TextInput` gives its text in `OnChanged` and again in `OnCommitted` on Enter.

| Component | Event | Value |
|---|---|---|
| `TextInput` | `OnChanged`, `OnCommitted` | `string` |
| `Checkbox`, `Expander` | `OnChanged` | `boolean` |
| `Slider`, `SpinBox` | `OnChanged` | `number` |
| `ComboBox`, `TabView` | `OnChanged` | index |
| `ListView`, `TileView` | `OnChanged`, `OnActivated` | index |
| `TreeView` | `OnChanged`, `OnActivated` | handle of the item |
| `Table` | `OnChanged`, `OnActivated` | row |
| `Table` | `OnSort` | column, and whether it is descending |
| `DatePicker` | `OnChanged` | `"YYYY-MM-DD"` |
| `TimePicker` | `OnChanged` | `"HH:MM:SS"` |
| `Rating` | `OnChanged` | `number` |
| `Pagination` | `OnChanged` | page, from 0 |
| `Breadcrumb` | `OnClicked` | index |
| `TextEditor` | `OnChanged`, `OnCompletion` | its text, the start of the word |
| `TextEditor` | `OnZoom` | `number` |
| `ColorPicker` | `OnChanged` | `"#RRGGBB"`, or `"#RRGGBBAA"` when it is not opaque |
| `Label` | `OnLink` | the address of the link |
| `MenuItem` | `OnClicked` | whether it is checked now |
| `Island` | `OnChanged` | `boolean` |
| `Viewport`, `<Window>` | `OnResize` | width, height |
| `FileBrowser` | `OnChanged`, `OnAccepted` | path |
| `DockArea` | `OnChanged` | its layout, for `Layout` or `Rdock_area_load_layout` |
| `TreeView`, `TileView`, `NodeGraph`, `BlockEditor` | `OnContext` | what was right clicked, x, y |
| `Timeline` | `OnTime` | seconds |
| `Timeline` | `OnItemChanged`, `OnSelection`, `OnActivated`, `OnRemoved` | item |
| `NodeGraph` | `OnLinked`, `OnUnlinked`, `OnMoved`, `OnSelection`, `OnRemoved`, `OnActivated` | link or node |
| `BlockEditor` | `OnChanged`, `OnClicked` | block |
| any widget, `<Window>` | `OnDrop` | an `RDropEvent` |
| any widget | `OnEvent` | an `REvent`, before the widget sees it: the pointer over a `Custom`, for one |

Some events ask: `OnClose` of a `TabView` (index, page) and of a `DockArea` (panel), `OnConnect` of a `NodeGraph` (two pins), and `OnEvent` and `OnDrop`, where true means taken. Return true to let the thing happen. A tab or a panel that stays can then go by taking its element out, which is the way to do it: when Raven closes a panel by itself, it deletes a widget React still has, which does no harm but leaves the element with a `.widget` that is no longer valid. `Documents` on a `TabView` gives its tabs a close button.

Other events give nothing, and share the one action a widget has in Raven: give a widget one of them. `Timeline` and `NodeGraph` have an `OnChanged` of this kind, once per gesture.

Inputs are controlled, as in React DOM. With `Text={value}`, what the state says stays on screen if a handler refuses a change. An update made in an event is committed before the next event, as a click in React DOM. `ListView` and `ComboBox` keep their `Selected` when their `Items` change. A `|` in an item would split it, as `Items` is written that way in XML: for such items use `ItemText`. `FileBrowser`'s `Directory` and `Timeline`'s `Playing` are not held this way: the user changes them with no event that says so.

## Windows

`<Window>` is an element like any other, anywhere in the tree: it opens with its element and closes with it. Without options, `runApp` lets the tree say what windows there are, and ends when the last one closes.

```tsx
function App() {
	const [help, setHelp] = useState(false);
	return (
		<>
			<Window Title="Main" Width={640} Height={480}>
				<Button OnClicked={() => setHelp(true)}>Help</Button>
			</Window>
			{help && <Window Title="Help" OnClose={() => setHelp(false)}><Label>...</Label></Window>}
		</>
	);
}

await runApp(<App />);
```

With `OnClose`, closing is a request: the window stays until the element is taken out. Without it, the user can close the window at any time. `Title`, `Theme`, `Width`, `Height`, `Backdrop`, `Opacity` and `ContinuousRedraw` can change on an open window. Other attributes only count when it is made.

An `<Island>` directly in a `<Window>` floats above the content at the top, as in XML. A `<Menu>` that no `MenuBar` or `Menu` holds is not shown until it is asked: its ref has `open(x, y)`, in the coordinates `OnContext` gives. A `<Separator>` in a `<Menu>` is a line of the menu.

## Going beyond props

`useShortcut(window, "Ctrl+S", save)` adds a shortcut to a window, given the ref of its `<Window>`. `useAction("scene.play", play)` names a function, for whatever fires actions by name; it receives the widget that fired it. An `On...` prop also takes such a name, or a built-in action: `OnClicked="app.quit"`.

`useFrame((seconds) => ...)` runs a function once per frame, before the layout, in any number of components. It also runs when nothing is happening, about 60 times a second: `runApp` wakes that often so that Bun's timers run beside Raven. `raven.Rset_frame_callback` goes in the same slot as one more function, so neither takes the place of the other, and the last one it was given is the only one kept alive.

`runApp(<App />, options, { appName, setup, allocator })`: `setup` runs after Raven starts and before the first render, for a look or a theme. `allocator` is what `Rset_allocator` takes, functions of C only.

`Theme` takes a name given to `Rtheme_load`, and `Language` a language that was registered, beside those the types propose. A color or a metric goes back to the theme with `null`, without making the widget again: `Color={{ Text: null }}`. `FontStyle` on a `Label` takes a style of the font of the theme, and does not go with `Font`.

A function given directly to the C API runs outside what props get. `inEventScope(fn)` makes it the same: an exception stays on this side, and what it changes in React is committed before the next event.

`createPortal(children, widget)`, as in ReactDOM, renders into a widget given to Raven by hand, the content of a graph node for one, and context goes on through it. `tag<Props>("Name")` makes a component for a tag given to `Rxml_register_tag`.

Children added with `Rwidget_add_child` to a parent React also fills stay in their place, through inserts and when the parent is made again. They are yours to delete.

Web pages need `registerWebView` once, as the `setup` of `runApp`. They are apart from the binding, as a library can be built without them, and `webFunctions()` gives the functions of `raven_web.h`:

```tsx
await runApp(<WebView Url="https://example.com" Slot={{ Fill: 1 }} />, { Width: 800, Height: 600 }, { setup: registerWebView });
```

The data of a few widgets is given as props. Rows of a `TreeView` have new handles each time `Items` changes. `Markup` holds the elements XML takes inside a widget, and a change to it makes the widget again:

```tsx
<TreeView Items={[{ Text: "World", Expanded: true, Children: [{ Text: "Sky" }] }]} />
<Timeline Markup={`<Track Name="Camera"><Clip Start="0" Length="3"/></Track>`} />
<Image Texture={raven.Rtexture_create_from_pixels(pixels, width, height)} />
```

A `ref` gives a `WidgetInstance`, and `raven` is all of Raven's C API. Read `.widget` when you need it: the handle changes if the widget is made again.

```tsx
const input = useRef<WidgetInstance>(null);
useEffect(() => input.current?.focus(), []);
<TextInput ref={input} />

// a TreeView is filled this way
raven.Rtree_view_add_item(tree.current.widget, raven.R_INVALID_ID, "World");
```

A `Custom` draws with the `Rdraw_` functions. `OnPaint` runs while a frame is drawn, so it must not change state.

```tsx
<Custom
	OnMeasure={() => ({ Width: 400, Height: 200 })}
	OnPaint={(painter, width, height) => raven.Rdraw_rect(painter, 0, 0, width, height, 8, 0.2, 0.3, 0.4, 1)}
/>
```

Long lists ask for their rows as they are shown, and a million rows cost nothing:

```tsx
<ListView ItemCount={1_000_000} ItemText={(index) => `Row ${index}`} />
<TileView ItemCount={200} ItemFill={(index, item) => { item.text = names[index]; }} />
<Table Columns={["Name", "Age"]} RowCount={people.length} CellText={(row, column) => cell(people[row], column)} />
```

Some things are done through a `ref`, as they are actions and not state:

```tsx
raven.Rtoast_show(toast.current.widget, "Saved", 3);
raven.Rnotification_show("Backup", "It is finished", raven.R_NOTIFICATION_NORMAL);
```

An `Image` shows an SVG file like any other: `<Image Source="logo.svg" />`.

## What to expect

- Removing a prop makes the widget again, in its place, with the same children: Raven has no way to give an attribute its default back. What the widget held by itself (focus, typed text, scrolling) is lost. To avoid that, keep the prop and change its value.
- The designer of Raven does not edit TSX.
- Style parts and states (`Part=`, `State=`) only exist in theme files.

## Working on this package

The repository is a Bun workspace, with this package in `packages/raven-react` and an application to try it in `examples/helloworld`. It expects a Raven checkout two folders up, at `../../raven` from the root:

    raven/                 github.com/oscar-soirey/Raven
    bun/raven-react/       this repository

Build Raven, then make the native package of your platform from it:

    cmake -S raven -B raven/build-shared -DCMAKE_BUILD_TYPE=Release -DRAVEN_BUILD_SHARED=ON
    cmake --build raven/build-shared --parallel
    cd bun/raven-react/packages/raven-react
    bun run native:local
    bun install
    bun test

Then, in `examples/helloworld`: `bun run dev`, or `bun run build`.

| Task | Command |
|---|---|
| Regenerate the components | `bun run generate` |
| Cross-build `raven.dll` on Linux with MinGW-w64, then `bun install` | `bun run native:windows` |
| Compile a Windows `.exe` of the example, after that | `bun run build:windows` in `examples/helloworld` |
| Where things stand, and what changed in Raven's API | `bun run raven:status [ref]` |
| Check that everything agrees with the pin | `bun run raven:check` |
| Move to another Raven, or to the latest | `bun run raven:update [ref]` |

`RAVEN_VERSION` says which Raven this is, a full commit or a tag, and nothing else does. `raven:update` is the way to change it: it moves the checkout, builds the libraries, packages one, and only then takes the binding, writes the pin and generates the components, since a newer library works with an older binding and the opposite stops every application at startup. It stops at the first step that fails, and can be run again.

Nothing in a library says which commit it is: `Rget_version` is the same for every commit between two releases. So `native:local` asks CMake which checkout the build folder belongs to, refuses it unless that checkout is at the pin with no changes, brings the build up to date, and writes `raven.json` beside the library. `--allow-mismatch` packages a library to try a change, and `raven:check` then says so. An application started with a library that lacks what the binding needs says so too, rather than naming one symbol.

`src/test/coverage.test.ts` fails when Raven adds a tag, an attribute or a callback nobody has decided about: wire it, or say there why not.

### Drift

`drift.txt` records the git blob of each Raven file that raven-react copies or mirrors: the examples, `src/widgets`, `src/widget` and `src/xml`. It catches what an API diff cannot, such as a widget that behaves differently or an example that gained a feature.

| Task | Command |
|---|---|
| What differs from `drift.txt` at the pin | `bun run raven:drift` |
| Preview another commit before moving to it | `bun run raven:drift upstream/main` |
| The same, failing if anything differs | `bun run raven:drift --check` |
| Record a file or folder as checked, at the pin | `bun run raven:drift --accept examples/music` |
| Record everything as checked, at the pin | `bun run raven:drift --accept-all` |

`raven:status` and `raven:check` include it. A changed file is listed as `old..new`, and `git diff old new` in the Raven checkout shows the change. Accept a file only after you have looked at it: the diff of `drift.txt` in a commit is the record of what was reviewed.

Every push builds Raven at `RAVEN_VERSION` on each platform, and runs `raven:check` and the tests there.

Publishing is off for now. To turn it on, set the repository variable `NPM_PUBLISH` to `true` and the secret `NPM_TOKEN`. A new version is then: set `version` in `package.json`, and push the tag `v<version>`. The packages of the platforms are published first, then this one.
