import Link from 'next/link';
import { PageHeader } from '../components/ui';

export default function NotFound() {
  return (
    <>
      <PageHeader
        kicker="404"
        title="Not in the index"
        lede="That page does not exist, or the domain you asked for has not been measured."
      />
      <ul className="space-y-2">
        <li>
          <Link href="/" className="text-accent underline underline-offset-4">
            The index homepage
          </Link>
        </li>
        <li>
          <Link href="/leaderboard" className="text-accent underline underline-offset-4">
            Browse the leaderboard
          </Link>
        </li>
        <li>
          <Link href="/bots" className="text-accent underline underline-offset-4">
            See which crawlers are tracked
          </Link>
        </li>
      </ul>
    </>
  );
}
