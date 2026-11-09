/**
 * The curves and drag lines of a `Plot`, given as props. XML would have them as elements inside the
 * widget, with their numbers as text: here they go to Raven by calling it, so that a million points
 * stay one typed array, and a new render only sends what changed.
 */

import { RavenError } from "./errors";
import type { DataValue, PlotDragLine, PlotNumbers, PlotSeries } from "./props";
import * as r from "./raven";

/** The data props of a widget, by name. */
type PlotData = ReadonlyMap<string, DataValue>;

const LINES: Readonly<Record<NonNullable<PlotSeries["Line"]>, r.RPlotLine>> = {
	Solid: r.R_PLOT_LINE_SOLID,
	Dashed: r.R_PLOT_LINE_DASHED,
	Dotted: r.R_PLOT_LINE_DOTTED,
	DashDot: r.R_PLOT_LINE_DASH_DOT,
	None: r.R_PLOT_LINE_NONE,
};

const MARKERS: Readonly<Record<NonNullable<PlotSeries["Marker"]>, r.RPlotMarker>> = {
	None: r.R_PLOT_MARKER_NONE,
	Circle: r.R_PLOT_MARKER_CIRCLE,
	Square: r.R_PLOT_MARKER_SQUARE,
	Diamond: r.R_PLOT_MARKER_DIAMOND,
	TriangleUp: r.R_PLOT_MARKER_TRIANGLE_UP,
	TriangleDown: r.R_PLOT_MARKER_TRIANGLE_DOWN,
	Cross: r.R_PLOT_MARKER_CROSS,
	Plus: r.R_PLOT_MARKER_PLUS,
	Asterisk: r.R_PLOT_MARKER_ASTERISK,
};

const AXES: Readonly<Record<NonNullable<PlotDragLine["Axis"]>, r.RPlotAxis>> = { X: r.R_PLOT_X, Y: r.R_PLOT_Y, X2: r.R_PLOT_X2, Y2: r.R_PLOT_Y2 };

const NEW_SERIES: PlotSeries = {};
const COLOR = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const seriesOf = (data: PlotData): readonly PlotSeries[] => (data.get("Series") ?? []) as readonly PlotSeries[];
const linesOf = (data: PlotData): readonly PlotDragLine[] => (data.get("DragLines") ?? []) as readonly PlotDragLine[];

/** A color as the four numbers Raven takes for a series or a line. */
function colorOf(color: string): [red: number, green: number, blue: number, alpha: number] {
	const channel = (from: number): number => parseInt(color.slice(from, from + 2), 16) / 255;
	return [channel(1), channel(3), channel(5), color.length > 7 ? channel(7) : 1];
}

/** Whether two lists of numbers hold the same values. NaN, a gap in a curve, is the same as NaN. */
function sameNumbers(a: PlotNumbers | undefined, b: PlotNumbers | undefined): boolean {
	if (a === b) {
		return true;
	}
	if (!a || !b || a.length !== b.length) {
		return false;
	}
	for (let index = 0; index < a.length; index++) {
		if (!Object.is(a[index], b[index])) {
			return false;
		}
	}
	return true;
}

/** Whether something an entry had is gone from it: Raven has no way to give it its default back. */
function lostSomething<T extends object>(before: T, after: T): boolean {
	return Object.entries(before).some(([name, value]) => value !== undefined && after[name as keyof T] === undefined);
}

/** How many entries, from the first, can be changed in place. The others are made again. */
function keptCount<T>(before: readonly T[], after: readonly T[], remake: (before: T, after: T) => boolean): number {
	const shared = Math.min(before.length, after.length);
	const first = before.slice(0, shared).findIndex((entry, index) => remake(entry, after[index] as T));
	return first < 0 ? shared : first;
}

