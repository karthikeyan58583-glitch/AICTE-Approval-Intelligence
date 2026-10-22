import { isRouteAllowedForRole, getNavItemsForRole, ROUTE_PERMISSIONS } from './roles';
import { AppRole } from '@/types/auth';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

assert(Boolean(ROUTE_PERMISSIONS), 'ROUTE_PERMISSIONS must be defined');

console.log('Testing Frontend Role Authorization Logic...');

// 1. Overview, Applications, and Documents must be accessible to all 5 roles
const allRoles: AppRole[] = [
  'applicant_institution_representative',
  'regional_scrutiny_officer',
  'evc_evaluator',
  'shc_member',
  'aicte_executive_admin',
];

for (const role of allRoles) {
  assert(isRouteAllowedForRole('/', role), `${role} should be allowed on /`);
  assert(isRouteAllowedForRole('/applications', role), `${role} should be allowed on /applications`);
  assert(isRouteAllowedForRole('/documents', role), `${role} should be allowed on /documents`);
}

// 2. /admin must ONLY be accessible to aicte_executive_admin
assert(isRouteAllowedForRole('/admin', 'aicte_executive_admin'), 'Admin must access /admin');
assert(!isRouteAllowedForRole('/admin', 'applicant_institution_representative'), 'Applicant cannot access /admin');
assert(!isRouteAllowedForRole('/admin', 'regional_scrutiny_officer'), 'Scrutiny officer cannot access /admin');
assert(!isRouteAllowedForRole('/admin', 'evc_evaluator'), 'EVC evaluator cannot access /admin');
assert(!isRouteAllowedForRole('/admin', 'shc_member'), 'SHC member cannot access /admin');

// 3. /bottlenecks must be accessible to scrutiny officer and admin only
assert(isRouteAllowedForRole('/bottlenecks', 'regional_scrutiny_officer'), 'Scrutiny officer can access /bottlenecks');
assert(isRouteAllowedForRole('/bottlenecks', 'aicte_executive_admin'), 'Admin can access /bottlenecks');
assert(!isRouteAllowedForRole('/bottlenecks', 'applicant_institution_representative'), 'Applicant cannot access /bottlenecks');
assert(!isRouteAllowedForRole('/bottlenecks', 'evc_evaluator'), 'EVC cannot access /bottlenecks');
assert(!isRouteAllowedForRole('/bottlenecks', 'shc_member'), 'SHC cannot access /bottlenecks');

// 4. getNavItemsForRole item counts verification
const applicantNav = getNavItemsForRole('applicant_institution_representative');
assert(applicantNav.some((i) => i.href === '/'), 'Applicant nav has overview');
assert(applicantNav.some((i) => i.href === '/applications'), 'Applicant nav has applications');
assert(applicantNav.some((i) => i.href === '/documents'), 'Applicant nav has documents');
assert(applicantNav.some((i) => i.href === '/alerts'), 'Applicant nav has alerts');
assert(!applicantNav.some((i) => i.href === '/admin'), 'Applicant nav must NOT have /admin');
assert(!applicantNav.some((i) => i.href === '/bottlenecks'), 'Applicant nav must NOT have /bottlenecks');

const adminNav = getNavItemsForRole('aicte_executive_admin');
assert(adminNav.length === 8, `Admin nav must have all 8 items, got: ${adminNav.length}`);

console.log('ALL FRONTEND ROLE AUTHORIZATION TESTS PASSED SUCCESSFULLY!');
