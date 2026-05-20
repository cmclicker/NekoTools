import { useMemo, useState, type CSSProperties } from 'react';
import { flattenForTree, type TreeNode } from './tree-model.js';

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
  /** Pointer to the currently highlighted node, or `''` for none. */
  readonly activePath: string;
  /** Called when the user clicks a node. The pointer is RFC 6901. */
  readonly onSelectPath: (pointer: string) => void;
  /**
   * Optional initial expansion set. Defaults to a Set containing only
   * the root path `''`. The tree component manages its own expansion
   * state thereafter — the parent only reads `activePath`.
   */
  readonly initiallyExpanded?: ReadonlySet<string>;
}

const INDENT_REM = 1.25;

/**
 * Phase 1.1f tree view. Flat list rendering driven by `flattenForTree`,
 * with depth-based indentation and an expand/collapse toggle for
 * containers. Click anywhere on a row to set the active path; click
 * the chevron to toggle expansion.
 *
 * The component is intentionally headless on layout — `.tree*`
 * classes in `styles.css` paint the affordances.
 */
export function TreeView({
  value,
  activePath,
  onSelectPath,
  initiallyExpanded,
}: TreeViewProps): JSX.Element {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => initiallyExpanded ?? new Set<string>(['']),
  );

  const nodes = useMemo(
    () => flattenForTree(value, { expanded }),
    [value, expanded],
  );

  function toggle(pointer: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pointer)) next.delete(pointer);
      else next.add(pointer);
      return next;
    });
  }

  // No empty-state branch here: `null` is a valid JSON root and
  // renders as a `null` leaf. The App always provides input (default
  // sample), so the tree never sees a true "nothing loaded" state.
  // A dedicated empty-state UI can be added in a later PR if a
  // "clear" button is introduced.

  return (
    <ul className="tree" role="tree" aria-label="JSON tree">
      {nodes.map((node) => (
        <TreeRow
          key={node.pointer || '__root__'}
          node={node}
          isActive={node.pointer === activePath}
          isExpanded={expanded.has(node.pointer)}
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
