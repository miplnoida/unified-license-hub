---
name: Location Master Data Hierarchy
description: Country/State/City dropdowns come from Master Data types COUNTRY, STATE, CITY (seeded worldwide), not the legacy countries/states tables
type: feature
---
Location dropdowns (registration address fields and any new form) must use Master Data:
- Types: `COUNTRY` (250 countries, code = ISO2, metadata holds iso2/iso3/phonecode/currency/region), `STATE` (~5,300 subdivisions, parent = country; countries with no subdivisions get one synthetic entry named after the country), `CITY` (~15,400 major cities, parent = state, metadata.population).
- Fields configure `optionSource: 'master_data'`, `masterDataTypeCode`, and `masterDataParentField` for cascading (country -> state -> city). Values stored are master data item UUIDs.
- Legacy `countries` / `states` tables remain only so historic submissions still resolve labels. Do not add new dependencies on them.
- Master Data admin item list is server-searched and capped at 200 rows per fetch because of the city volume.
