# Swapcard catalogue (attendee web app)

Explored on 2026-10-15 against **EA Global: New York City 2026** (`app.swapcard.com/event/ea-global-new-york-city-2026`), logged in as an attendee. Swapcard deploys often, so treat class-name hashes and persisted-query hashes as perishable; names and shapes are more stable.

Contents: 1. Architecture and hooks · 2. Screens · 3. Reusable components · 4. Data operations · 5. Cruft list · 6. Reuse decisions.

---

## 1. Architecture and hooks

| Thing | Finding | Use |
|---|---|---|
| Framework | Next.js (`window.__NEXT_DATA__`), React 18, client-side routing between pages | SPA navigation keeps our injected state alive; listen for route changes (history patch + MutationObserver) |
| Styling | styled-components; classes look like `meeting-item__Container-sc-e10758fc-0 dviEZX`. The `displayName__Part` prefix is readable and fairly stable; the `-sc-hash` and short class change per deploy | Target with `[class*="meeting-item__Container"]` |
| Theme | Full theme object reachable from any React fiber's props (`fonts, fontWeight, radius, shadow, colors, spacing, zIndex, palette`), see §3 | Read at runtime, expose as CSS variables for our UI |
| Webpack | `webpackChunk_N_E.push([[id],{},r=>req=r])` yields `__webpack_require__`; `req.m` has about 1.6k module factories | Find Swapcard's own modules (gql tag, components) by content |
| GraphQL tag | Module containing "Syntax Error" exports gql (`req(id).Ps` at time of writing; find by probing exports) | Build DocumentNodes for their client |
| Apollo (main) | Not on `window`. Reachable by walking React fiber `.return` for `memoizedProps.client`. Two clients: main and chat (`window.__APOLLO_CLIENT__` = chat) | **Run our own queries and mutations through their client**: auth handled, shared cache, their UI updates in sync. Verified with a custom `Core_event(_id)` query |
| Transport | `POST /api/graphql`, batched arrays, Apollo persisted queries (hash only). Headers: `authorization`, `x-client-version`, `x-client-platform`, `x-feature-flags`, `x-client-origin`; cookie alone gives NOT_ALLOWED | Fallback: copy headers from the page's own fetch and replay |
| Arbitrary queries | Accepted (no safelist). Introspection disabled | We write our own queries; field names come from the bundle's gql text |
| Chat API | `chat-api.swapcard.com/graphql`, full query text, separate Apollo client | Use the chat client from the fiber walk |
| Time grid | My Schedule calendar: 2px per minute, absolute blocks, `top = minutesSinceMidnight * 2` | Inject ghost sessions into their columns |
| Layout template | `wrapper__Wrapper` > `aside__Aside` (302px) · `main__Main` (602px) · `aside__Aside` (302px), centred in ~1290px | Widen globally; swap aside contents |
| Font | "Work Sans", Arial, Helvetica, sans-serif | Already loaded on the page |

## 2. Screens

Top bar: Swapcard logo · org logo · event switcher · bell (notifications drawer) · chat icon (Messages page) · avatar menu.
Event nav: Home · My Ticket · Event Guide · My Schedule · Agenda · Attendees · EAG Matcher (Find 1-1s) · More ▾ (Venue Map, Speakers, Organization Fair, Opportunities Board, Unofficial Satellite Events, Slack).

