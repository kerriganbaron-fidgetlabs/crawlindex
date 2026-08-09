import type { Metadata } from 'next';
import { CohortIndex } from '../../components/cohort';

export const metadata: Metadata = {
  title: 'AI readiness by publishing platform',
  description:
    'Do WordPress sites block AI crawlers more than Shopify stores? Blocking rates and agent readiness scores grouped by the platform each site is built on.',
  alternates: { canonical: '/platforms' },
};

export default function PlatformsPage() {
  return (
    <CohortIndex
      kind="platform"
      kicker="Cross-tab"
      title="AI readiness by publishing platform"
      lede="What a site is built on shapes how legible it is to an agent, and often decides its crawler policy by default. Grouped from platform fingerprints detected on the homepage."
      note="Platforms are identified from response headers and markup, never guessed. An unrecognised stack is excluded rather than labelled."
    />
  );
}
