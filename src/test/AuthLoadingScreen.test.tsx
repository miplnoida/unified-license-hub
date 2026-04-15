import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthLoadingScreen } from '@/components/shared/AuthLoadingScreen';

describe('AuthLoadingScreen', () => {
  it('renders skeleton elements without crashing', () => {
    const { container } = render(<AuthLoadingScreen />);
    // Should render multiple skeleton placeholders
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
