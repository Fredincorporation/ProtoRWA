import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

/**
 * Marketing shell: fixed header (80px) + main + footer.
 *
 * `pt-20` compensates for the fixed header, matching the source design.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="w-full flex-1 pt-20">{children}</main>
      <SiteFooter />
    </div>
  );
}
