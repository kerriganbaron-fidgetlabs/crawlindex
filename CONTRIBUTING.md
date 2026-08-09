# Contributing, and the honest state of this project

Read this before opening anything, so nobody wastes their time.

## This project is deliberately unstaffed

CrawlIndex is a public good that runs itself. The crawl is a scheduled GitHub Action, the
dataset is files in this repository, the site is static, and the whole thing costs nothing
to keep alive. That is the design goal: a free resource that does not depend on anyone
continuing to pay attention to it.

The corollary is that **there is no support**. No support email exists. Issues are not
monitored on any schedule and may never be read. That is not rudeness, it is the deal that
makes an indefinitely-free public dataset possible.

## What you can rely on without anyone answering you

**Removing a domain from the index.** Disallow `CrawlIndexBot` in its robots.txt:

```
User-agent: CrawlIndexBot
Disallow: /
```

The crawler reads that before it requests anything else, so it costs your server one
request, and the domain drops out of the published index on the next run. This is the
mechanism that is guaranteed to work, immediately, with no human involved.

**Checking a figure.** Every score is a pure function over an archived observation. The
whole dataset is at [/data](https://crawlindex.org/data), and every past state of it is a
commit in this repository. If a number looks wrong you can usually find out why yourself in
less time than it would take to ask.

## Pull requests

`main` requires a pull request. There are no exceptions and no bypass actors, including for
the nightly crawl bot, which opens and merges its own PR like everyone else.

Note the [licence](LICENSE) before you write any code: the **data** is CC BY 4.0 and yours
to use freely, but the **code** is all rights reserved. It is published so the methodology
is auditable, not so it can be reused. A contribution to this repository is not something
this project can currently accept a licence grant for, so code PRs from outside are likely
to be declined regardless of quality.

What is genuinely useful, if you want to help:

- **A wrong fingerprint.** If a platform or CDN is being misattributed, that poisons a
  cross-tab. Say which domain and what it actually runs.
- **A robots.txt parsed incorrectly.** These are the most damaging bugs the project can
  have, because they produce confidently wrong claims about a real operator. Include the
  robots.txt and the token.
- **A new AI crawler token** that should be in the registry, with a source.

## Forking

GitHub grants every user the ability to fork any public repository and that cannot be
turned off by the owner. Forking this is therefore possible and not a terms violation. It
grants no licence to the code. See [LICENSE](LICENSE).

## Security

There is nothing here to attack: no accounts, no user data, no database, no cookies, no
runtime secrets in the published site. If you find something anyway, open an issue, and
accept that it may sit unread for a while.
