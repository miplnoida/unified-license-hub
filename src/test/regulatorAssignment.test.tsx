import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { EmployeeCombobox, type EmployeeOption } from '@/components/entity-detail/EmployeeCombobox';

// Radix Popover uses portals + pointer events; jsdom needs these polyfills.
if (!(Element.prototype as any).hasPointerCapture) {
  (Element.prototype as any).hasPointerCapture = () => false;
}
if (!(Element.prototype as any).scrollIntoView) {
  (Element.prototype as any).scrollIntoView = () => {};
}
if (!(Element.prototype as any).releasePointerCapture) {
  (Element.prototype as any).releasePointerCapture = () => {};
}

const options: EmployeeOption[] = [
  { id: 'u1', label: 'Alice Analyst', sublabel: 'alice@x.io' },
  { id: 'u2', label: 'Bob Officer', sublabel: 'bob@x.io' },
  { id: 'u3', label: 'Carla Supervisor', sublabel: 'carla@x.io' },
];

describe('EmployeeCombobox', () => {
  it('filters options by search input', () => {
    render(<EmployeeCombobox value={null} options={options} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('combobox'));
    const input = screen.getByPlaceholderText('Search employees...');
    fireEvent.change(input, { target: { value: 'carla' } });
    expect(screen.getByText('Carla Supervisor')).toBeInTheDocument();
    expect(screen.queryByText('Alice Analyst')).not.toBeInTheDocument();
    expect(screen.queryByText('Bob Officer')).not.toBeInTheDocument();
  });

  it('disables options that are already assigned elsewhere', () => {
    render(
      <EmployeeCombobox
        value={null}
        options={options}
        disabledIds={new Set(['u2'])}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('combobox'));
    // The disabled item renders an "Assigned" badge.
    const bobRow = screen.getByText('Bob Officer').closest('[role="option"]') as HTMLElement;
    expect(bobRow).not.toBeNull();
    expect(within(bobRow!).getByText(/assigned/i)).toBeInTheDocument();
    expect(bobRow!.getAttribute('aria-disabled')).toBe('true');
  });

  it('selecting an employee invokes onChange with their id', () => {
    const onChange = vi.fn();
    render(<EmployeeCombobox value={null} options={options} onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Alice Analyst'));
    expect(onChange).toHaveBeenCalledWith('u1');
  });

  it('clearing via the X button emits null', () => {
    const onChange = vi.fn();
    render(<EmployeeCombobox value="u1" options={options} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Clear selection'));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
