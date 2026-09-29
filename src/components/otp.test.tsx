import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OtpInput from './ui/OtpInput';

function Harness({ initial = '', onComplete }: { initial?: string; onComplete?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <OtpInput value={value} onChange={setValue} onComplete={onComplete} autoFocus={false} />
      <output data-testid="value">{value}</output>
    </>
  );
}

const cells = () => screen.getAllByRole('textbox') as HTMLInputElement[];
const current = () => screen.getByTestId('value').textContent;

describe('OtpInput', () => {
  it('fills as you type and reports completion', () => {
    const done = vi.fn();
    render(<Harness onComplete={done} />);
    '123456'.split('').forEach((digit, i) => fireEvent.change(cells()[i], { target: { value: digit } }));
    expect(current()).toBe('123456');
    expect(done).toHaveBeenCalledWith('123456');
  });

  it('typing over a filled cell replaces the digit instead of shifting the rest', () => {
    render(<Harness initial="123456" />);
    // The browser reports the old digit plus the new one: "3" + "9".
    fireEvent.change(cells()[2], { target: { value: '39' } });
    expect(current()).toBe('129456');
  });

  it('typing before the old digit also replaces it', () => {
    render(<Harness initial="123456" />);
    fireEvent.change(cells()[2], { target: { value: '93' } });
    expect(current()).toBe('129456');
  });

  it('accepts a pasted code and ignores non-digits', () => {
    const done = vi.fn();
    render(<Harness onComplete={done} />);
    fireEvent.paste(cells()[0], { clipboardData: { getData: () => ' 482-913 ' } });
    expect(current()).toBe('482913');
    expect(done).toHaveBeenCalledWith('482913');
  });

  it('accepts a full code autofilled into the first cell', () => {
    render(<Harness />);
    fireEvent.change(cells()[0], { target: { value: '654321' } });
    expect(current()).toBe('654321');
  });

  it('deleting a digit closes the gap', () => {
    render(<Harness initial="123456" />);
    fireEvent.change(cells()[1], { target: { value: '' } });
    expect(current()).toBe('13456');
  });
});
