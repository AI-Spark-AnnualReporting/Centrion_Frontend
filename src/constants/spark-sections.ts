// The three Spark sections, named once. The overview renders a stat card per
// entry, the sidebar renders a nav child, and /spark/:section validates its
// param against these keys and takes its heading from the same place — so a
// title can't say one thing in the sidebar and another on the page it opens.

export type SectionKey = 'companies' | 'reports' | 'users';

export const SECTION_KEYS: SectionKey[] = ['companies', 'reports', 'users'];

export const SECTIONS: Record<
  SectionKey,
  { title: string; cardHint: string; listTitle: string; unit: string }
> = {
  companies: {
    title: 'Companies',
    cardHint: 'Tenants on the platform',
    listTitle: 'All companies',
    unit: 'company',
  },
  reports: {
    title: 'Reports',
    cardHint: 'Across every company',
    listTitle: 'Reports by company',
    unit: 'report',
  },
  users: {
    title: 'Users',
    cardHint: 'Across every company',
    listTitle: 'Users by company',
    unit: 'user',
  },
};

export const isSectionKey = (v?: string): v is SectionKey =>
  !!v && (SECTION_KEYS as string[]).includes(v);