| Screen | Route | What it shows | Data | Verdict |
|---|---|---|---|---|
| Community home | `/` | Communities you're in, related events | | Cruft (skip straight to event) |
| Event home | `/event/<slug>` | Profile card; long list of nav links duplicating the top nav; venue map image; event dates, address, **Wi-Fi**, code of conduct | `EventDetailsPage_EventDetails` | Mostly cruft; keep Wi-Fi/ticket one click away |
| My Ticket | modal (button) | QR badge + code | `BadgeQuery` | Keep (quick access) |
| Event Guide | external Google Doc | | | Link only |
| My Schedule · My schedule | `/my-schedule?view=schedule` | List or **Calendar** (3 day columns). Meetings: green confirmed / orange pending / invitation. Sessions you added. Left: Appearance, captions, manage availability, time zone | `MySchedule_EventScheduleQuery`, `EventScheduleViewQuery`, `Calendars_GetCalendarsQuery` | **Base of our Calendar view** |
| My Schedule · My profile | `/my-profile` | Own profile, Edit links | `EventPersonDetailsQuery` | Keep as is |
| My Schedule · My contacts | `/my-contacts` | Contacts by date, Message/Pending buttons, search, export, "Pending connections (n)" | `MyContacts_ContactsQuery`, `MyContacts_PendingConnections` | Keep; feed into inbox |
| My Schedule · My bookmarks | | Bookmarked companies, wish list (opportunities) | `EventBookmarkedExhibitorsQuery` | Low value |
| Agenda | `/plannings/<viewId>` | Day tabs; long cards (title, description, seats, time, place, format, tags, speakers, Add to schedule). Filters: Session, Location, Topic; time zone, 12/24h; "Your schedule" mini list | `PlanningListViewConnectionQuery` (per day), `EventPlanningListViewNavigationQuery`, `EventPlanningListViewBookmarkedPlannings` | Replaced by ghost sessions in Calendar; keep page for search |
| Session detail | `/planning/<id>` | Big placeholder banner, seats, time + conflict warning, place, tags, **Add to schedule**, information, **registered attendees**, similar sessions, public channel | `EventPlanningDetailsViewQuery`, `PlanningEventDetailsAllAttendeesQuery`, `EventSimilarPlanningDetailsQuery` | Content goes into the calendar hover/popover |
| Attendees | `/people/<viewId>` | "Online now" carousel; 1-column list (~5 per screen): photo, name, title, org, Connect. Left: search, filters (Available to meet by day/slot, Career stage, Areas of interest/expertise, Affiliation groups, Country), Need to meet? / Book a meeting / Manage availability / "+8550 meeting requests sent", My visibility toggle, Your connections | `EventPeopleListViewConnectionQuery {viewId, search, selectedFilters:[{mustEventFiltersIn, mustHaveTimeSlotIds}], sort}` | Densify; clicks open the profile drawer |
| Speakers | `/people/<viewId>` | Same component as Attendees, card grid | same query, other viewId | Same treatment |
| Person profile | `/person/<id>` | Full page: photo, name, title, org, **Meet**, **Connect**; upcoming meetings with you; About (truncated, "See more"); Career stage; Areas of interest/expertise; Affiliation groups; "What I'm hoping to get out of the event"; "How I can help others"; Country; Job seeking; Collaboration prefs; social links (LinkedIn) at the bottom; sessions they're attending. Right: embedded chat "Talk to X", Lead qualification, Context (connected date), export/delete contact | `EventPersonDetailsQuery`, `EventPersonExplanationsQuery`, `ConnectionInfoQuery`, `CreateChannel` (get-or-create DM) | **Reuse in a drawer** (their page, chrome hidden) |
| Meet modal | modal | 4 steps: Participants (Add, up to 24) · Date & time (chips of **mutual** free slots, "See more slots" = day columns) · Location (meeting points for that slot, or "Alternative location, organize via DM") · Description · Send meeting request | `ConnectMeetModalQuery`, `MeetSlotsQuery`, `MeetFirstLastSlotQuery`, `MeetSlotsAvailableQuery`, `MeetPlacesQuery`, `MeetParticipantsQuery` | **Replace step 2's chips** with a calendar of your day + mutual slots; keep the rest of their modal |
| Book a meeting | modal (Attendees sidebar) | Same modal opened at "Select participants" | `MeetParticipantsQuery {connected, eventId, search}` | Reuse |
| Manage availability | modal | Per-day list of 25-min slots: available (green ✓), booked (purple, "Meeting with X"), disabled | `ManageAvailabilitySlotsQuery {eventId, dateRange, timezone}` → `meetingSlotsByDayWithState.slotsByDay[].slots[{id, starts, ends, state, blockingMeeting}]` | Later: paint into calendar |
| Meeting detail | `/meeting/<id>` | Title, time, place, status, participants (Message), Reschedule, Decline; floating **Discussion** chat popup | `MeetingDetailsV2`, `MeetingDetailsV2_AvailableMeetingSlots` | Reuse via drawer |
| Notifications | drawer (bell) | "Connection requests" (message, Accept/Decline inline), "Meeting requests", "Activities" (meeting accepted, new contact...), Mark all as read. Opening resets the counter | `ConnectionRequestsList`, `MeetingRequestsList`, `ActivitiesList`, `NotSeen*Count`, `ResetNotificationCounter` | Data feeds unified inbox; drawer styling reused |
| Messages | `/messages/channel/<uuid>` | 3 columns: thread list (search, compose) · conversation · person summary (Open profile, create group, mute) | chat: `ChannelUserList`, `OwnedChannelQuery`, `ChannelHeader`, `MentionsQuery`, `PostMessage` | **Base of our Inbox** |
| Organization Fair | `/exhibitors/<viewId>` | Exhibitors grouped by cause area, bookmark | `EventExhibitorListViewConnectionQuery` | Leave |
| Opportunities Board | `/products/<viewId>` | Job listings, category chips, filters, bookmark ("wish list") | `EventProductListViewConnectionQuery` | Leave |
| Venue Map, Satellite Events, Slack | external links (Drive PDF, Google Doc, Slack) | | | Leave |
| EAG Matcher | external (matcher.eaglobal.org) | | | Leave |
| Avatar menu | dropdown | Edit profile; My contacts / My schedule / My bookmarks; Organizing events?; Settings; Contact app support; Resource center; Legal; Log out | | Leave |

