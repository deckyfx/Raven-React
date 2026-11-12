import type { WebViewProps } from "../core/web";
import { tag } from "./tag";

/** A page of the web, after `registerWebView`. */
export const WebView = tag<WebViewProps>("WebView");
