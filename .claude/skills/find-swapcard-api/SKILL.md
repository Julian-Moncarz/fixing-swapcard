---
name: find-swapcard-api
description: Discover how Swapcard does something (a GraphQL query or mutation, its arguments, or what a button does) so Calmer Card can reuse it. Use before adding a query to src/data.js or when a Swapcard button misbehaves under Calmer Card.
---

# Find a Swapcard API or behaviour

Swapcard's GraphQL accepts any query text but has introspection disabled (it returns 500). So shapes come from Swapcard's own JavaScript, then from careful read-only test queries. Record what you learn in `CATALOG.md` §4.

## Find the operation text

Search the loaded chunks first, then every chunk in the build manifest:

```js
const bm = performance.getEntriesByType('resource').map((e) => e.name).find((u) => /_buildManifest\.js/.test(u));
const base = bm.replace(/\/_next\/static\/.*$/, '/_next/');
const chunks = [...new Set((await (await fetch(bm)).text()).match(/static\/chunks\/[^"]+\.js/g))];
for (const c of chunks) {
  const t = await (await fetch(base + c)).text();
  const i = t.indexOf('query MyContacts_ContactsQuery'); // or a field name, e.g. 'updatePersonMeetingSlotsDisabled'
  if (i >= 0) { /* return t.slice(i, i + 1500), with ?&= replaced so the tool doesn't redact it */ }
}
```

- **Arguments:** for the variables shape, search near the call site for `variables:{input:{` or the hook that wraps the mutation (that's how `Core_updatePersonMeetingSlotsDisabled`'s `{eventId, personId, isDisabled, meetingSlotIds}` was found).
- **Filter shapes:** when a filter input type is unknown, try candidate shapes as read-only queries through `CC.query` and compare `totalCount`. For example, `Core_listConnections(filter: { eventId })` works and `{ eventIds }` returns 400.
- **Dates:** request every date as `field(format: ISO8601)`.

## Find what a button does

Wrap `window.next.router.push`/`replace` to log their arguments, click the button, then restore the router. That's how Swapcard's Message button turned out to be `push('/event/<slug>/person/<id>?openConnection=true')`. For network-level detail, watch `/api/graphql` requests; Swapcard sends persisted-query hashes, so the operation name is the useful part.

## Rules

- Only run queries until you're sure; a mutation acts on the real account and other people see it. Test mutations only on the user's own state (their availability, say) and restore it at once, or ask first.
- Use Swapcard's main Apollo client (`CC.query`, `CC.mutate`) so auth and cache stay consistent. The chat API is a separate client (`window.__APOLLO_CLIENT__`).
- Treat class-name hashes and persisted-query hashes as perishable; operation and field names are much more stable.

If anything in this skill turns out to be wrong or out of date, fix it here as soon as you notice, and add what you learn.
