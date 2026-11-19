import { render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  // 測試時沒有後端，假裝 fetch 都回傳空資料。
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  );
});

test('畫面上有訊息輸入框', () => {
  render(<App />);
  expect(screen.getByRole('textbox')).toBeInTheDocument();
});
