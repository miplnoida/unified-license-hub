## Why it's missing
The Returns tab in Admin > Form Management filters `form_templates` by `form_type = 'returns'`. The earlier seed inserted "Balance Sheet Return" with `form_type = 'post_license'`, so it is currently listed under Post-License Forms instead of Returns.

## Fix
Run a single data update on the existing template row (no schema, code, or RLS changes):

- `form_type`: `post_license` → `returns`
- `return_type_id`: set to the **Monthly** return type (`04dfc304-c82d-46d5-afaf-9f3ac91d58c6`)

After the update, the form will disappear from the Post-License tab and appear under Returns (Monthly). The existing monthly `return_configurations` row and the form's version/fields remain untouched.
