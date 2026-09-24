import { MarketOverview } from '@/components/market/market-overview';
import { getProjects } from '@/lib/data/catalogue';

/**
 * Secondary claims market landing (/market).
 *
 * Thin server wrapper: resolves the unified catalogue (curated showcase + any
 * live on-chain commitments) and hands it to the client overview. Keeping the
 * read on the server means published projects surface without a client fetch
 * waterfall, and the overview stays a pure presentation component.
 *
 * Revalidated on a 20s cadence to match the chain reader's cache; the overview
 * itself reads live books per asset on the terminal, not here.
 */
export const revalidate = 20;

export default async function MarketPage() {
  const projects = await getProjects();
  return <MarketOverview projects={projects} />;
}
