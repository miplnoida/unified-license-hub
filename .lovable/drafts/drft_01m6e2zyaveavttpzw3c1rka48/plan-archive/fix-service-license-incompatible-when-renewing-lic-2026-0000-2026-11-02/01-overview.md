## Fix "SERVICE_LICENSE_INCOMPATIBLE" when renewing LIC-2026-000034

### Cause (checked)
The renewal check only allows a service when the service's regulator matches the licence's regulator.
- LIC-2026-000034 belongs to Saint Lucia FSRA.
- The Commercial Bank "Renew" service has no regulator set, and neither does the Commercial Bank sector. The check reads that as "no match" and blocks the renewal.
- Sector and sub-sector already match.

### Change (data only, one record)
- Set Saint Lucia FSRA as the regulator on the Commercial Bank **Renew** service only.
- No code, permission or rule changes. The other Commercial Bank services and the 6 ABC Prudential licences stay as they are (still blocked, as today).
- This writes to the live shared database. To undo it, clear the regulator on that service again.

### Verify
- Read the service back.
- Run the read-only compatibility check for this licence and the Renew service and confirm it now returns OK.
- You then retry Renew as the licence holder.
