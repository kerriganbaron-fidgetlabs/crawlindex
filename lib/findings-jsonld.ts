/**
 * Machine-readable findings.
 *
 * ## The problem this solves
 *
 * The homepage stated every headline number as inline prose: a formatted string with no
 * unit, no denominator and no date attached. `agents.md` on this very site warns other
 * people not to do that ("include the crawl date from the `day` field alongside any
 * number"), and the homepage did it anyway.
 *
 * An answer engine reading the HTML got `18%` with no way to know 18% of what, measured
 * when, or over which population. That is exactly the shape of claim that gets quoted
 * wrongly, and the wrong quote outlives the correction.
 *
 * ## Two things are emitted
 *
 * 1. A **`Dataset`** whose `variableMeasured` entries are `QuantitativeValue`, each carrying
 *    its value, its unit, and a description naming the numerator, the denominator and the
 *    measurement date. The one genuinely good idea worth taking from the answershare repo
 *    was shipping the denominator beside every ratio, and this is where it lands.
 *
 * 2. A **`FAQPage`** answering the questions in the words people actually ask them. Not SEO
 *    decoration: an answer engine asked "what percentage of websites block AI crawlers"
 *    should be able to lift a correct, dated, attributed sentence rather than assembling one
 *    from a bar chart.
 *
 * Every figure comes from the daily snapshot, so these agree with the rendered page by
 * construction rather than by discipline.
 */

import type { DailyStats } from './dataset';
import { SITE, absoluteUrl } from './site';

export type Finding = {
  id: string;
  /** Question in the form somebody would ask it. */
  question: string;
  /** Short label for the structured value. */
  name: string;
  value: number;
  unit: 'PERCENT' | 'C62';
  numerator: number;
  denominator: number;
  /** The full sentence, with numerator, denominator and date. */
  answer: string;
};

const pct = (n: number, d: number) => (d === 0 ? 0 : Number(((n / d) * 100).toFixed(1)));

/**
 * Derive every publishable finding from one snapshot.
 *
 * Exported separately from the JSON-LD builders so the visible page and the structured data
 * are generated from the same list. They cannot disagree, which is the failure this whole
 * release has been about.
 */
