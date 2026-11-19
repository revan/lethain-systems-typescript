/**
 * Tooling to convert a model into a Graphviz diagram. Port of `systems/viz.py`.
 *
 * The Python version uses the `graphviz` package's `Digraph`; this port emits
 * the same DOT source text directly, so it has no runtime dependency.
 */
import { AttributeError, type Model } from "./models.js";

const HTML_STRING = /^<[\s\S]*>$/;
const ID = /^(?:[a-zA-Z_][a-zA-Z0-9_]*|-?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?))$/;
const KEYWORDS = new Set(["node", "edge", "graph", "digraph", "subgraph", "strict"]);

/** DOT identifier from string, quoted if needed (mirrors `graphviz.quoting.quote`). */
export function quote(identifier: string): string {
  if (HTML_STRING.test(identifier)) return identifier;
  if (!ID.test(identifier) || KEYWORDS.has(identifier.toLowerCase())) {
    return `"${identifier.replace(/((?:\\\\)*)\\?"/g, '$1\\"')}"`;
  }
  return identifier;
}

/** A minimal DOT digraph, matching the source text of Python's `graphviz.Digraph`. */
export class Digraph {
  readonly body: string[] = [];

  constructor(readonly comment?: string) {}

  attr(attrs: Record<string, string>): void {
    for (const [k, v] of Object.entries(attrs)) this.body.push(`\t${quote(k)}=${quote(v)}\n`);
  }

  node(name: string, label?: string): void {
    const attrs = label === undefined ? "" : ` [label=${quote(label)}]`;
    this.body.push(`\t${quote(name)}${attrs}\n`);
  }

  edge(tail: string, head: string): void {
    this.body.push(`\t${quote(tail)} -> ${quote(head)}\n`);
  }

  get source(): string {
    const comment = this.comment === undefined ? "" : `// ${this.comment}\n`;
    return `${comment}digraph {\n${this.body.join("")}}\n`;
  }
}

export function asDot(model: Model, rankdir = "LR"): Digraph {
  const mapping = new Map<string, string>();
  model.stocks.forEach((s, i) => mapping.set(s.name, String(i)));
  const id = (name: string | undefined): string => {
    if (name === undefined) throw new AttributeError("'NoneType' object has no attribute 'name'");
    return mapping.get(name) ?? "";
  };

  const dot = new Digraph(model.name);
  dot.attr({ rankdir });

  for (const stock of model.stocks) {
    dot.node(id(stock.name), stock.name);
  }
  for (const flow of model.flows) {
    dot.edge(id(flow.source?.name), id(flow.destination?.name));
  }
  return dot;
}
