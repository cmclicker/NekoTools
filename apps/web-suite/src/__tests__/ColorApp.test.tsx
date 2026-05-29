import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ColorApp } from '../ColorApp.js';

describe('ColorApp', () => {
  it('renders swatches with normalized hex + contrast', () => {
    render(<ColorApp initialInput={'red\nrgb(0, 0, 255)'} />);
    expect(screen.getByTestId('color-stat-count').textContent).toBe('2');
    expect(screen.getByTestId('color-hex-0').textContent).toBe('#ff0000');
    expect(screen.getByTestId('color-hex-1').textContent).toBe('#0000ff');
  });

  it('marks an unrecognized color invalid + emits parse_error', () => {
    render(<ColorApp initialInput={'notacolor'} />);
    expect(screen.getByTestId('color-invalid-0')).toBeInTheDocument();
    expect(screen.getByText(/color\.parse_error/)).toBeInTheDocument();
  });

  it('converts hex list view', () => {
    render(<ColorApp initialInput={'red\nblue'} initialUiState={{ viewMode: 'normalized' }} />);
    expect(screen.getByTestId('color-output').textContent).toBe('#ff0000\n#0000ff');
  });

  it('shows the empty-state for whitespace-only input', () => {
    render(<ColorApp initialInput={'   '} />);
    expect(screen.getByTestId('color-no-document')).toBeInTheDocument();
    expect(screen.getByText(/color\.empty_input/)).toBeInTheDocument();
  });

  it('copies the JSON view via the injected clipboard', async () => {
    const writes: string[] = [];
    render(
      <ColorApp
        initialInput={'#ffffff'}
        initialUiState={{ viewMode: 'json' }}
        clipboardDeps={{ apiWrite: async (t) => { writes.push(t); } }}
      />,
    );
    fireEvent.click(screen.getByTestId('color-copy-output'));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(JSON.parse(writes[0] ?? '{}').colors[0].hex).toBe('#ffffff');
  });
});
