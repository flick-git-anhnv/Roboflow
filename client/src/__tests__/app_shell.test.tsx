import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

describe('App Shell & Routing Infrastructure', () => {
  it('renders login page on default route when unauthenticated', async () => {
    localStorage.clear();
    sessionStorage.clear();

    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText(/KZTEK Labeling Studio/i)).toBeInTheDocument();
  });
});
