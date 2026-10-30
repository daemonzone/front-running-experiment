import Link from 'next/link';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Do registrars register names after you search for them? — an experiment',
  description:
    'An independent, open-data experiment testing whether domain registrars register names that were searched on their sites.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>
          <nav>
            <Link href="/">Results</Link> <Link href="/about">About</Link> <Link href="/method">Method</Link>{' '}
            <Link href="/example-report">Example report</Link>
          </nav>
          {children}
          <footer className="muted">
            An independent experiment, not an accusation. See <Link href="/method">Method</Link> and{' '}
            <Link href="/about">About</Link>.
          </footer>
        </main>
      </body>
    </html>
  );
}
