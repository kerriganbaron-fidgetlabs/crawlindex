import type { Metadata } from 'next';
import { CohortIndex } from '../../components/cohort';

export const metadata: Metadata = {
  title: 'AI crawler blocking by top-level domain',
  description:
    'How AI crawler policy differs across top-level domains. Blocking rates and agent readiness scores grouped by TLD, a rough but useful proxy for jurisdiction.',
  alternates: { canonical: '/tlds' },
};

export default function TldsPage() {
  return (
    <CohortIndex
      kind="tld"
      kicker="Cross-tab"
      title="AI crawler blocking by top-level domain"
      lede="A rough proxy for jurisdiction and market. It is not a clean one, since anyone anywhere can register a .com, but the differences between country TLDs are large enough to be worth looking at."
      note="TLD is not nationality. Treat it as a weak signal about where an operator sits, not a strong one."
    />
  );
}
