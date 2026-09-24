import type { Metadata } from 'next';

import { NotificationsView } from '@/components/notifications/notifications-view';
import { getProjects } from '@/lib/data/catalogue';
import { buildAlerts } from '@/lib/notifications';

export const revalidate = 20;

export const metadata: Metadata = {
  title: 'Notifications · ProtoRWA',
  description:
    'Real-time alerts for milestone votes, tranche releases, disputes and refunds, derived from on-chain escrow state.',
};

/**
 * Server half of the alert stream. It reads the same catalogue every other page
 * uses (mock showcase + live chain projects) and derives the alerts from their
 * actual escrow state, then hands the serialized rows to the interactive client
 * view. There is no notification daemon behind this and the screen no longer
 * pretends there is.
 */
export default async function NotificationsPage() {
  const projects = await getProjects();
  const alerts = buildAlerts(projects);
  return <NotificationsView alerts={alerts} />;
}
