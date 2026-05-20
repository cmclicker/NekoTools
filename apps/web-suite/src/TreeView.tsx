import { useMemo, useState, type CSSProperties } from 'react';
import { flattenForTree, type TreeNode } from './tree-model.js';
import { filterTreeNodes } from './search.js';

interface TreeViewProps {
  /**
   * The parsed JSON value to render. `null` is rendered as a valid
   * JSON `null` root (a leaf node), NOT as an empty state. The
   * "no document available" state is the caller's responsibility —
   * App.tsx checks `parseInput().hasDocument` and renders its own
   * empty-state UI when parsing failed, so TreeView only ever sees a
   * value that actually came out of a `json.document` artifact.
   */
  readonly value: unknown;
  /**
   * Pointer to the currently highlighted node, or `null` when no
   * node is selected. The empty string `""` is NOT the no-selection
   * value — it is the RFC 6901 root pointer, and selecting the root
   * row must be observable so Copy path / Copy value work on it.
   * (See App.tsx for the broader fix.)
   */
  readonly activePath: string | null;
  /** Called when the user clicks a node. The pointer is RFC 6901. */
  readonly onSelectPath: (pointer: string) => void;
  /**
   * Optional initial expansion set. Defaults to a Set containing only
   * the root path `''`. The tree component manages its own expansion
   * state thereafter — the parent only reads `activePath`.
   */
  readonly initiallyExpanded?: ReadonlySet<string>;
  /**
   * Phase 1.1g — optional case-insensitive search query. When
   * non-empty, the tree shows only nodes whose key or summary
   * matches, plus their ancestors so the path context is preserved.
   * Containers are auto-expanded so deep matches surface.
   */
  readonly searchQuery?: string;
}

const INDENT_REM = 1.25;

/**
 * Phase 1.1f tree view. Flat list rendering driven by `flattenForTree`,
 * with depth-based indentation and an expand/collapse toggle for
 * containers. Click anywhere on a row to set the active path; click
 * the chevron to toggle expansion.
 *
 * Phase 1.1g extended the component with `searchQuery` — when set,
 * the tree is fully expanded and filtered to matching nodes + their
 * ancestors. Clearing the query restores the user's previous manual
 * expansion state.
 *
 * The component is intentionally headless on layout — `.tree*`
 * classes in `styles.css` paint the affordances.
 */
export function TreeView({
  value,
  activePath,
  onSelectPath,
  initiallyExpanded,
  searchQuery,
}: TreeViewProps): JSX.Element {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => initiallyExpanded ?? new Set<string>(['']),
  );

  const querying = !!searchQuery && searchQuery.trim() !== '';

  // While a search is active, expand every container so deep
  // matches can surface; otherwise honor the user's manual state.
  const effectiveExpanded = useMemo<ReadonlySet<string>>(
    () => (querying ? expandAll(value) : expanded),
    [value, expanded, querying],
  );

  const nodes = useMemo(
    () => flattenForTree(value, { expanded: effectiveExpanded }),
    [value, effectiveExpanded],
  );

  const visibleNodes = useMemo(
    () => (querying ? filterTreeNodes(nodes, searchQuery!) : nodes),
    [nodes, querying, searchQuery],
  );

  function toggle(pointer: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pointer)) next.delete(pointer);
      else next.add(pointer);
      return next;
    });
  }

  // No empty-state branch here for "no document": `null` is a valid
  // JSON root. App.tsx handles the no-document case before TreeView
  // is rendered. We DO render a "no matches" hint when a search is
  // active and nothing matches — that's a search affordance, not a
  // document state.
  if (querying && visibleNodes.length === 0) {
    return (
      <div
        className="tree tree--no-matches"
        role="status"
        data-testid="tree-no-matches"
      >
        No nodes match the current search.
      </div>
    );
  }

  return (
    <ul className="tree" role="tree" aria-label="JSON tree">
      {visibleNodes.map((node) => (
        <TreeRow
          key={node.pointer || '__root__'}
          node={node}
          isActive={activePath !== null && node.pointer === activePath}
          isExpanded={effectiveExpanded.has(node.pointer)}
          onToggle={() => toggle(node.pointer)}
          onSelect={() => onSelectPath(node.pointer)}
        />
      ))}
    </ul>
  );
}

interface TreeRowProps {
  readonly node: TreeNode;
  readonly isActive: boolean;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
  readonly onSelect: () => void;
}

function TreeRow({ node, isActive, isExpanded, onToggle, onSelect }: TreeRowProps): JSX.Element {
  const isContainer = node.kind === 'object' || node.kind === 'array';
  const hasChildren = isContainer && node.childCount > 0;
  const style: CSSProperties = { paddingLeft: `${node.depth * INDENT_REM}rem` };

  return (
    <li
      className={`tree__row tree__row--${node.kind}${isActive ? ' tree__row--active' : ''}`}
      role="treeitem"
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-selected={isActive}
      data-pointer={node.pointer}
      data-kind={node.kind}
      style={style}
    >
      {hasChildren ? (
        <button
          type="button"
          className="tree__chevron"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
          onClick={onToggle}
        >
          {isExpanded ? '▾' : '▸'}
        </button>
      ) : (
        <span className="tree__chevron tree__chevron--placeholder" aria-hidden="true" />
      )}
      <button type="button" className="tree__label" onClick={onSelect}>
        <span className="tree__key">{node.key}</span>
        <span className="tree__sep">: </span>
        <span className="tree__summary">{node.summary}</span>
      </button>
    </li>
  );
}

/**
 * Pointers of every container in the document. Used to fully expand
 * the tree while a search is active so deep matches surface.
 */
function expandAll(value: unknown): ReadonlySet<string> {
  const out = new Set<string>(['']);
  walkExpand(value, '', out);
  return out;
}

function walkExpand(value: unknown, pointer: string, out: Set<string>): void {
  if (value !== null && typeof value === 'object') {
    out.add(pointer);
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        walkExpand(value[i], `${pointer}/${i}`, out);
      }
    } else {
      const obj = value as Record<string, unknown>;
      for (const k of Object.keys(obj)) {
        walkExpand(obj[k], `${pointer}/${encodeKeyForPointer(k)}`, out);
      }
    }
  }
}

function encodeKeyForPointer(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}
