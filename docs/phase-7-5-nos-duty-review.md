# Phase 7.5 `nos/duty` semantic review

The authoritative row-level artifact is [`catalogue-nos-duty-decisions.json`](../catalogue-nos-duty-decisions.json). It is bound to source hash `75a0bda81e45dd4f1a21d128e15c23f1c19c47df222a4ffc4cd76c7a022a4f57`, catalogue fingerprint `6a742e110edb37a1fce9a1487e834c08aeb6cb08264c0d239da36190774c713c`, and schema `1.0.0`. Every row retains raw unit `nos/duty`; all started with unclassified pricing and `HEADCOUNT_DUTY` quantity.

| Bucket | Codes | Review result | Remaining blocker |
|---|---|---|---|
| CCTV equipment (2) | CCTV_CAME, CCTV_PTZCAME | ORDINARY / COUNT / NOS; ONE_OFF retained (Days N) | None |
| CCTV service (1) | CCTV_CABL | Deferred | Cabling scope and duration |
| Consumable (2) | CREW_FOOD, WC_TOILCONS | Deferred | Consumption/set quantity and duration |
| OPS equipment (8) | FIRE_BUCKSAND, FIRE_EXTIABC, FIRE_EXTICO2, HK_DUST10L, HK_DUST50L, MED_FIRSAID2, MED_ROLLBED, WLK_WALK | ORDINARY / COUNT / NOS | Duration policy |
| Transport/vehicle (3) | FIRE_TEND, HK_DUMPTRUC, WTR_WATETANK2 | Deferred | Vehicle/trip/supply contract and duration |
| Housekeeping service (5) | HK_BIOWDUMP, HK_DUMP, HK_HOUSMATE, HK_PESTCONT, HK_POSTCLEA | Deferred | Service/composite scope and duration |
| Medical composite (3) | MED_ALSIAMBU, MED_BLSAMBU, MED_FIRSAID | Deferred | Package/composite contract |
| Internet service (1) | NET_FIBECABL | Deferred | Length/drop/service quantity and duration |
| Internet equipment (3) | NET_INTEDROP, NET_INTEDROP2, NET_WIFIPOIN | ORDINARY / COUNT / NOS; ONE_OFF retained (Days N) | TO_VENDOR rate absent |
| Security equipment (4) | SEC_BAGGSCAN2, SEC_DFMD, SEC_HHMD, SEC_PLUGPOIN | ORDINARY / COUNT / NOS | Approved duration; SEC_PLUGPOIN vendor rate |
| Security composite (1) | SEC_QUICRESP | Deferred | Team composition and duration |
| Facility service (1) | WC_DRAI | Deferred | System scope and duration |
| Facility equipment (5) | WC_GEMIHAND, WC_LUXLTOIL, WC_PORT, WC_STANHAND, WC_URIN | ORDINARY / COUNT / NOS | Approved duration and both-side rates |

The 39 individual decisions contain the source name/description, Days Applies evidence, separate quantity/pricing/duration decisions, reason, evidence, and bucket. No reviewed row was confirmed as personnel. The 24 earlier evidence-approved personnel rows were not reopened.

Approved corrections: 22. Fully ready through existing ONE_OFF: 5. Corrected but duration-blocked: 17. Fully semantic-deferred: 17. Duration totals: ONE_OFF 5, unassigned 34, all other modes 0. No vanity row occurs in this population. No OPS/security duration rule, package, generator, or third pricing family was inferred.

Raw imports and Brand Profesor reference artifacts remain immutable. Only normalized fields change through the guarded, transactional, audited apply.
