import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Button } from '../components/Button';
import { StatusPill } from '../components/StatusPill';

describe('Button component', () => {
  it('renders children with appropriate classes', () => {
    render(<Button>Send Clipboard</Button>);
    expect(screen.getByRole('button', { name: /send clipboard/i })).toBeInTheDocument();
  });

  it('renders loading indicator when loading', () => {
    render(<Button loading>Processing</Button>);
    const btn = screen.getByRole('button', { name: /processing/i });
    expect(btn).toBeDisabled();
  });
});

describe('StatusPill component', () => {
  it('renders connected status badge', () => {
    render(<StatusPill status="connected" />);
    expect(screen.getByText(/connected/i)).toBeInTheDocument();
  });

  it('renders pairing status badge', () => {
    render(<StatusPill status="pairing" />);
    expect(screen.getByText(/pairing/i)).toBeInTheDocument();
  });
});