## 3. Reusable components and tokens

Theme (light): font Work Sans; weights 400/500/600; radius sm 4 / md 8 / lg 16 / xl 32; shadow sm/md/lg; colors primary #000, tertiary #647693 (container #e3e8f2), surface #FFF / variant #FAFAFA / disabled #EEE, outline #E0E0E0, success #026d68 (container #d7f5f1), warning #b2701b (container #f7eed5), danger #b3371b (container #fce9d8), recommendation #7033bd, notification #d1481d; spacing 4/8/12/16/20/24/32/40/48; zIndex modal 1000, topBar 100.

| Component (displayName prefix) | Where | Reuse |
|---|---|---|
| `timeline-block__BlockWrapper`, `schedule-item__ItemLink`, `meeting-item__Container/HeaderRow/Name`, `hour-line__Line`, `styles__ColumnsWrapper`, `date-navigation__*` | Calendar | Clone their block markup for ghost sessions |
| `button__Wrapper/Content` | everywhere | Copy class list onto our buttons |
| `chip__Wrapper/SpanWrapper` | tags, slots | Tag chips in profile panel |
| `item-with-icon__*` | details rows | Time/place rows |
| `aside__Aside`, `main__Main`, `wrapper__Wrapper` | 3-column template | Layout |
| `connections__PersonCard`, `list__Wrapper` | people lists | Inbox rows |
| Notification drawer, Meet modal, Discussion popup | overlays | Trigger theirs where possible |

## 4. Data operations

Persisted-query hashes as of 2026-10-15 (perishable). We prefer our own query text through their Apollo client.

