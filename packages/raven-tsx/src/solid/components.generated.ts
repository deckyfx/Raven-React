// Generated from the schema of Raven by src/tools/generate-components.ts: do not edit.
import type * as Props from "../core/props.generated";
import type { WindowInstance } from "../core/window-instance";
import { tag } from "./tag";

/**
 * A window of its own, wherever it is in the tree: it opens with its element and closes with it.
 * With `OnClose`, closing is a request: the window stays until the element is taken out.
 */
export const Window = tag<Props.WindowProps, WindowInstance>("Window");

/** Stacks its children from top to bottom. */
export const VBox = tag<Props.VBoxProps>("VBox");

/** Lines its children up from left to right. */
export const HBox = tag<Props.HBoxProps>("HBox");

/** Places its children in rows and columns (Slot.Column, Slot.Row). */
export const Grid = tag<Props.GridProps>("Grid");

/** Cells of the same size, filled in order. */
export const UniformGrid = tag<Props.UniformGridProps>("UniformGrid");

/** Puts its children on top of each other. */
export const Overlay = tag<Props.OverlayProps>("Overlay");

/** A surface with padding around one child. */
export const Border = tag<Props.BorderProps>("Border");

/** Gives one child a size or a shape. */
export const SizeBox = tag<Props.SizeBoxProps>("SizeBox");

/** Empty space. */
export const Spacer = tag<Props.SpacerProps>("Spacer");

/** Scrolls content that is larger than its place. */
export const ScrollBox = tag<Props.ScrollBoxProps>("ScrollBox");

/** Panes separated by bars the user drags. */
export const Splitter = tag<Props.SplitterProps>("Splitter");

/** Lines its children up and continues on the next line. */
export const WrapBox = tag<Props.WrapBoxProps>("WrapBox");

/** Places its children freely (Slot.Position, Slot.Size, Slot.Anchors). */
export const Canvas = tag<Props.CanvasProps>("Canvas");

/** Shows one of its children. */
export const Switcher = tag<Props.SwitcherProps>("Switcher");

/** Its children as tabs (Slot.Title). */
export const TabView = tag<Props.TabViewProps>("TabView");

/** A header that shows and hides one child. */
export const Expander = tag<Props.ExpanderProps>("Expander");

/** Text. */
export const Label = tag<Props.LabelProps>("Label");

/** A button, with a text or with one child. */
export const Button = tag<Props.ButtonProps>("Button");

/** A box to check, a radio button or a switch. */
export const Checkbox = tag<Props.CheckboxProps>("Checkbox");

/** A value chosen by dragging. */
export const Slider = tag<Props.SliderProps>("Slider");

/** How far something is. */
export const ProgressBar = tag<Props.ProgressBarProps>("ProgressBar");

/** A picture. */
export const Image = tag<Props.ImageProps>("Image");

/** One line of text to type. */
export const TextInput = tag<Props.TextInputProps>("TextInput");

/** A number to type or to step. */
export const SpinBox = tag<Props.SpinBoxProps>("SpinBox");

/** One choice in a list that drops down. */
export const ComboBox = tag<Props.ComboBoxProps>("ComboBox");

/** A line between things. */
export const Separator = tag<Props.SeparatorProps>("Separator");

/** Rows of text, one selected; any number of them. */
export const ListView = tag<Props.ListViewProps>("ListView");

/** Rows inside rows, made of Item elements. */
export const TreeView = tag<Props.TreeViewProps>("TreeView");

/** A grid of tiles, an icon over a name, given by the application (Rtile_view_set_items). */
export const TileView = tag<Props.TileViewProps>("TileView");

/** A bar of Menu elements; on macOS, shown in the menu bar of the system. */
export const MenuBar = tag<Props.MenuBarProps>("MenuBar");

/** A menu: MenuItem, Separator and Menu elements. */
export const Menu = tag<Props.MenuProps>("Menu");

/** An item of a menu. */
export const MenuItem = tag<Props.MenuItemProps>("MenuItem");

/** A place the application draws in with its own renderer. */
export const Viewport = tag<Props.ViewportProps>("Viewport");

/** A widget painted and measured by the application. */
export const Custom = tag<Props.CustomProps>("Custom");

/** Text of several lines: notes, code. */
export const TextEditor = tag<Props.TextEditorProps>("TextEditor");

/** The title bar of a window with a custom header; holds any widgets. */
export const HeaderBar = tag<Props.HeaderBarProps>("HeaderBar");

/** Folders and files to choose from. */
export const FileBrowser = tag<Props.FileBrowserProps>("FileBrowser");

/** Panels the user arranges by dragging their tabs. */
export const DockArea = tag<Props.DockAreaProps>("DockArea");

/** A pill at the top of the window that unfolds: first child folded, second unfolded. */
export const Island = tag<Props.IslandProps>("Island");

/** A panel that shows what is behind it out of focus, around one child. */
export const BackgroundBlur = tag<Props.BackgroundBlurProps>("BackgroundBlur");

/** Chooses a color: square, hues, opacity, code, numbers, swatches. */
export const ColorPicker = tag<Props.ColorPickerProps>("ColorPicker");

/** A sequencer: Track elements holding Clip and Key elements, and Marker elements. */
export const Timeline = tag<Props.TimelineProps>("Timeline");

/** Blocks that snap into each other (Scratch): Kind elements (Name, Label, Shape, Category) and Category elements (Name, Color). */
export const BlockEditor = tag<Props.BlockEditorProps>("BlockEditor");

/** Rows of cells under columns that can be resized and sorted: Column and Row elements; any number of rows. */
export const Table = tag<Props.TableProps>("Table");

/** A date, chosen in a calendar that drops down. */
export const DatePicker = tag<Props.DatePickerProps>("DatePicker");

/** A time of the day: hours, minutes, optionally seconds. */
export const TimePicker = tag<Props.TimePickerProps>("TimePicker");

/** A short message that rises over the content for a few seconds (in an Overlay). */
export const Toast = tag<Props.ToastProps>("Toast");

/** The path to the current place: links separated by chevrons. */
export const Breadcrumb = tag<Props.BreadcrumbProps>("Breadcrumb");

/** A score shown and chosen with stars. */
export const Rating = tag<Props.RatingProps>("Rating");

/** Page numbers with previous and next. */
export const Pagination = tag<Props.PaginationProps>("Pagination");

/** Curves of X / Y data: Series elements (Name, Color, Line, LineWidth, Marker, MarkerSize, MarkerFilled, Step, Fill, XAxis, Axis, MaxPoints, X and Y lists or Points "x,y x,y"), Scatter elements, and DragLine elements (Axis, Value, Label, Color). */
export const Plot = tag<Props.PlotProps>("Plot");

/** Nodes linked by wires: Node elements (Input, Output, any widget), Link and Type elements. */
export const NodeGraph = tag<Props.NodeGraphProps>("NodeGraph");