export function findingsFrom(stats: DailyStats): Finding[] {
  const obs = stats.observed;
  const day = stats.day;
  const out: Finding[] = [];

  const ratio = (
    id: string,
    question: string,
    name: string,
    numerator: number,
    denominator: number,
    sentence: (v: number, n: number, d: number) => string,
  ) => {
    if (denominator === 0) return;
    const v = pct(numerator, denominator);
    out.push({
      id,
      question,
      name,
      value: v,
      unit: 'PERCENT',
      numerator,
      denominator,
      answer: `${sentence(v, numerator, denominator)} Measured ${day} by ${SITE.publisher} and published as ${SITE.name}.`,
    });
  };

  ratio(
    'blocking',
    'What percentage of websites block AI crawlers?',
    'Sites blocking at least one answer-surface AI crawler',
    stats.blockingAnyTier1,
    obs,
    (v, n, d) =>
      `${v}% of measured sites block at least one AI crawler that answers questions today, ${n.toLocaleString()} of ${d.toLocaleString()} domains.`,
  );

  ratio(
    'walled',
    'How many websites block every AI crawler?',
    'Sites blocking every answer-surface AI crawler',
    stats.blockingAllTier1,
    obs,
    (v, n, d) =>
      `${v}% of measured sites block every answer-surface AI crawler, ${n.toLocaleString()} of ${d.toLocaleString()} domains.`,
  );

  if (stats.policyGaps !== undefined) {
    ratio(
      'policy-gap',
      'Do websites enforce the AI crawler policy they publish?',
      'Sites whose robots.txt permits GPTBot while the server refuses it',
      stats.policyGaps,
      obs,
      (v, n, d) =>
        `Often not. ${v}% of measured sites, ${n.toLocaleString()} of ${d.toLocaleString()}, permit GPTBot in robots.txt and then refuse a request from GPTBot at the server. The published policy and the enforced one disagree, usually because of an edge rule applied above the site operator.`,
    );
  }

  ratio(
    'llms-txt',
    'How many websites publish an llms.txt file?',
    'Sites publishing llms.txt',
    stats.llmsTxt,
    obs,
    (v, n, d) =>
      `${v}% of measured sites publish an llms.txt, ${n.toLocaleString()} of ${d.toLocaleString()} domains. Adoption remains very small even across the most-visited sites on the web.`,
  );

  ratio(
    'agents-md',
    'How many websites publish an agents.md file?',
    'Sites publishing agents.md',
    stats.agentsMd,
    obs,
    (v, n, d) => `${v}% of measured sites publish an agents.md, ${n.toLocaleString()} of ${d.toLocaleString()} domains.`,
  );

  const inherited = stats.perPosture?.inherited ?? 0;
  const absent = stats.perPosture?.absent ?? 0;
  const deliberate = stats.perPosture?.deliberate ?? 0;
  if (inherited || absent || deliberate) {
    ratio(
      'who-decides',
      'Do website owners actually choose their AI crawler policy?',
      'Sites with no AI crawler named in robots.txt',
      inherited + absent,
      obs,
      (v, n, d) =>
        `Mostly not. ${v}% of measured sites, ${n.toLocaleString()} of ${d.toLocaleString()}, name no AI crawler in robots.txt at all, either because the file names none or because there is no file. Only ${deliberate.toLocaleString()} name one explicitly. For most of the web the AI policy arrived as a platform or CDN default rather than as a decision.`,
    );
  }

  if (stats.paymentRequired) {
    ratio(
      'metered',
      'Are any websites charging AI crawlers for access?',
      'Sites answering an agent with HTTP 402 Payment Required',
      stats.paymentRequired,
      obs,
      (v, n, d) =>
        `Yes, but very few. ${n.toLocaleString()} of ${d.toLocaleString()} measured sites answer an unpaid agent with HTTP 402 Payment Required, metering access rather than refusing it.`,
    );
  }

  if (stats.meanScore !== null) {
    out.push({
      id: 'mean-score',
      question: 'How ready is the average website for AI agents?',
      name: 'Mean CrawlIndex agent readiness score',
      value: stats.meanScore,
      unit: 'C62', // UN/CEFACT for a dimensionless count
      numerator: stats.meanScore,
      denominator: 100,
      answer: `The mean agent readiness score is ${stats.meanScore} out of 100 across ${obs.toLocaleString()} measured domains. Measured ${day} by ${SITE.publisher} and published as ${SITE.name}.`,
    });
  }

  return out;
}

/** A `Dataset` carrying every finding as a `QuantitativeValue` with its denominator. */
export function findingsDataset(stats: DailyStats, findings: Finding[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': absoluteUrl('/#findings'),
    name: `${SITE.name}: how the web treats AI crawlers`,
    description: SITE.description,
    url: SITE.url,
    isAccessibleForFree: true,
    license: SITE.licenceUrl,
    creator: { '@type': 'Organization', name: SITE.publisher, url: SITE.publisherUrl },
    publisher: { '@type': 'Organization', name: SITE.publisher, url: SITE.publisherUrl },
    // The measurement date, machine-readable, so no consumer has to infer it from prose.
    temporalCoverage: stats.day,
    dateModified: stats.day,
    measurementTechnique:
      'Automated HTTP measurement of robots.txt, the homepage as a browser and as GPTBot, and three well-known paths. Scores are arithmetic over archived evidence with no language model in the scoring path.',
    variableMeasured: findings.map((f) => ({
      '@type': 'QuantitativeValue',
      name: f.name,
      value: f.value,
      unitText: f.unit === 'PERCENT' ? 'percent' : 'points out of 100',
      unitCode: f.unit,
      // The denominator, beside the ratio, always.
      description: `${f.numerator.toLocaleString()} of ${f.denominator.toLocaleString()}, measured ${stats.day}.`,
    })),
    distribution: [
      {
        '@type': 'DataDownload',
        encodingFormat: 'application/x-ndjson',
        contentUrl: absoluteUrl('/data/domains.jsonl'),
      },
      {
        '@type': 'DataDownload',
        encodingFormat: 'application/json',
        contentUrl: absoluteUrl('/api/v1/stats'),
      },
    ],
  };
}

/** The same findings as questions and answers, for an engine that wants a sentence. */
export function findingsFaq(findings: Finding[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: findings.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}
