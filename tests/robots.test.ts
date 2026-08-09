import { describe, expect, it } from 'vitest';
import { isAgentAllowed, isAgentNamed, parseRobots } from '../lib/robots';

describe('parseRobots', () => {
  it('groups consecutive user-agent lines together', () => {
    const p = parseRobots(`
User-agent: GPTBot
User-agent: ClaudeBot
Disallow: /private
`);
    expect(p.groups).toHaveLength(1);
    expect(p.groups[0].agents).toEqual(['gptbot', 'claudebot']);
    expect(p.groups[0].disallow).toEqual(['/private']);
  });

  it('starts a new group when a user-agent follows a rule', () => {
    const p = parseRobots(`
User-agent: *
Disallow: /admin
User-agent: GPTBot
Disallow: /
`);
    expect(p.groups).toHaveLength(2);
  });

  it('collects sitemaps and ignores comments', () => {
    const p = parseRobots(`
# a comment
Sitemap: https://example.com/sitemap.xml
User-agent: * # trailing comment
Disallow:
`);
    expect(p.sitemaps).toEqual(['https://example.com/sitemap.xml']);
    expect(p.groups[0].disallow).toEqual(['']);
  });
});

describe('isAgentAllowed', () => {
  it('allows everything when there are no rules', () => {
    expect(isAgentAllowed(parseRobots(''), 'GPTBot')).toBe(true);
  });

  it('treats an empty Disallow as allow-all, not block-all', () => {
    const p = parseRobots('User-agent: *\nDisallow:');
    expect(isAgentAllowed(p, 'GPTBot', '/anything')).toBe(true);
  });

  it('blocks on a blanket Disallow: /', () => {
    const p = parseRobots('User-agent: *\nDisallow: /');
    expect(isAgentAllowed(p, 'GPTBot', '/')).toBe(false);
  });

  it('lets a specific group override the wildcard entirely', () => {
    // The wildcard blocks everything, but GPTBot has its own permissive group.
    const p = parseRobots(`
User-agent: *
Disallow: /

User-agent: GPTBot
Disallow: /admin
`);
    expect(isAgentAllowed(p, 'GPTBot', '/')).toBe(true);
    expect(isAgentAllowed(p, 'GPTBot', '/admin')).toBe(false);
    expect(isAgentAllowed(p, 'ClaudeBot', '/')).toBe(false);
  });

  it('does not merge the wildcard group into a specific group', () => {
    // A naive implementation would inherit "/secret" from the wildcard. It must not.
    const p = parseRobots(`
User-agent: *
Disallow: /secret

User-agent: GPTBot
Disallow: /other
`);
    expect(isAgentAllowed(p, 'GPTBot', '/secret')).toBe(true);
  });

  it('gives the longest matching rule priority', () => {
    const p = parseRobots(`
User-agent: *
Disallow: /docs
Allow: /docs/public
`);
    expect(isAgentAllowed(p, 'GPTBot', '/docs/private')).toBe(false);
    expect(isAgentAllowed(p, 'GPTBot', '/docs/public/a')).toBe(true);
  });

  it('resolves an exact-length tie in favour of Allow', () => {
    const p = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a');
    expect(isAgentAllowed(p, 'GPTBot', '/a')).toBe(true);
  });

  it('matches the user-agent token case-insensitively', () => {
    const p = parseRobots('User-agent: gptbot\nDisallow: /');
    expect(isAgentAllowed(p, 'GPTBot', '/')).toBe(false);
  });

  it('honours a trailing wildcard in a path rule', () => {
    const p = parseRobots('User-agent: *\nDisallow: /api*');
    expect(isAgentAllowed(p, 'GPTBot', '/api/v1')).toBe(false);
    expect(isAgentAllowed(p, 'GPTBot', '/public')).toBe(true);
  });
});

describe('isAgentNamed', () => {
  it('reports an explicitly named token even when that group allows it', () => {
    const p = parseRobots('User-agent: GPTBot\nDisallow:');
    expect(isAgentNamed(p, 'GPTBot')).toBe(true);
    expect(isAgentNamed(p, 'ClaudeBot')).toBe(false);
  });
});
