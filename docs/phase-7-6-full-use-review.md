# Phase 7.6 full-use duration review

The guarded decision artifact is [`catalogue-full-use-decisions.json`](../catalogue-full-use-decisions.json), bound to the authoritative source hash and post-Phase-7.5 catalogue fingerprint. Re-querying the applied Phase 7.5 population produced exactly the expected 17 `ORDINARY / COUNT / NOS`, Days Applies `Y`, duration-unassigned rows.

| Code | Name | Commercial interpretation | Decision and reason |
|---|---|---|---|
| FIRE_BUCKSAND | Fire Buckets w/ sand | Reusable fire-safety equipment | APPROVE FULL_USE_DAYS; deployed for applicable usage days |
| FIRE_EXTIABC | Fire Extinguishers - ABC | Reusable fire-safety equipment | APPROVE FULL_USE_DAYS; deployed for applicable usage days |
| FIRE_EXTICO2 | Fire Extinguishers - CO2 | Reusable fire-safety equipment | APPROVE FULL_USE_DAYS; deployed for applicable usage days |
| HK_DUST10L | Dustbin 10L | Durable sanitation equipment | APPROVE FULL_USE_DAYS; reusable unit deployed throughout usage |
| HK_DUST50L | Dustbin 50L | Durable sanitation equipment | APPROVE FULL_USE_DAYS; reusable unit deployed throughout usage |
| MED_FIRSAID2 | First Aid Kit | Countable deployed kit, distinct from replenishment and composite counter | APPROVE FULL_USE_DAYS; kit availability follows usage duration |
| MED_ROLLBED | Rolling bed | Reusable medical equipment | APPROVE FULL_USE_DAYS; deployed throughout usage |
| SEC_BAGGSCAN2 | Baggage Scanner | Reusable security equipment | APPROVE FULL_USE_DAYS; hired for full usage days |
| SEC_DFMD | DFMD | Reusable security equipment | APPROVE FULL_USE_DAYS; hired for full usage days |
| SEC_HHMD | HHMD | Reusable security equipment | APPROVE FULL_USE_DAYS; hired for full usage days |
| SEC_PLUGPOIN | Plug points for DFMD | Countable deployed security-support item | APPROVE FULL_USE_DAYS; vendor rate remains absent |
| WC_GEMIHAND | Gemini Handwash | Reusable facility unit | APPROVE FULL_USE_DAYS; deployed throughout usage |
| WC_LUXLTOIL | Lux-loo/VIP toilets | Reusable portable facility | APPROVE FULL_USE_DAYS; deployed throughout usage |
| WC_PORT | Porta-loo/Bio-toilets | Reusable portable facility | APPROVE FULL_USE_DAYS; deployed throughout usage |
| WC_STANHAND | Standard handwash | Reusable facility unit | APPROVE FULL_USE_DAYS; deployed throughout usage |
| WC_URIN | Urinals | Reusable portable facility | APPROVE FULL_USE_DAYS; deployed throughout usage |
| WLK_WALK | Walkies | Reusable communications equipment | APPROVE FULL_USE_DAYS; hired for full usage days |

No candidate was deferred after identity review. The first-aid kit decision applies to the deployed kit only, not its consumed contents or replenishment. The 17 Phase 7.5 service, transport, consumption, and composite deferrals remain unchanged and outside normalized selection.

The existing active `INTERNAL_APPROVED` FULL_USE_DAYS policy is reused. It resolves usage days 1–4 to charge units 1–4 without domain routing. HALF_USE_DAYS_MIN_1, ONE_OFF, and HEADCOUNT_DUTY behavior are unchanged.
