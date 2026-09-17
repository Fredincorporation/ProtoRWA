'use client';

import * as React from 'react';
import { useAccount } from 'wagmi';
import { InvestFlow } from '@/components/project/invest-flow';
import type { Project } from '@protorwa/shared';

export function InvestClientWrapper({ project, deployed }: { project: Project; deployed: boolean }) {
  const { isConnected } = useAccount();

  return <InvestFlow project={project} connected={isConnected} deployed={deployed} />;
}

