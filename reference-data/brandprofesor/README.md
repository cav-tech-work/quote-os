# Brand Profesor external reference snapshot

This directory contains public commercial observations from `https://brandprofesor.com`, captured by `scripts/crawl-brandprofesor-reference.mjs` through the public WooCommerce Store API and WordPress policy API.

It is deliberately isolated from Prisma, `CanonicalItem`, `CommercialOffering`, `Price`, import authority, rate resolution, and quote calculation. Nothing here is an approved Clockwork AV rate or policy. Treat names, prices, variants, availability, and policy wording as time-sensitive external evidence requiring human review before any later mapping.

The collector:

- checks `robots.txt` before work;
- stays on public APIs and never accesses `/wp-admin/`;
- identifies itself and throttles variation requests;
- records source URLs, capture time, minor-unit price strings, category/attribute facts, policy source text, and hashes;
- omits images and long marketing descriptions;
- performs no automatic matching to QuoteOS records.

Refresh explicitly:

```text
node scripts/crawl-brandprofesor-reference.mjs
```

Review `manifest.json` after each run. The snapshot is reference evidence, not a production catalogue import.
