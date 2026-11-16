import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.URL.createObjectURL and revokeObjectURL for tests
if (typeof window !== 'undefined') {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  window.URL.revokeObjectURL = vi.fn();
}
