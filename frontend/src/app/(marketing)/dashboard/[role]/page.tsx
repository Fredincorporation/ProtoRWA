import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getProjects } from '@/lib/data/catalogue';
import {
  DASHBOARD_ROLES,
  isDashboardRole,
  roleMeta,
} from '@/lib/dashboard';

export const revalidate = 20;

interface PageProps {
  params: Promise<{ role: string }>;
}

export function generateStaticParams() {
  return DASHBOARD_ROLES.map((role) => ({ role }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { role } = await params;
  if (!isDashboardRole(role)) return { title: 'Dashboard' };
  const meta = roleMeta[role];
  return {
    title: meta.title,
    description: meta.tagline,
  };
}

/**
 * Per-role mission-control dashboard.
 *
 * One route backs all three personas (`/dashboard/investor|founder|admin`). The
 * route is a server component that reads the merged live + demonstration project
 * catalogue, then hands it to `DashboardShell`, which personalises the action
 * queue against the connected wallet on the client. Switching persona in the
 * header lands here for that role.
 */
export default async function DashboardPage({ params }: PageProps) {
  const { role } = await params;
  if (!isDashboardRole(role)) notFound();

  const projects = await getProjects();

  return <DashboardShell role={role} projects={projects} />;
}
