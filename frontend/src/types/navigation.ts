export interface NavItem {
  name: string;
  href: string;
  iconName: string;
  badge?: string;
  badgeVariant?: 'default' | 'warning' | 'info' | 'neutral';
  description: string;
  moduleTarget: string;
}

export interface UserProfile {
  name: string;
  email: string;
  role: string;
  office: string;
  avatarUrl?: string;
}
