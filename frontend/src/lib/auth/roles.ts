import { AppRole, RoleMetadata } from '@/types/auth';
import { NavItem } from '@/types/navigation';
import { NAVIGATION_ITEMS } from '@/lib/mock-data';

export const ROLE_METADATA: Record<AppRole, RoleMetadata> = {
  applicant_institution_representative: {
    title: 'Institution Representative (Applicant)',
    badgeLabel: 'Applicant Representative',
    colorClass: 'bg-teal-50 text-teal-800 border-teal-200',
    description: 'Authorized to file applications, rectify deficiencies, and inspect review status.',
    defaultRedirectPath: '/',
  },
  regional_scrutiny_officer: {
    title: 'Regional Scrutiny Officer',
    badgeLabel: 'Scrutiny Officer',
    colorClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    description: 'Authorized to evaluate institutional filings, flag deficiencies, and review bottleneck telemetry.',
    defaultRedirectPath: '/',
  },
  evc_evaluator: {
    title: 'Expert Visiting Committee (EVC) Evaluator',
    badgeLabel: 'EVC Evaluator',
    colorClass: 'bg-sky-50 text-sky-800 border-sky-200',
    description: 'Authorized for infrastructure inspections, facility evaluations, and field verification.',
    defaultRedirectPath: '/',
  },
  shc_member: {
    title: 'Standing Hearing Committee (SHC) Member',
    badgeLabel: 'SHC Member',
    colorClass: 'bg-purple-50 text-purple-800 border-purple-200',
    description: 'Authorized to preside over institutional appeal hearings and review compliance disputes.',
    defaultRedirectPath: '/',
  },
  aicte_executive_admin: {
    title: 'AICTE Executive Administrator',
    badgeLabel: 'Executive Admin',
    colorClass: 'bg-amber-50 text-amber-900 border-amber-300',
    description: 'Full statutory governance, role delegation, approval handbook policy, and platform administration.',
    defaultRedirectPath: '/',
  },
};

/**
 * Route-level permission map defining which roles can access each application path.
 */
export const ROUTE_PERMISSIONS: Record<string, AppRole[]> = {
  '/': [
    'applicant_institution_representative',
    'regional_scrutiny_officer',
    'evc_evaluator',
    'shc_member',
    'aicte_executive_admin',
  ],
  '/applications': [
    'applicant_institution_representative',
    'regional_scrutiny_officer',
    'evc_evaluator',
    'shc_member',
    'aicte_executive_admin',
  ],
  '/documents': [
    'applicant_institution_representative',
    'regional_scrutiny_officer',
    'evc_evaluator',
    'shc_member',
    'aicte_executive_admin',
  ],
  '/bottlenecks': [
    'regional_scrutiny_officer',
    'aicte_executive_admin',
  ],
  '/compliance': [
    'regional_scrutiny_officer',
    'aicte_executive_admin',
  ],
  '/alerts': [
    'applicant_institution_representative',
    'regional_scrutiny_officer',
    'aicte_executive_admin',
  ],
  '/reports': [
    'regional_scrutiny_officer',
    'aicte_executive_admin',
  ],
  '/admin': [
    'aicte_executive_admin',
  ],
};

/**
 * Checks if a specific path is permitted for the given role.
 */
export function isRouteAllowedForRole(pathname: string, role: AppRole): boolean {
  // Normalize path (e.g. /applications/123 -> /applications)
  const normalizedPath = pathname === '/' ? '/' : `/${pathname.split('/')[1]}`;
  const allowedRoles = ROUTE_PERMISSIONS[normalizedPath];

  // If route is not explicitly mapped in permissions table, default to restricted admin
  if (!allowedRoles) {
    return role === 'aicte_executive_admin';
  }

  return allowedRoles.includes(role);
}

/**
 * Filters the standard navigation items for the user's active role.
 */
export function getNavItemsForRole(role: AppRole): NavItem[] {
  return NAVIGATION_ITEMS.filter((item) => isRouteAllowedForRole(item.href, role));
}
