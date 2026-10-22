'use client';

import React from 'react';
import { PlaceholderPage } from '@/components/ui/PlaceholderPage';

export default function AlertsPage() {
  return (
    <PlaceholderPage
      title="Proactive Alert Management Center"
      moduleBadge="Module 6: Alert Dispatcher"
      roadmapPhase="Roadmap Milestone 6"
      tagline="Multi-channel escalation rules, statutory deadline warnings, and officer notifications."
      description="The Alerts Module provides centralized alert management across all regional offices and applicant institutions. It enforces strict escalation ladders when deficiency resolution windows expire or when critical document discrepancies are identified during algorithmic scrutiny."
      plannedFeatures={[
        'Configurable escalation matrices (Warning ➔ Regional Scrutiny Officer ➔ Regional Director ➔ Member Secretary).',
        'Multi-channel dispatch pipeline supporting in-portal notifications, authenticated email advisories, and SMS.',
        'Urgent countdown alerts for deficiency rectification deadlines under Regulation 4(3).',
        'Officer workload alerts when unreviewed applications exceed regional threshold limits.',
        'Acknowledgment receipt tracking to ensure legal delivery of deficiency notices.',
        'Customizable subscription preferences based on officer role and regional jurisdiction.',
      ]}
    />
  );
}
