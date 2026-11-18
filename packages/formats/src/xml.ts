// XML for the XML formats (JUnit today; TRX with ING-07). The browser and the
// webview bring a native `DOMParser`; Node has none, so the server injects one
// (`@xmldom/xmldom`) with `configureXml` at boot. Parsers only use the DOM
// Level 2 subset both implement, typed here structurally so the package needs
// no DOM lib: `childNodes`, `nodeType`, `localName`, `getAttribute`,
// `textContent` and `getElementsByTagName` (ADR-0053).

export interface XmlNode {
  readonly nodeType: number;
  readonly childNodes: ArrayLike<XmlNode>;
  readonly textContent: string | null;
}

export interface XmlElement extends XmlNode {
  readonly localName: string;
  getAttribute(name: string): string | null;
  getElementsByTagName(name: string): ArrayLike<XmlElement>;
}

export interface XmlDocument {
  readonly documentElement: XmlElement | null;
  getElementsByTagName(name: string): ArrayLike<XmlElement>;
}

/** Anything with the standard `DOMParser` shape (native or `@xmldom/xmldom`). */
export interface DomParserLike {
  parseFromString(text: string, type: string): unknown;
}

type XmlParse = (text: string) => XmlDocument;

let injected: XmlParse | undefined;

const using =
  (Parser: new () => DomParserLike): XmlParse =>
  (text) =>
    new Parser().parseFromString(text, "application/xml") as XmlDocument;

/** Sets the XML parser for this process (Node: `configureXml(DOMParser)` with
 *  `@xmldom/xmldom`'s class). The browser needs no call. */
export function configureXml(Parser: new () => DomParserLike): void {
  injected = using(Parser);
}

/** The configured parser, else the native `DOMParser`. Throws, or returns a
 *  document with a `parsererror` element, on malformed input. */
export function xmlParser(): XmlParse {
  if (injected) return injected;
  const native = (globalThis as { DOMParser?: new () => DomParserLike })
    .DOMParser;
  if (native) return using(native);
  throw new Error(
    "No XML parser: call configureXml() with @xmldom/xmldom's DOMParser in Node.",
  );
}

/** The element children of a node, optionally only those named `name`. */
export function elements(node: XmlNode, name?: string): XmlElement[] {
  const out: XmlElement[] = [];
  const list = node.childNodes;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.nodeType === 1) {
      const el = c as XmlElement;
      if (name === undefined || el.localName === name) out.push(el);
    }
  }
  return out;
}
