import type { Metadata } from 'next';
import { CohortIndex } from '../../components/cohort';

export const metadata: Metadata = {
  title: 'Does your CDN decide your AI policy?',
  description:
    'AI crawler blocking rates grouped by edge network. Most operators never chose a policy on AI crawlers; their CDN shipped one by default and they inherited it.',
  alternates: { canonical: '/networks' },
};

export default function NetworksPage() {
  return (
    <CohortIndex
      kind="network"
      kicker="Cross-tab"
      title="Does your CDN decide your AI policy?"
      lede="Most operators never sat down and formed a view on AI crawlers. Their edge network shipped a default and they inherited it. Grouped from response headers, which are far harder to misread than markup."
      note="Networks are identified from response headers only."
    />
  );
}
