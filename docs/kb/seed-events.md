# KB: Seed Events and Match Templates

## What is a Seed Event?

A **seed event** is an existing SSI event that you reference when creating a match template in the platform. The seed event provides the structural blueprint for the template: match discipline, number of matches (for cups), stages per match, squad configuration, and competition rules.

You point a template to a seed event by entering its SSI URL in the template's **SSI Event URL** field, then clicking **Import Seed**. This fetches the event structure from SSI and stores it as a local snapshot (`ssi_seed_snapshot`) in the platform database.

---

## What Data Is Stored

When you click **Import Seed**, the platform:

1. Logs in to SSI with the tenant's SSI credentials
2. Fetches the event structure (matches, stages, squads, rules, weapon groups, etc.)
3. Saves a full JSON snapshot to the template's `ssi_seed_snapshot` field

After this point, the template is **self-contained**. All subsequent event creation uses the stored snapshot — the live SSI seed event is no longer referenced at runtime.

---

## Can I Delete the Seed Event from SSI?

**Yes, it is safe to delete the seed event from SSI** — provided you have already imported the seed snapshot into the template.

| Action after deletion | Result |
|---|---|
| Create new scheduled event from the template | ✅ Works — uses cached snapshot |
| View or edit the template | ✅ Works |
| Re-import seed (refresh snapshot from SSI) | ❌ Fails — SSI returns 404, event is gone |
| Point template to a different SSI event URL | ✅ Works — just update the URL and re-import |

---

## Typical Workflow

```
1. Run a real or test event in SSI (the "seed")
2. In the platform: create a template, set SSI Event URL → click Import Seed
3. Adjust template overrides (name format, staffing rules, calendar settings)
4. (Optional) Delete the seed event from SSI — the template is independent now
5. Use the template to schedule and create future events
```

---

## What If the Seed Was Never Imported?

If `ssi_seed_snapshot` is empty and the seed event has been deleted from SSI, the template cannot generate new SSI events — the platform has no structure data to work from.

**Resolution options:**
- Create a new equivalent event in SSI, point the template's SSI Event URL to it, and re-import
- Manually configure the template's `overrides` field with the required structure (advanced, not recommended)

---

## Related: Deleting Platform Events

Deleting an event through the **platform's Delete button** cascades correctly:

- For **cup events**: deletes each component match from SSI first, then the cup
- For **standalone matches**: deletes the match from SSI
- Then removes the platform DB record (event, staffing needs, signups)

If you delete the SSI event **directly in SSI** (bypassing the platform), the platform record remains with a stale `ssi_references`. You should then delete the platform record manually via the platform UI — the platform handles the stale SSI reference gracefully (detects 404 and proceeds with local deletion).

---

## See Also

- `docs/design/platform-data-model.md` — Template and event data model
- `scoring-proxy/lib/services/event-creation-service.js` — Event creation and deletion logic
- `scoring-proxy/routes/platform.js` — `POST /templates/:id/import-seed` endpoint
