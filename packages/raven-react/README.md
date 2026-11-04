# raven-react

A React renderer for [Raven](https://github.com/oscar-soirey/Raven), for [Bun](https://bun.com): write native desktop interfaces in TSX, on Raven's real widgets. No XML and no build step, as Bun compiles TSX itself.

```tsx
import { useState } from "react";
import { Button, Label, runApp, VBox } from "@deckyfx/raven-react";

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

    bun add @deckyfx/raven-react react

```json
{ "compilerOptions": { "jsx": "react-jsx", "types": ["bun", "react"] } }
```

Raven's native library comes with it: there is a package per platform, and the package manager installs the one that fits. No install script runs, and nothing is compiled on your machine.

| Platform | Package |
|---|---|
| Linux x64, arm64 | `@deckyfx/raven-react-linux-x64`, `-linux-arm64` |
| macOS Apple Silicon, Intel | `@deckyfx/raven-react-darwin-arm64`, `-darwin-x64` |
| Windows x64 | `@deckyfx/raven-react-win32-x64` |

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

Other events give nothing, and share the one action a widget has in Raven: give a widget one of them.

Inputs are controlled, as in React DOM. With `Text={value}`, what the state says stays on screen if a handler refuses a change. An update made in an event is committed before the next event, as a click in React DOM.

## What to expect

- Removing a prop makes the widget again, in its place, with the same children: Raven has no way to give an attribute its default back. What the widget held by itself (focus, typed text, scrolling) is lost. To avoid that, keep the prop and change its value.
- The designer of Raven does not edit TSX.

## Working on this package

It lives in a Bun workspace beside a Raven checkout, with an application to try it in:

    raven/                 github.com/oscar-soirey/Raven
    bun/package.json       workspaces: raven-react, raven-react/native/*, helloworld
    bun/bunfig.toml        linker = "hoisted"
    bun/raven-react/       this repository
    bun/helloworld/

Build Raven, then make the native package of your platform from it:

    cmake -S raven -B raven/build-shared -DCMAKE_BUILD_TYPE=Release -DRAVEN_BUILD_SHARED=ON
    cmake --build raven/build-shared --parallel
    cd bun/raven-react
    bun run native:local
    bun install
    bun test

| Task | Command |
|---|---|
| Regenerate the components | `bun run generate` |
| Cross-build `raven.dll` on Linux with MinGW-w64, then `bun install` | `bun run native:windows` |
| Move to another Raven | Set `RAVEN_VERSION`, then `bun run sync-binding --raven ../../raven` |

Every push builds Raven at `RAVEN_VERSION` on each platform, and runs the tests there.

Publishing is off for now. To turn it on, set the repository variable `NPM_PUBLISH` to `true` and the secret `NPM_TOKEN`. A new version is then: set `version` in `package.json`, and push the tag `v<version>`. The packages of the platforms are published first, then this one.
