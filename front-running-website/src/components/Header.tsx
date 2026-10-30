import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

const links = [
  ['/', 'Results'],
  ['/generation', 'Generation'],
  ['/domains', 'Names'],
  ['/method', 'Method'],
  ['/about', 'About'],
  ['/example-report', 'Example report'],
] as const;

export function Header() {
  return (
    <header className="site-header">
      <div className="wrap header-row">
        <Link href="/" className="brand" aria-label="FrontRunning — home">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
            <rect width="32" height="32" rx="8" fill="var(--ink)" />
            <circle cx="14" cy="14" r="6" fill="none" stroke="var(--surface)" strokeWidth="2.5" />
            <path d="M18.5 18.5 25 25" stroke="var(--surface)" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="14" cy="14" r="2" fill="var(--s2)" />
          </svg>
          <span>FrontRunning</span>
        </Link>
        <nav aria-label="Main">
          {links.map(([href, label]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
