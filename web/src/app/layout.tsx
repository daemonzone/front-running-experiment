import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'FrontRunning experiment',
  description: 'Do domain registrars register names that were searched on their site?',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
