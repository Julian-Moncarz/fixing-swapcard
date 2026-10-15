# Raw findings (working notes, folded into CATALOG.md)

## Transport
- Main API: POST https://app.swapcard.com/api/graphql, batched arrays, Apollo persisted queries (sha256 hash, no query text).
- Required headers: accept, content-type, x-client-version, x-client-platform, x-feature-flags, x-client-origin, authorization. Cookie alone gets NOT_ALLOWED.
- Copying the headers from the page's own fetch and replaying works.
- Server ALSO accepts arbitrary query text (no safelist). Introspection disabled. Field names readable in JS bundles (gql template literals, fragments interpolated).
- Chat API: https://chat-api.swapcard.com/graphql, sends full query text (not persisted).
- Main-app Apollo client NOT on window; `window.__APOLLO_CLIENT__` is the chat client.
- Next.js app (`__NEXT_DATA__`), styled-components with readable displayName prefixes: `[class*="meeting-item__Container"]` etc.
- Font: "Work Sans", Arial, Helvetica, sans-serif.

## IDs (EAG NYC 2026)
- eventId RXZlbnRfNDUyNzE2NQ== ; attendee view RXZlbnRWaWV3XzE3NzIxMzg= ; agenda view RXZlbnRWaWV3XzE3NzIxMzY=
- Day aggregation ids = base64 {"data":{"range":[startUnix,endUnix]}}; from EventPlanningListViewNavigationQuery.

## Operations observed (name, hash prefix, vars)
- MySchedule_EventScheduleQuery 34eef8e4 {withEvent,eventId} -> data.agenda[] union Core_UserMeetingBooked{meeting{...participants, meetingPlace, status, userParticipant}} | Core_Planning{beginsAt,endsAt,place,htmlDescription,withEvent.title,categories,remainingSeats,maxSeats}
- EventScheduleViewQuery 2d357631 {withEvent,eventId,eventPersonId,now} -> agenda + meetings[] Core_HostMeeting{starts,ends,isAvailable} (my own slots)
- NewNotifications 759295e4 {withEvent,eventId,createdAfter} -> activities.nodes (Core_MeetingActivity ...), connectionRequests.nodes, meetingRequests.nodes
- NotificationCounter 5d3a070c {}
- ActivitiesList d5256c2d, ConnectionRequestsList e7517226 {first}, MeetingRequestsList 28f35623 {withEvent,first,eventId}, NotSeen*Count, ResetNotificationCounter (mutation, fires on opening bell)
- PlanningListViewConnectionQuery 0953a657 {eventId,withEvent,viewId,timezone,aggregationsIds:[day],after,first} -> view.plannings.nodes[] (sessions) + pageInfo
- EventPlanningListViewNavigationQuery da68f6de {viewId,timezone} -> day aggregation ids
- EventPersonDetailsQuery fe25b599 {skipMeetings,withEvent,withHostedBuyerView,planningsSize,personId,userId,...} (full profile)
- EventPersonExplanationsQuery, PersonUserId, ConnectionInfoQuery {connectionId,eventIds}, ConnectionsQuery {search}
- ConnectMeetModalQuery f1f2b393 {personId,eventId,skipMeet} -> person + canMeet + availableMeetingSlots.totalCount
- MeetSlotsQuery 8be60e0a {eventId,peopleIds,exhibitorIds,dateRange{start,end},first:1152} -> event.availableMeetingSlots.nodes[{id,starts,ends}]  (MUTUAL free slots)
- MeetFirstLastSlotQuery a901ced4, MeetSlotsAvailableQuery ba81daf1
- MeetPlacesQuery {eventId,slotId,peopleIds,exhibitorIds} -> availableMeetingSlots(slotIds:[slotId]).nodes[].places[]
- Chat: UnreadMessages, ChannelUserList {offset,userId,hideEmptyChats}, ChannelHeader, OwnedChannelQuery {before,channelId,userId}, MentionsQuery, CreateChannel (get-or-create DM; fires when opening a profile)

## Mutations (from bundle text)
- PersonSendRequestMutation: Core_createMeeting(input: Core_CreateMeetingInput!) ; input = {eventId, participants:[{id: eventPersonId, message}], slotId, placeId, description}
- PersonConnectMutation: Core_sendConnectionRequest(data:{userId, eventId, communityId, message})
- AcceptRequest / DeclineRequest: Core_acceptRequest(id) / Core_declineRequest(id) (works for meeting + connection requests via Core_RequestInterface)
- PersonDetails_Accept/DeclineConnectionRequestMutation (same fields)
- PlanningBookmarkMutation: Core_bookmarkPlanning(id: planningId, eventId) (toggle add-to-schedule)
- UpdateMeetingParticipation family: input {meetingParticipantId, status: GOING|NOT_GOING}
- PostMessage (chat), CancelMeeting, MeetingDetails_rescheduleMeeting, UpdateMeetingDescriptionMutation {meetingId, description}
- Full list of 80 mutations captured in catalogue.

## UI observations
- My Schedule has a Calendar appearance (3 day columns, 2px per minute, absolute blocks `timeline-block__BlockWrapper`, top = minutes since midnight * 2). Shows meetings (green confirmed / orange pending / invitation) + sessions in schedule. No unattended sessions.
- Bell panel: Connection requests (Accept/Decline inline) + Activities (meeting accepted, new contact...) list.
- Messages page: 3 columns (thread list, conversation, person summary w/ "Open profile").
- Person page: full page; Meet button opens 4-step modal (Participants, Date & time chips of MUTUAL slots, Location, Description, Send). "See more slots" = day columns of chips. Right column: embedded chat "Talk to X", lead qualification, context.
- EAG Matcher is external (matcher.eaglobal.org), blocked by user's Cold Turkey.
