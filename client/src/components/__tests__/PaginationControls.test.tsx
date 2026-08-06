import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PaginationControls from '../../pages/project-detail/components/PaginationControls';

describe('PaginationControls Component', () => {
  it('does not render when pageCount <= 1', () => {
    const { container } = render(<PaginationControls page={1} pageCount={1} onChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders page buttons and triggers onChange when clicked', () => {
    const handleChange = vi.fn();
    render(<PaginationControls page={1} pageCount={5} onChange={handleChange} />);

    expect(screen.getByText('1')).toHaveClass('active');
    expect(screen.getByText('2')).not.toHaveClass('active');

    // Click page 2
    fireEvent.click(screen.getByText('2'));
    expect(handleChange).toHaveBeenCalledWith(2);

    // Click Next button
    fireEvent.click(screen.getByText('Sau ›'));
    expect(handleChange).toHaveBeenCalledWith(2);
  });

  it('disables previous button on first page', () => {
    render(<PaginationControls page={1} pageCount={5} onChange={vi.fn()} />);
    const prevButton = screen.getByText('‹ Trước');
    expect(prevButton).toBeDisabled();
  });

  it('disables next button on last page', () => {
    render(<PaginationControls page={5} pageCount={5} onChange={vi.fn()} />);
    const nextButton = screen.getByText('Sau ›');
    expect(nextButton).toBeDisabled();
  });
});
