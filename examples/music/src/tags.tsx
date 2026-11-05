/**
 * The four tags the C example makes itself (`tags.c`, Rxml_register_tag), as components over an
 * ordinary widget: `Icon` and `Cover` are an `Image`, `Visualizer` a `Custom`, `Heading` a `Label`.
 * What they do not know (CornerRadius, Opacity, Slot...) goes to that widget.
 */

import { useCallback, useLayoutEffect, useRef, type ComponentProps, type ReactNode } from "react";
import type { Pointer } from "bun:ffi";
import { Custom, Image, Label, raven, type WidgetInstance } from "@decky.fx/raven-react";
import { atlasTexture, glyphRegion, type Glyph } from "./glyphs";
import { albumAt } from "./library";
import { usePlaying } from "./music";

type ImageProps = ComponentProps<typeof Image>;

/** The props of `Icon`. */
export interface IconProps extends Omit<ImageProps, "Tint" | "TintText" | "Width" | "Height" | "Region" | "Stretch" | "Source" | "ref" | "children"> {
	readonly Glyph: Glyph;
	readonly Size?: number;
	/** A color of its own. Without one, the picture takes the color of the text around it. */
	readonly Tint?: string;
}

/**
 * A picture drawn by the application, in the color of the text around it. The texture has no
 * attribute in Raven (`Source` is a file): it is given through the handle.
 */
export function Icon({ Glyph, Size = 20, Tint, ...rest }: IconProps): ReactNode {
	const image = useRef<WidgetInstance>(null);
	useLayoutEffect(() => {
		if (image.current) {
			raven.Rimage_set_texture(image.current.widget, atlasTexture());
		}
	}, []);
	return (
		<Image
			ref={image}
			Stretch="Fit"
			Region={glyphRegion(Glyph)}
			Tint={Tint ?? "#FFFFFF"}
			TintText={Tint === undefined}
			Width={Size}
			Height={Size}
			HitTestable={false}
			AccessibleHidden
			{...rest}
		/>
	);
}

/** The props of `Cover`. */
export interface CoverProps extends Omit<ImageProps, "Width" | "Height" | "Stretch" | "Source" | "ref" | "children"> {
	/** The index of the album. */
	readonly Album: number;
	readonly Size?: number;
}

/** The cover of an album. */
export function Cover({ Album, Size = 56, CornerRadius = 6, ...rest }: CoverProps): ReactNode {
	const image = useRef<WidgetInstance>(null);
	useLayoutEffect(() => {
		if (image.current) {
			raven.Rimage_set_texture(image.current.widget, albumAt(Album).texture);
		}
	}, [Album]);
	return <Image ref={image} Stretch="Cover" CornerRadius={CornerRadius} Width={Size} Height={Size} HitTestable={false} {...rest} />;
}

/** Some music that is not there: a few waves per bar, a beat every half second. */
function fakeLevel(bar: number, bars: number, time: number): number {
	const x = bar / (bars > 1 ? bars - 1 : 1);
	const beat = (0.5 + 0.5 * Math.cos((time % 0.5) * 12.566)) ** 6;
	const bass = (1 - x) * (0.55 + 0.45 * beat);
	const body = 0.5 + 0.25 * Math.sin(time * (3.1 + bar * 0.37) + bar * 1.7) + 0.2 * Math.sin(time * (7.3 + bar * 0.11) + bar);
	return Math.min(Math.max(0.15 + bass * 0.6 + body * (0.35 + x * 0.25) * (1 - x * 0.35), 0.05), 1);
}

/** The props of `Visualizer`. */
export interface VisualizerProps extends Omit<ComponentProps<typeof Custom>, "OnPaint" | "OnMeasure" | "ref" | "children"> {
	readonly Bars?: number;
	readonly Gap?: number;
}

/**
 * Bars that dance while it plays, in the accent color. They are painted, frame by frame, from
 * values kept in refs: no state changes and React has nothing to do while they move.
 */
export function Visualizer({ Bars = 5, Gap = 2, Width = 24, Height = 18, ...rest }: VisualizerProps): ReactNode {
	const widget = useRef<WidgetInstance>(null);
	const levels = useRef(new Float32Array(Bars));
	const last = useRef(0);
	const playing = useRef(false);
	const isPlaying = usePlaying();
	// (after the commit: a render that React throws away does not reach what paint reads)
	useLayoutEffect(() => {
		playing.current = isPlaying;
	}, [isPlaying]);

	const paint = useCallback((painter: Pointer | null, width: number, height: number): void => {
		if (!widget.current) {
			return;
		}
		const now = raven.Rget_time();
		const dt = last.current > 0 ? now - last.current : 0.016;
		last.current = now;
		const [r, g, b, a] = raven.Rwidget_get_color(widget.current.widget, raven.R_COLOR_ACCENT);
		const barWidth = Math.max((width - Gap * (Bars - 1)) / Bars, 1);
		for (let i = 0; i < Bars; i++) {
			const level = levels.current[i] ?? 0;
			const target = playing.current ? fakeLevel(i, Bars, now) : 0.08;
			const speed = target > level ? 22 : playing.current ? 9 : 4;
			const next = level + (target - level) * Math.min(Math.max(dt * speed, 0), 1);
			levels.current[i] = next;
			const h = Math.max(next * height, barWidth);
			raven.Rdraw_rect(painter, i * (barWidth + Gap), height - h, barWidth, h, barWidth * 0.5, r, g, b, a * (0.55 + 0.45 * next));
		}
	}, [Bars, Gap]);

	return <Custom ref={widget} Width={Width} Height={Height} HitTestable={false} OnPaint={paint} {...rest} />;
}

/** A label in the bold of the font of Raven. The attribute `Font` takes only a file, so the variant is given through the handle. */
export function Heading(props: Omit<ComponentProps<typeof Label>, "ref">): ReactNode {
	const label = useRef<WidgetInstance>(null);
	useLayoutEffect(() => {
		if (label.current) {
			raven.Rlabel_set_font(label.current.widget, raven.Rfont_get_variant(raven.Rfont_get_default(), raven.R_FONT_BOLD));
		}
	}, []);
	return <Label ref={label} AccessibleRole="Heading" {...props} />;
}