**Queries**: `MySchedule_EventScheduleQuery` · `EventScheduleViewQuery` · `PlanningListViewConnectionQuery` · `EventPlanningListViewNavigationQuery` (day aggregation ids are base64 `{"data":{"range":[startUnix,endUnix]}}`) · `EventPersonDetailsQuery` · `EventPeopleListViewConnectionQuery` · `ConnectMeetModalQuery` · `MeetSlotsQuery {eventId, peopleIds, exhibitorIds, dateRange{start,end}, first}` → `event.availableMeetingSlots.nodes[{id, starts, ends}]` (mutual free slots) · `MeetPlacesQuery {eventId, slotId, peopleIds}` → `availableMeetingSlots(slotIds).nodes[].places[]` · `ManageAvailabilitySlotsQuery` · `ConnectionRequestsList` → `Core_requests` style nodes `{id, user{…}, eventPerson{id}, message, sentAt, seen, status}` · `MeetingRequestsList` → `Core_requests(filters:{shouldRequestTypeIn: MEETING_REQUEST, shouldRequestStatusIn: PENDING})` with `MeetingRequestFragment` (`… on Core_MeetingRequestReceived { meeting { beginsAt endsAt place participants userAgendaConflicts } }`) · `ActivitiesList` · `MyContacts_ContactsQuery` · `MeetingDetailsV2` · chat `ChannelUserList {userId, offset, hideEmptyChats}` → `viewer.ownedUsers[0].channelsUsers[]` (`ChannelUserCardFragment`: notSeenMessageCount, channel{ id, channelUsers{user…}, messages(limit 1) }) · `OwnedChannelQuery` (messages, 40 per page).

**Mutations** (80 in bundle; the ones we use):
- `Core_createMeeting(input: {eventId, participants:[{id: eventPersonId, message}], slotId, placeId, description})` (PersonSendRequestMutation)
- `Core_sendConnectionRequest(data: {userId, eventId, communityId, message})` (PersonConnectMutation)
- `Core_acceptRequest(id)` / `Core_declineRequest(id)` (meeting + connection requests)
- `Core_bookmarkPlanning(id, eventId)` (add/remove session from schedule; toggles)
- `UpdateMeetingParticipation {meetingParticipantId, status: GOING|NOT_GOING}`
- chat `postMessage(asUserId, message: CreateMessageInput)`
- Others available: CancelMeeting, MeetingDetails_rescheduleMeeting, UpdateMeetingDescriptionMutation, ManageAvailabilityUpdateSlotsMutation (`Core_updatePersonMeetingSlotsDisabled`), MarkActivityAsSeen, ResetNotificationCounter, SwitchVisibilityAttendee, ConnectionInfo_UpdateRatingTagsAndNotes, OwnedDeclareLatestMessageSeen.

## 5. Cruft

- Event home's duplicate link list, decorative venue-map image.
- "Online now" carousel on Attendees/Speakers.
- "Need to meet? / +8550 meeting requests already sent!" promo box.
- Session detail placeholder banner (title rendered as an image area).
- Lead qualification box on profiles.
- Content centred in ~1290px on wide screens; huge row heights in lists.
- Bio truncated behind "See more"; LinkedIn buried at the bottom.
- Profile, meeting, session all full-page navigations; Back loses list scroll position.
- Agenda and My Schedule are separate long lists; agenda never shows your meetings.
- Booking time picker shows chips with no view of your day.

## 6. Reuse decisions (from this catalogue)

| Need | Swapcard already has | Plan |
|---|---|---|
| Calendar with unattended sessions in grey | My Schedule Calendar (3 days, meetings + your sessions) | **Mod**: inject grey session blocks into their columns using their block classes; hover card from session data; click = `Core_bookmarkPlanning` |
| Unified inbox | Messages page (3 columns) + bell drawer data | **Mod Messages page**: prepend meeting + connection requests to the thread list; right aside becomes the full profile with Accept/Decline/Connect/Meet |
| Inline profile, no navigation | Person page; Messages right aside | **Drawer** that renders their person page (same-origin iframe with chrome hidden, so all their buttons work), intercepting person links everywhere |
| Book with mutual availability | Meet modal already computes mutual slots | **Mod step 2 only**: replace chips with a day calendar (your meetings + sessions as context, mutual slots highlighted); selecting calls their own slot click so the rest of their modal is untouched |
| Cruft removal | n/a | CSS + small DOM hides |
| Feedback | none | Ours: floating button, capture + markup, send to Tally |
