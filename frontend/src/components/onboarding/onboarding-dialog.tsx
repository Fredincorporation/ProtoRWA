'use client';

import * as React from 'react';
import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { dashboardPathFor } from '@/lib/dashboard';
import { useOperatorAccess } from '@/lib/data/useOperatorAccess';
import { cn } from '@/lib/utils';

export type UserRole = 'investor' | 'founder' | 'admin';

/**
 * Addresses recognised as protocol operators by the offline fallback.
 *
 * This is a demo allowlist only. The authoritative gate is on-chain: whether the
 * connected wallet holds `ORACLE_ROLE` on the deployed escrow (see
 * `useOperatorAccess`). The allowlist exists so the admin persona still resolves
 * when the reader is unreachable (wrong network, cold RPC), but it never
 * overrides a settled on-chain read that grants the role.
 *
 * The `admin` persona is offered in the chooser only to a wallet that resolves as
 * an operator (`isOperator`). It grants access to the oversight terminal, where
 * privileged actions move other people's capital, so it is never a button a random
 * visitor can press - the on-chain role, not a menu pick, is what unlocks it.
 */
const OPERATOR_ADDRESSES = new Set(['0x9c3d4e5f60718293a4b5c6d7e8f901a2b3c4d5e6']);

/**
 * Whether a connected address is on the offline operator allowlist.
 *
 * Kept as a pure function (no hooks) so the restore effect below can use it
 * without a contract read. The real gate combines this with an on-chain
 * `hasRole(ORACLE_ROLE, address)` check in the provider.
 */
export function isAdminAddress(address?: string): boolean {
  return Boolean(address && OPERATOR_ADDRESSES.has(address.toLowerCase()));
}

interface OnboardingContextType {
  role: UserRole;
  /** Switches persona. Admin requires the connected address to be an operator. */
  setRole: (role: UserRole) => void;
  /** True once the user has chosen a persona for this browser. */
  hasCompletedOnboarding: boolean;
  /** True while the first-connect chooser is asking for a persona. */
  isChoosingRole: boolean;
  /** Whether the connected address may use the admin persona. */
  isOperator: boolean;
  openOnboarding: () => void;
  closeOnboarding: () => void;
}

const OnboardingContext = React.createContext<OnboardingContextType>({
  role: 'investor',
  setRole: () => {},
  hasCompletedOnboarding: false,
  isChoosingRole: false,
  isOperator: false,
  openOnboarding: () => {},
  closeOnboarding: () => {},
});

export function useOnboarding() {
  return React.useContext(OnboardingContext);
}

const ROLE_STORAGE_KEY = 'protorwa_user_role';
const ONBOARDED_STORAGE_KEY = 'protorwa_onboarded';

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { isConnected, address } = useAccount();
  const router = useRouter();
  const { canOracle } = useOperatorAccess(address);

  const [role, setRoleState] = React.useState<UserRole>('investor');
  const [isOpen, setIsOpen] = React.useState(false);
  const [hasCompleted, setHasCompleted] = React.useState(false);
  /** Guards against flashing the chooser before storage has been read. */
  const [hydrated, setHydrated] = React.useState(false);

  /**
   * Operator status is the on-chain role, with the allowlist as an offline
   * fallback. A wallet holding ORACLE_ROLE on the deployment reaches the admin
   * persona even though it is not in the demo allowlist; a wallet the chain
   * rejects does not, no matter what the UI once stored.
   */
  const isOperator = isAdminAddress(address) || canOracle.granted;

  /**
   * Restore the stored persona.
   *
   * `hydrated` is set in the same pass so the first-connect effect below cannot
   * fire against the default role and immediately reopen a dialog the user has
   * already dismissed. An admin persona is not downgraded here - that is decided
   * by the on-chain read once it settles (effect after this one), so a saved
   * admin session is not lost just because the reader has not responded yet.
   */
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedRole = window.localStorage.getItem(ROLE_STORAGE_KEY) as UserRole | null;
    const completed = window.localStorage.getItem(ONBOARDED_STORAGE_KEY) === 'true';

    if (savedRole === 'investor' || savedRole === 'founder' || savedRole === 'admin') {
      setRoleState(savedRole);
    }
    if (completed) setHasCompleted(true);
    setHydrated(true);
  }, [address]);

  /**
   * Revert an admin persona only once the on-chain read has settled and denied
   * the role, so the terminal is never reachable on a false premise nor lost on
   * an unresolved one.
   */
  React.useEffect(() => {
    if (!hydrated) return;
    if (role === 'admin' && !isOperator && !canOracle.checking) {
      setRoleState('investor');
    }
  }, [hydrated, role, isOperator, canOracle.checking]);

  /**
   * Open the chooser on first connect only. An existing user is not interrupted
   * on every reconnect; they change persona deliberately from the header.
   */
  React.useEffect(() => {
    if (!hydrated) return;
    if (isConnected && !hasCompleted) setIsOpen(true);
    if (!isConnected) setIsOpen(false);
  }, [isConnected, hasCompleted, hydrated]);

  const selectRole = React.useCallback(
    (newRole: UserRole) => {
      // Refuse an admin upgrade from the chooser for a non-operator address.
      if (newRole === 'admin' && !isOperator) return;

      setRoleState(newRole);
      setHasCompleted(true);
      setIsOpen(false);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(ROLE_STORAGE_KEY, newRole);
        window.localStorage.setItem(ONBOARDED_STORAGE_KEY, 'true');
      }

      // Choosing a persona lands the user on that role's mission-control
      // dashboard, where every action available to the persona is surfaced.
      router.push(dashboardPathFor(newRole));
    },
    [isOperator, router],
  );

  const value = React.useMemo(
    () => ({
      role,
      setRole: selectRole,
      hasCompletedOnboarding: hasCompleted,
      isChoosingRole: isOpen,
      isOperator,
      openOnboarding: () => setIsOpen(true),
      /**
       * Closing is only permitted once a persona exists. The first-connect
       * chooser is a decision, not a dismissible notice.
       */
      closeOnboarding: () => setIsOpen((open) => (hasCompleted ? false : open)),
    }),
    [role, selectRole, hasCompleted, isOpen, isOperator],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      {isOpen ? (
        <RoleChooser
          onSelect={selectRole}
          canDismiss={hasCompleted}
          canAdmin={isOperator}
          onDismiss={() => setIsOpen(false)}
        />
      ) : null}
    </OnboardingContext.Provider>
  );
}

