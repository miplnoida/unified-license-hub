## Create "Merchant Bank License Application" Pre-License Form

Add a new pre-license form template via a data insert into `form_templates` (form_type = `pre_license`), containing four required fields grouped in a single section.

### Fields
1. **Wholesale banking operations plan** — long text (textarea), required
2. **Correspondent banking arrangements** — long text (textarea), required
3. **Capital adequacy evidence** — file upload, required
4. **Directors and officers** — long text (textarea), required

### Details
- Status: `draft` (admin can publish from Pre-License Forms screen)
- Regulator: current active regulator context (will use the BOJ/default regulator already used by existing pre-license forms)
- Sector / Sub-sector / Category: left unassigned so admin can classify before publishing (matches how other seed templates were created)
- Version: 1
- Layout: single section, one column per field

### Open question
Should I assign this to a specific Sector / Sub-Sector / Category (e.g. Banking → Merchant Bank), or leave it unclassified for the admin to set before publishing?
