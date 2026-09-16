# Phase 12A - V1 Component Catalogue Reconciliation

Phase 12A reconciles the V1 component vocabulary from the authoritative LookUp workbook against the existing normalized catalogue, then exposes a bounded package-builder workflow. The source workbooks are evidence only; this phase does not import prices, create packages automatically, approve business use, or touch production.

## Source boundary

- LookUp source: `CAV_Rates_VC_Ops_Power_v120826 (1).xlsx`
- LookUp SHA-256: `7fa71120caa0b88398804d1b9abafb80bada7f0d6662d05f928fc1f0786a9ca0`
- CCI source: `CCI_2026_v2_PivotExtraction_ToClient.xlsx`
- CCI SHA-256: `4863fbd1308475f7a388253b87bb3cb0b811c72e1d0672766ec116eb522add36`
- LookUp rows considered: rows 2 through 165 only.
- Row 166, `TRANSPORT`, is excluded from the V1 component boundary.
- Result: 164 valid LookUp component rows, 164 unique element codes, 77 unique parent codes, no duplicate element codes, and no missing parent codes.

Parent identity is stored as `CanonicalItem.code`. Element identity is stored as `CommercialOffering.code`. `SourceMapping` records workbook hash, source row, parent code, element code, source description, `Maps_To`, tags, and matching evidence.

## CCI controls and exclusions

The CCI parser reads city sheet row-2 component labels and excludes non-component control fields:

- `Area in Sqm`
- `Octa B`
- `Octa L`
- `Qty`
- `SingleItemPrice`
- `Total Oct Area`

The remaining CCI labels are classified as:

- `EXACT_MATCH`: 2
- `ALIAS_MATCH`: 7
- `PROPOSED_MATCH`: 10
- `AMBIGUOUS`: 17
- `UNMATCHED`: 10

Exact and alias matches are auto-confirmed. Proposed, ambiguous, and unmatched labels stay in the review queue. Human decisions are marked separately from automatic decisions so rerunning reconciliation refreshes source evidence without overwriting manual review.

## CCI decisions

Exact:

- `German Hanger` -> `GERM_HANG`
- `System Table` -> `SYS_TABL`

Alias:

- `Double Sofa` -> `SOFA_DOUBSEAT`
- `Jewelry table` -> `JEWL_TABL`
- `Q Managers` -> `BAR_GOLDBOLL`
- `Single Sofa` -> `SOFA_SINGSEAT`
- `Slim Show Case` -> `SHOW_SLIM`
- `Small Dustbin` -> `DUSTBIN`
- `Tall Show Case` -> `SHOW_TALL`

Proposed, requiring review:

- `3ft dia cocktail high tables` -> `TBL_HIGHTABL`
- `3ft dia cocktail high tables (wooden top)` -> `TBL_HIGHTABL`
- `5/15A Plug Pt` -> `PWR_PLUGPOIN7`
- `Curtains for OctBooth` -> `CURTAIN`
- `Fridge 190L` -> `FRIDGE_BOX`
- `Fridge for GreenRoom` -> `FRIDGE_BOX`
- `Glass CoffeeTable` -> `GLASS_SHELF`
- `Glass Shelves (Set of 3)` -> `GLASS_SHELF`
- `Glass Table` -> `TBL_COFFTABL`
- `Golden/Red Bollards` -> `BAR_GOLDBOLL`

Ambiguous, requiring human selection:

- `AC`: `TEMP_AC`, `TOWER_AC`
- `Banquet table with frills`: `BANQ_TABL`, `TBL_BARTABL`, `TBL_BARTABL2`, `TBL_ROUNDINI`
- `Carpet w/Panni`: `GREY_CARP`, `RED_CARP`
- `Dunlop Chair`: `CHR_BANQCHAI`, `CHR_BANQCHAI2`, `CHR_BANQCHAI3`, `CHR_BANQCHAI4`
- `German Pagoda`: `CON_GERMMARQ`, `PAG_STAL10`, `PAG_2015`
- `Lockable Door`: `OCT_LOCKDOOR`, `OCT_LOCKDOOR2`
- `Mesh wall with black masking`: `MASK_BOXOFFI`, `MASK_COUPCOUN`, `MASK_CROWCONT`, `MASK_ITEM`, `MASK_YOND`
- `Mist Fan`: `FAN_MIST`, `FAN_MISTBACK`
- `Mojo`: `BAR_MOJO`, `BAR_MOJOAUDI`, `BAR_MOJOFRON`
- `Mojo Barricading`: `BAR_MOJO`, `BAR_MOJOFRON`, `BAR_MOJOAUDI`
- `Pedestal Fan`: `PED_FAN`, `FAN_STANSTAL`
- `Plastic Chair with White/Black Cover`: plastic-chair and banquet-chair variants
- `Platforming`: `PLAT_UPSTLED`, `PLAT_IMAGHOUS`, `PLAT_IMAGHOUS2`, `PLAT_FOLLSPOT`
- `Railing Barricading`: railing and metal-railing variants
- `Spotlight`: COB-light and LED-halo variants
- `TinSheet with Black masking`: table and masking variants
- `WoodenPicnicBenches w/Table`: picnic, banquet-table, utility-table, and masking variants

Unmatched:

- `43"Plasma + Stand w/HDMI`
- `43"Plasma + WallMount w/HDMI`
- `BackdropPlyback w/StarMattFlex`
- `BacksideWingForBackdropSupport-WoodenFrame w/BlackCloth/Flex`
- `BarStool`
- `BlackMasking on WireMesh 12ft`
- `GeneralLight onTowers`
- `SpikeGuard`
- `TentTable w/BlackCover`
- `TopFacia`

## Local apply results

Against the retained populated local development database:

- First apply: 27 parent canonicals created, 30 offerings created, 134 offerings reused, 299 aliases created, 164 LookUp mappings created, 46 CCI mappings created.
- Repeat apply: 0 parent canonicals created, 0 offerings created, 164 offerings reused, 0 aliases created, 0 mappings created.
- CCI after apply: 9 confirmed and 37 review-required.
- Prices remained `327 -> 327`.
- Packages remained `0 -> 0`.

Against a fresh local database, reconciliation creates only V1 component identities and evidence:

- 77 parent canonicals, 164 offerings, 299 aliases, 164 LookUp mappings, and 46 CCI mappings.
- Prices remain `0 -> 0`.
- Packages remain `0 -> 0`.

The apply command refuses non-local PostgreSQL hosts.

```text
npm run components:reconcile -- "/absolute/path/CAV_Rates_VC_Ops_Power_v120826 (1).xlsx" "/absolute/path/CCI_2026_v2_PivotExtraction_ToClient.xlsx" --preview
npm run components:reconcile -- "/absolute/path/CAV_Rates_VC_Ops_Power_v120826 (1).xlsx" "/absolute/path/CCI_2026_v2_PivotExtraction_ToClient.xlsx" --apply
```

## Admin surfaces

- `/admin/catalogue/component-reconciliation` shows CCI label, cities, match type, status, candidates, current match, and confirm/change/defer actions.
- Proposed and ambiguous candidates are rendered directly on each reconciliation card, ahead of generic search, and each selectable candidate has a dedicated confirm action.
- Reconciliation and package-builder component pickers use the same identity search service. Element selection includes active V1 component offerings with `ITEM`, `SERVICE`, or unset kind, and does not filter by rate availability, quote readiness, duration readiness, or business-review state.
- `/admin/catalogue` search includes aliases and distinguishes parent identity from element identity.
- `/admin/packages` lists recipe drafts and versions.
- `/admin/packages/new` creates draft package recipes only. It supports component-sum and fixed-package modes, searchable components, per-package quantities, billable/included role, personnel duties where needed, server preview, save draft, and clone-as-next-version.

Package preview is read-only and does not persist rows. Missing rates are reported per side. `HYBRID`, nested packages, inventory semantics, automatic package creation, and production bootstrap remain deferred.

## Boundaries

No pricing behavior changed. There is no legacy fallback, opposite-side fallback, CITY fallback, historical workbook fallback, Brand Profesor import, or derived markup. No package or business approval is created automatically. All new component offerings start as unreviewed unless already reviewed through existing Phase 11 controls.