interface RoleChooserProps {
  onSelect: (role: UserRole) => void;
  canDismiss: boolean;
  /** Whether the connected wallet is an operator allowed to enter the admin persona. */
  canAdmin: boolean;
  onDismiss: () => void;
}

/**
 * First-connect persona chooser.
 *
 * Backer and Founder are always offered. The Protocol Operator persona appears
 * only for a wallet that the on-chain read grants ORACLE_ROLE to (`canAdmin`) -
 * it is not a button any visitor can click, so entering oversight of other
 * people's capital still requires the role, but a genuine operator is no longer
 * left with no way to select it.
 *
 * Dismissal is conditional: on first connect the user must pick one, because the
 * choice is what grants navigation. When reopened later from the header, it can
 * be closed without changing anything.
 */
function RoleChooser({ onSelect, canDismiss, canAdmin, onDismiss }: RoleChooserProps) {
  const [selected, setSelected] = React.useState<UserRole | null>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  /** Escape dismisses, but only once the user already has a persona. */
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && canDismiss) onDismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canDismiss, onDismiss]);

  /** Move focus into the dialog so keyboard users are not left behind it. */
  React.useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const personas: Array<{
    id: UserRole;
    title: string;
    tagline: string;
    icon: string;
    accent: 'primary' | 'secondary' | 'tertiary';
    unlocks: string[];
  }> = [
    {
      id: 'investor',
      title: 'Backer & Investor',
      tagline: 'Fund hardware builds, vote on milestones, trade claims.',
      icon: 'account_balance_wallet',
      accent: 'primary',
      unlocks: [
        'Commit USDG and receive claim units',
        'Vote on milestone tranches before capital releases',
        'Buy and list claims on the secondary market',
        'Audit and tax ledger for every position',
      ],
    },
    {
      id: 'founder',
      title: 'Hardware Founder',
      tagline: 'Raise against production milestones and prove delivery.',
      icon: 'precision_manufacturing',
      accent: 'secondary',
      unlocks: [
        'Create a project and open a funding round',
        'Submit BOM, QA and metrology evidence per milestone',
        'Unlock escrowed tranches as backers approve them',
        'Fleet control over hardware and oracle attestations',
      ],
    },
  ];

  if (canAdmin) {
    personas.push({
      id: 'admin',
      title: 'Protocol Operator',
      tagline: 'Oracle oversight: escalate, resolve and settle milestone reviews.',
      icon: 'shield',
      accent: 'tertiary',
      unlocks: [
        'Escalate a milestone review and resolve it directly',
        'Transition a project lifecycle status on the registry',
        'Monitor disputes and refundable escrows',
        'Granted because this wallet holds ORACLE_ROLE on-chain',
      ],
    });
  }

  const accentClasses: Record<
    'primary' | 'secondary' | 'tertiary',
    { border: string; tile: string; check: string }
  > = {
    primary: {
      border: 'border-primary',
      tile: 'bg-primary/10 text-primary',
      check: 'text-primary',
    },
    secondary: {
      border: 'border-secondary',
      tile: 'bg-secondary/10 text-secondary',
      check: 'text-secondary',
    },
    tertiary: {
      border: 'border-tertiary',
      tile: 'bg-tertiary/10 text-tertiary',
      check: 'text-tertiary',
    },
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-chooser-title"
      aria-describedby="role-chooser-desc"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col gap-space-md overflow-y-auto rounded-xl border-outline-variant/40 bg-surface-container-low p-space-lg shadow-2xl focus:outline-none"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
        />

        <div className="flex items-start justify-between gap-space-sm">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            <span className="font-mono text-label-sm font-bold uppercase tracking-widest text-primary">
              {canDismiss ? 'Switch persona' : 'Welcome to ProtoRWA'}
            </span>
          </div>
          {canDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close"
              className="rounded p-1 text-outline transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              <Icon name="close" size={18} />
            </button>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <h2
            id="role-chooser-title"
            className="font-display text-headline-md font-bold text-on-surface"
          >
            {canDismiss ? 'Change how you use the protocol' : 'How will you use ProtoRWA?'}
          </h2>
          <p id="role-chooser-desc" className="max-w-prose text-body-md text-on-surface-variant">
            {canDismiss
              ? 'Switching persona changes the navigation, the actions you can reach, and which dashboards are yours.'
              : 'Your choice sets which parts of the protocol you can reach. You can change it later from the persona control in the header.'}
          </p>
        </div>

        <div
          className={cn(
            'grid grid-cols-1 gap-space-sm pt-space-xs sm:grid-cols-2',
            canAdmin && 'lg:grid-cols-3',
          )}
        >
          {personas.map((persona) => {
            const isSelected = selected === persona.id;
            const accent = accentClasses[persona.accent];
            return (
              <button
                key={persona.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelected(persona.id)}
                className={cn(
                  'flex flex-col rounded-lg border p-space-md text-left transition-all',
                  isSelected
                    ? cn(accent.border, 'bg-surface-container-high shadow-md')
                    : 'border-outline-variant/30 bg-surface-container hover:border-outline-variant hover:bg-surface-container-high',
                )}
              >
                <div
                  className={cn(
                    'mb-space-sm flex h-10 w-10 items-center justify-center rounded-lg',
                    accent.tile,
                  )}
                >
                  <Icon name={persona.icon} size={22} />
                </div>

                <h3 className="font-display text-headline-sm font-bold text-on-surface">
                  {persona.title}
                </h3>
                <p className="mt-1 text-body-sm text-on-surface-variant">{persona.tagline}</p>

                <ul className="mt-space-sm flex-col gap-1">
                  {persona.unlocks.map((item) => (
                    <li key={item} className="flex items-start gap-1.5">
                      <Icon
                        name="check_circle"
                        size={13}
                        className={cn('mt-0.5 shrink-0', accent.check)}
                      />
                      <span className="font-body-sm text-on-surface-variant">{item}</span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {/*
          When the wallet is not an operator, oversight stays non-selectable: it
          moves other people's capital and is gated on the connected address, not
          offered as a choice. When it IS an operator, the persona appears above.
        */}
        {!canAdmin ? (
          <p className="flex items-start gap-1.5 border-t border-outline-variant/20 pt-space-sm font-mono text-label-sm text-outline">
            <Icon name="lock" size={12} className="mt-0.5 shrink-0" />
            <span>
              Protocol administration is not selectable here. Oversight access is
              granted to operator wallets that hold ORACLE_ROLE on the deployment,
              not chosen from a menu.
            </span>
          </p>
        ) : (
          <p className="flex items-start gap-1.5 border-t border-outline-variant/20 pt-space-sm font-mono text-label-sm text-tertiary">
            <Icon name="verified_user" size={12} className="mt-0.5 shrink-0" />
            <span>
              This wallet holds ORACLE_ROLE on the deployment, so the Protocol
              Operator persona is available. Oversight actions move real escrowed
              capital - act accordingly.
            </span>
          </p>
        )}

        <button
          type="button"
          disabled={selected === null}
          onClick={() => selected && onSelect(selected)}
          className={cn(
            'w-full rounded px-space-md py-3 font-mono text-label-lg font-semibold uppercase tracking-wider transition-colors',
            selected === null
              ? 'cursor-not-allowed border-dashed border-outline-variant/50 bg-surface-container-lowest text-outline'
              : 'bg-primary-container text-on-primary-container shadow-[0_0_0_1px_rgba(78,222,163,0.25)] hover:bg-primary',
          )}
        >
          {selected === null
            ? 'Choose a persona to continue'
            : `Continue as ${personas.find((p) => p.id === selected)?.title ?? selected}`}
        </button>
      </div>
    </div>
  );
}
