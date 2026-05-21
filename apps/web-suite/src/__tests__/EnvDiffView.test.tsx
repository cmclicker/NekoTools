import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { EnvDiff } from '@nekotools/lens-env';

import { EnvDiffView, maskValueInHunk } from '../EnvDiffView.js';

describe('EnvDiffView', () => {
  it('renders the empty-state hint when diff is null (no compare-against document)', () => {
    render(<EnvDiffView diff={null} maskValues={false} />);
    expect(screen.getByTestId('env-diff-empty')).toBeInTheDocument();
  });

  it('renders the identical-state hint when the diff has zero hunks', () => {
    const diff: EnvDiff = { leftArtifactId: 'a', rightArtifactId: 'b', hunks: [] };
    render(<EnvDiffView diff={diff} maskValues={false} />);
    expect(screen.getByTestId('env-diff-identical')).toBeInTheDocument();
  });

  it('renders add / remove / equal hunks with the expected markers', () => {
    const diff: EnvDiff = {
      leftArtifactId: 'left_id',
      rightArtifactId: 'right_id',
      hunks: [
        { kind: 'equal', text: 'A=1', leftLine: 1, rightLine: 1 },
        { kind: 'remove', text: 'B=old', leftLine: 2 },
        { kind: 'add', text: 'B=new', rightLine: 2 },
      ],
    };
    render(<EnvDiffView diff={diff} maskValues={false} />);
    expect(screen.getByText(/--- left_id/)).toBeInTheDocument();
    expect(screen.getByText(/\+\+\+ right_id/)).toBeInTheDocument();
    const hunks = screen.getAllByTestId('env-diff-hunk');
    expect(hunks).toHaveLength(3);
    expect(hunks[0]).toHaveAttribute('data-kind', 'equal');
    expect(hunks[1]).toHaveAttribute('data-kind', 'remove');
    expect(hunks[2]).toHaveAttribute('data-kind', 'add');
    expect(hunks[0]?.textContent).toContain('A=1');
    expect(hunks[1]?.textContent).toContain('B=old');
    expect(hunks[2]?.textContent).toContain('B=new');
  });

  it('mask=true replaces values in KEY=VALUE hunk lines but keeps keys visible', () => {
    const diff: EnvDiff = {
      leftArtifactId: 'l',
      rightArtifactId: 'r',
      hunks: [
        { kind: 'remove', text: 'SECRET=verysecret', leftLine: 1 },
        { kind: 'add', text: 'SECRET=evenmoresecret', rightLine: 1 },
      ],
    };
    render(<EnvDiffView diff={diff} maskValues />);
    const hunks = screen.getAllByTestId('env-diff-hunk');
    expect(hunks[0]?.textContent).toContain('SECRET=••••••••');
    expect(hunks[1]?.textContent).toContain('SECRET=••••••••');
    expect(hunks[0]?.textContent).not.toContain('verysecret');
    expect(hunks[1]?.textContent).not.toContain('evenmoresecret');
  });
});

describe('maskValueInHunk', () => {
  it('replaces value with dots in KEY=VALUE lines', () => {
    expect(maskValueInHunk('FOO=bar')).toBe('FOO=••••••••');
    expect(maskValueInHunk('LONG_KEY=very-long-value-with-stuff')).toBe('LONG_KEY=••••••••');
  });

  it('leaves non-entry lines unchanged', () => {
    expect(maskValueInHunk('--- l')).toBe('--- l');
    expect(maskValueInHunk('  # a comment')).toBe('  # a comment');
    expect(maskValueInHunk('')).toBe('');
  });
});
