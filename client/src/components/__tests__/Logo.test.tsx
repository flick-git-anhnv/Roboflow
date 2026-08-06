import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Logo from '../Logo';

describe('Logo Component', () => {
  it('renders SVG element with default size', () => {
    const { container } = render(<Logo />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('width')).toBe('28');
    expect(svg?.getAttribute('height')).toBe('28');
  });

  it('renders SVG element with custom size', () => {
    const { container } = render(<Logo size={48} className="custom-logo" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('width')).toBe('48');
    expect(svg?.getAttribute('height')).toBe('48');
    expect(svg?.classList.contains('custom-logo')).toBe(true);
  });
});