/** Gives a series what changed in its props. */
function setSeries(plot: r.Rid, index: number, before: PlotSeries, after: PlotSeries): void {
	if (before.Name !== after.Name) {
		r.Rplot_set_series_name(plot, index, after.Name ?? null);
	}
	if (after.Color !== undefined && before.Color !== after.Color) {
		r.Rplot_set_series_color(plot, index, ...colorOf(after.Color));
	}
	// (a width of 0 and a size of 0 keep what the series has)
	if (before.Line !== after.Line || before.LineWidth !== after.LineWidth) {
		r.Rplot_set_series_line(plot, index, LINES[after.Line ?? "Solid"], after.LineWidth ?? 0);
	}
	if (before.Marker !== after.Marker || before.MarkerSize !== after.MarkerSize) {
		r.Rplot_set_series_marker(plot, index, MARKERS[after.Marker ?? "None"], after.MarkerSize ?? 0);
	}
	if (after.MarkerFilled !== undefined && before.MarkerFilled !== after.MarkerFilled) {
		r.Rplot_set_series_marker_filled(plot, index, Number(after.MarkerFilled));
	}
	if (after.Step !== undefined && before.Step !== after.Step) {
		r.Rplot_set_series_step(plot, index, Number(after.Step));
	}
	if (after.Fill !== undefined && before.Fill !== after.Fill) {
		r.Rplot_set_series_fill(plot, index, after.Fill);
	}
	if (before.XAxis !== after.XAxis || before.YAxis !== after.YAxis) {
		r.Rplot_set_series_axes(plot, index, AXES[after.XAxis ?? "X"], AXES[after.YAxis ?? "Y"]);
	}
	if (after.Visible !== undefined && before.Visible !== after.Visible) {
		r.Rplot_set_series_visible(plot, index, Number(after.Visible));
	}
	// (before the points, as in XML, so that they are cut to it once)
	if (after.MaxPoints !== undefined && before.MaxPoints !== after.MaxPoints) {
		r.Rplot_set_series_max_points(plot, index, after.MaxPoints);
	}
	if (!sameNumbers(before.X, after.X) || !sameNumbers(before.Y, after.Y)) {
		r.Rplot_set_series_data(plot, index, after.X ?? null, after.Y ?? null, after.Y?.length ?? 0);
	}
}

/** Goes from one list of series to another, by their place in it. */
function applySeries(plot: r.Rid, before: readonly PlotSeries[], after: readonly PlotSeries[]): void {
	const kept = keptCount(before, after, lostSomething);
	for (let index = before.length - 1; index >= kept; index--) {
		r.Rplot_remove_series(plot, index);
	}
	after.forEach((series, index) => {
		if (index >= kept) {
			r.Rplot_add_series(plot, null);
		}
		setSeries(plot, index, (index < kept ? before[index] : undefined) ?? NEW_SERIES, series);
	});
}

/** Goes from one list of drag lines to another. Raven cannot change the axis or the label of a line. */
function applyDragLines(plot: r.Rid, before: readonly PlotDragLine[], after: readonly PlotDragLine[]): void {
	const kept = keptCount(before, after, (old, now) => lostSomething(old, now) || old.Axis !== now.Axis || old.Label !== now.Label);
	for (let index = before.length - 1; index >= kept; index--) {
		r.Rplot_remove_drag_line(plot, index);
	}
	after.forEach((line, index) => {
		const old = index < kept ? before[index] : undefined;
		if (!old) {
			r.Rplot_add_drag_line(plot, AXES[line.Axis ?? "X"], line.Value, line.Label ?? null);
		} else if (old.Value !== line.Value) {
			r.Rplot_set_drag_line_value(plot, index, line.Value);
		}
		if (line.Color !== undefined && line.Color !== old?.Color) {
			r.Rplot_set_drag_line_color(plot, index, ...colorOf(line.Color));
		}
	});
}

/** Throws when the data of a `Plot` cannot be shown. Called before anything changes. */
export function checkPlotData(data: PlotData): void {
	for (const { Name, X, Y, Color } of seriesOf(data)) {
		if (X && X.length !== (Y?.length ?? 0)) {
			RavenError.throw(`raven-tsx: the series ${Name ?? "without a name"} of a Plot has ${X.length} X for ${Y?.length ?? 0} Y`);
		}
		if (Color !== undefined && !COLOR.test(Color)) {
			RavenError.throw(`raven-tsx: the color of a series of a Plot should be #RRGGBB or #RRGGBBAA, and is ${Color}`);
		}
	}
	for (const { Color } of linesOf(data)) {
		if (Color !== undefined && !COLOR.test(Color)) {
			RavenError.throw(`raven-tsx: the color of a drag line of a Plot should be #RRGGBB or #RRGGBBAA, and is ${Color}`);
		}
	}
}

/** Gives a `Plot` what changed in its data. */
export function applyPlotData(plot: r.Rid, previous: PlotData, next: PlotData): void {
	applySeries(plot, seriesOf(previous), seriesOf(next));
	applyDragLines(plot, linesOf(previous), linesOf(next));
}

/** Puts the drag lines back where the props say, after a handler that refused the move. */
export function restorePlotData(plot: r.Rid, data: PlotData): void {
	const held = r.Rplot_get_drag_line_count(plot);
	linesOf(data).slice(0, held).forEach(({ Value }, index) => {
		if (r.Rplot_get_drag_line_value(plot, index) !== Value) {
			r.Rplot_set_drag_line_value(plot, index, Value);
		}
	});
}
