# Phase 9 specialized contract review

The authoritative workbook hash `75a0bda81e45dd4f1a21d128e15c23f1c19c47df222a4ffc4cd76c7a022a4f57` matches the applied import. The database reconciled exactly the expected 17 rows. All retain raw `nos/duty`, Days Applies `Y`, legacy `OPS_CHARGE_DAYS`, inherited `HEADCOUNT_DUTY`, unclassified pricing, `DUTY`, and no DurationPolicy.

| Code | Source meaning | Quantity contract | Billing unit | Duration | Rate compatibility | Decision |
|---|---|---|---|---|---|---|
| CCTV_CABL | CCTV cabling | Length/drop/fixed scope unknown | M/RFT/SERVICE unresolved | Formula unknown | No rates | DEFER |
| CREW_FOOD | Crew food; “all staff” note | Meal/person/engagement recurrence unknown | MEAL/engagement unresolved | Could double-count meals | ₹200/₹1,000 unit unstated | DEFER |
| FIRE_TEND | Fire Tender (Big) | Vehicle/deployment/trip/duty unknown | NOS/TRIP/DAY unresolved | Days Y only | ₹50,000/₹25,000 unit unstated | DEFER |
| HK_BIOWDUMP | Bio-waste Dumping System | System/load/collection/engagement unknown | LOAD/SERVICE/FIXED unresolved | Days Y only | No rates | DEFER |
| HK_DUMP | Dumping Area | Area/facility/engagement unknown | AREA/SERVICE/FIXED unresolved | Days Y only | No rates | DEFER |
| HK_DUMPTRUC | Dumping Truck; post-show garbage note | Truck/trip/load/service unknown | TRIP/LOAD/SERVICE/NOS unresolved | Post-show conflicts with daily multiplication | ₹30,000 each side unit unstated | DEFER |
| HK_HOUSMATE | Broom, mop and dustpan material | Equipment set/consumption/replenishment unknown | SET/REFILL/NOS unresolved | Rental versus consumption unknown | No rates | DEFER |
| HK_PESTCONT | Pest control | Visit/area/fixed engagement unknown | VISIT/SERVICE/FIXED unresolved | One-off versus recurring unknown | No rates | DEFER |
| HK_POSTCLEA | Post-event cleanup | Area/crew/visit/engagement unknown | SERVICE/VISIT/FIXED unresolved | Days Y conflicts with post-event wording | No rates | DEFER |
| MED_ALSIAMBU | ALS ambulance + doctor + nurse | Staffed vehicle composite | Deployment/package unresolved | Vehicle and duties inseparable | ₹35,000/₹30,000 bundle unit unstated | DEFER |
| MED_BLSAMBU | BLS ambulance + doctor + nurse | Staffed vehicle composite | Deployment/package unresolved | Composite unknown | No rates | DEFER |
| MED_FIRSAID | Counter + doctor + nurse | Facility/personnel composite | Post/package unresolved | Facility and duties inseparable | No rates | DEFER |
| NET_FIBECABL | Fiber cabling | Length/drop/fixed scope unknown | M/RFT/SERVICE unresolved | Days Y only | No rates | DEFER |
| SEC_QUICRESP | Quick Response Team | Headcount/vehicle/team/service unknown | TEAM/SERVICE/DUTY unresolved | Availability unknown | ₹3,500/₹20,000 unit/composition unstated | DEFER |
| WC_DRAI | Drainage system | Length/system/service operation unknown | LINEAR/SERVICE/FIXED unresolved | Days Y only | No rates | DEFER |
| WC_TOILCONS | Toiletry Consumables Set | Set/supply/refill/recurrence unknown | SET/REFILL/SERVICE unresolved | Could double-count replenishment | No rates | DEFER |
| WTR_WATETANK2 | Water Tanker/Water Supply | Tanker/trip/delivery/volume unknown | TRIP/LITRE/NOS/SERVICE unresolved | Delivery recurrence unknown | No rate; separate 10KL ONE_OFF row is not equivalent evidence | DEFER |

The workbook’s lookup formulas only select city values; they do not establish billable units. Alias vocabulary describes identity, not commercial arithmetic. Existing ORDINARY primitives would be sufficient for several possible future contracts, but none can be selected without reinterpreting rates.

No row is approved. No new PricingFamily, UnitCode, duration assignment, calculation branch, or builder UI is introduced. The guarded artifact is [`catalogue-specialized-contract-decisions.json`](../catalogue-specialized-contract-decisions.json), bound to fingerprint `8f6d3bf239704d0b858599c22424f7ba3ecb5c5769162cad66f4621d199b368b`.
