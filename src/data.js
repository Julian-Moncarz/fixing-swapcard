// Calmer Card data layer: our own GraphQL, sent through Swapcard's Apollo client.
// Field names come from Swapcard's bundle (see CATALOG.md section 4).
(() => {
  const CC = window.CalmerCard;
  if (!CC || CC.data) return;

  const Q = {
    event: `query CalmerCardEvent($slug: String!) {
      event: Core_event(slug: $slug) {
        _id slug title timezone beginsAt(format: ISO8601) endsAt(format: ISO8601)
        community { id }
        eventPerson { id userId }
        contents { views { __typename ... on Core_EventPlanningListView { id } ... on Core_EventPeopleListView { id } } }
      }
    }`,

    sessions: `query CalmerCardSessions($viewId: ID!, $eventId: ID!, $tz: String!) {
      view: Core_eventPlanningListView(viewId: $viewId) {
        id
        plannings(timezone: $tz, cursor: { first: 500 }) {
          totalCount
          nodes {
            id beginsAt(format: ISO8601) endsAt(format: ISO8601) place type format htmlDescription maxSeats remainingSeats
            categories { name }
            withEvent(eventId: $eventId) {
              title
              bookmark { isBookmarked canBookmark }
              firstSpeakers { id firstName lastName organization }
            }
          }
        }
      }
    }`,

    agenda: `query CalmerCardAgenda($eventId: ID!) {
      agenda: Core_myEventAgendaV2(eventId: $eventId) {
        __typename
        ... on Core_Planning { id beginsAt(format: ISO8601) endsAt(format: ISO8601) place withEvent(eventId: $eventId) { title } }
        ... on Core_UserMeetingBooked {
          id starts ends
          meeting {
            id status beginsAt(format: ISO8601) endsAt(format: ISO8601)
            place { id name }
            participants { id status person { id firstName lastName } }
          }
        }
      }
    }`,

    person: `query CalmerCardPerson($id: ID!, $eventId: ID!) {
      person: Core_eventPersonDetails(id: $id, eventId: $eventId) {
        id userId firstName lastName photoUrl jobTitle organization biography websiteUrl
        socialNetworks { type profile }
        userInfo { id connectionStatus hasSentRequest hasReceivedRequest isSelf }
        withEvent(eventId: $eventId) {
          id canMeet
          fields {
            __typename
            ... on Core_TextField { definition { id name } value { id text } }
            ... on Core_LongTextField { definition { id name } value { id longText } }
            ... on Core_SelectField { definition { id name } value { id text } }
            ... on Core_UrlField { definition { id name } value { id url } }
            ... on Core_MultipleTextField { definition { id name } values { id text } }
            ... on Core_MultipleSelectField { definition { id name } values { id text } }
          }
        }
      }
    }`,

    session: `query CalmerCardSession($id: ID!, $eventId: ID!) {
      planning: Core_planning(_id: $id, eventId: $eventId) {
        id beginsAt(format: ISO8601) endsAt(format: ISO8601) place format htmlDescription maxSeats remainingSeats
        categories { name }
        withEvent(eventId: $eventId) {
          title
          bookmark { isBookmarked canBookmark }
          firstSpeakers { id firstName lastName jobTitle organization photoUrl }
          attendeeProfiles(cursor: { first: 100 }) { totalCount nodes { id firstName lastName jobTitle organization photoUrl } }
        }
      }
    }`,

    chats: `query CalmerCardChats($userId: String!) {
      viewer {
        ownedUsers(ids: [$userId]) {
          id
          channelsUsers(pagination: { limit: 100, offset: 0 }, hideEmptyChat: true) {
            id notSeenMessageCount isMuted
            channel {
              id type name imageUrl
              channelUsers(pagination: { limit: 10, offset: 0 }) {
                id userId hasLeaved
                user { id externalRessource(useCommunityProfile: true) { id displayName pictureUrl } }
                profileRedirection { __typename ... on EventProfileRedirection { id eventSlug } }
              }
              messages(pagination: { limit: 1 }) { id content createdAt userId }
            }
          }
        }
      }
    }`,

    meeting: `query CalmerCardMeeting($id: ID!) {
      meeting: Core_meeting(id: $id) {
        id status description
        beginsAt(format: ISO8601) endsAt(format: ISO8601)
        place { id name }
        userParticipant { id status isOrganizer }
        participants { id status isOrganizer person { id firstName lastName photoUrl jobTitle organization } }
      }
    }`,

    requests: `query CalmerCardRequests($status: Core_RequestStatus!) {
      reqs: Core_requests(cursor: { first: 100 }, filters: { shouldRequestStatusIn: [$status] }) {
        totalCount
        nodes {
          __typename
          ... on Core_RequestInterface {
            id message sentAt(format: ISO8601) seen status
            eventPerson { id }
            event { id: _id slug }
            user { firstName lastName jobTitle organization photoUrl }
          }
          ... on Core_MeetingRequestReceived {
            meeting { id description beginsAt(format: ISO8601) endsAt(format: ISO8601) place { id name } }
          }
          ... on Core_MeetingRequestSent {
            meeting { id description beginsAt(format: ISO8601) endsAt(format: ISO8601) place { id name } }
          }
        }
      }
    }`,

    mutualSlots: `query CalmerCardSlots($eventId: ID!, $peopleIds: [ID!], $dateRange: Core_DateRangeInput) {
      event: Core_event(_id: $eventId) {
        _id
        availableMeetingSlots(peopleIds: $peopleIds, cursor: { first: 1000 }, dateRange: $dateRange) {
          nodes { id starts ends }
        }
      }
    }`,

    // Attendee search, as on Swapcard's Attendees page. Cards' ids are event person ids.
    searchPeople: `query CalmerCardSearchPeople($viewId: ID!, $search: String) {
      view: Core_eventPeopleListView(viewId: $viewId, search: $search) {
        id
        people: peopleViewFeaturedCards(cursor: { first: 8 }) {
          nodes { id firstName lastName photoUrl jobTitle organization }
        }
      }
    }`,

    // Everyone you're connected to at this event (Swapcard's My contacts), newest first.
    contacts: `query CalmerCardContacts($filter: Core_ListConnectionsFilterInput!, $after: String) {
      contacts: Core_listConnections(filter: $filter, cursor: { first: 100, after: $after }) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          ... on Core_EventPerson {
            id firstName lastName photoUrl jobTitle organization
            connectionInfo { connectedAt }
          }
        }
      }
    }`,

    // Your 25-minute 1:1 slots per day: AVAILABLE, DISABLED (you marked it unavailable) or
    // BLOCKED_BY_MEETING. Same fields as Swapcard's Manage availability modal.
    availability: `query CalmerCardAvailability($eventId: ID!, $dateRange: Core_DateRangeInput!, $timezone: String) {
      event: Core_event(_id: $eventId) {
        id: _id
        eventPerson {
          id
          withEvent(eventId: $eventId) {
            id
            meetingSlotsByDayWithState(dateRange: $dateRange, timezone: $timezone) {
              slotsByDay { day slots { id starts(format: ISO8601) ends(format: ISO8601) state } }
            }
          }
        }
      }
    }`,

    places: `query CalmerCardPlaces($eventId: ID!, $slotId: ID!, $peopleIds: [ID!]) {
      event: Core_event(_id: $eventId) {
        _id
        availableMeetingSlots(slotIds: [$slotId], peopleIds: $peopleIds, cursor: { first: 1 }) {
          nodes { id places { id name group isVirtual } }
        }
      }
    }`,
  };

  const M = {
    bookmark: `mutation CalmerCardBookmark($id: ID!, $eventId: ID!) {
      planning: Core_bookmarkPlanning(id: $id, eventId: $eventId) {
        id withEvent(eventId: $eventId) { bookmark { isBookmarked canBookmark } }
      }
    }`,
    accept: `mutation CalmerCardAccept($id: ID!) {
      Core_acceptRequest(id: $id) { ... on Core_RequestInterface { id status } }
    }`,
    decline: `mutation CalmerCardDecline($id: ID!) {
      Core_declineRequest(id: $id) { ... on Core_RequestInterface { id status } }
    }`,
    connect: `mutation CalmerCardConnect($eventId: ID, $communityId: ID, $userId: ID!, $message: String) {
      Core_sendConnectionRequest(data: { userId: $userId, eventId: $eventId, communityId: $communityId, message: $message }) {
        id eventPerson { id userInfo { id connectionStatus hasSentRequest } }
      }
    }`,
    cancelMeeting: `mutation CalmerCardCancelMeeting($id: ID!) {
      Core_cancelMeetingV2(meetingId: $id) { id }
    }`,
    reschedule: `mutation CalmerCardReschedule($input: Core_RescheduleMeetingInput!) {
      r: Core_rescheduleMeeting(input: $input) { errors { message } meeting { id status } }
    }`,
    participation: `mutation CalmerCardParticipation($input: Core_UpdateMeetingParticipationInput!) {
      u: Core_updateMeetingParticipation(input: $input) { errors { message } meeting { id status } }
    }`,
    setSlotsDisabled: `mutation CalmerCardSetSlotsDisabled($input: Core_UpdatePersonMeetingSlotsDisabledInput!) {
      u: Core_updatePersonMeetingSlotsDisabled(input: $input) { person { id } }
    }`,
    createMeeting: `mutation CalmerCardCreateMeeting($input: Core_CreateMeetingInput!) {
      Core_createMeeting(input: $input) { errors { message } meeting { id } }
    }`,
  };

  // Swapcard's own query names, refetched after our mutations so their UI stays in sync.
  const SWAPCARD_REFETCH = {
    schedule: ['MySchedule_EventScheduleQuery', 'EventScheduleViewQuery', 'EventPlanningListViewBookmarkedPlannings'],
    requests: ['ConnectionRequestsList', 'MeetingRequestsList', 'NotSeenConnectionRequestCount', 'NotSeenMeetingRequestCount', 'NotificationCounter', 'MySchedule_EventScheduleQuery'],
    person: ['EventPersonDetailsQuery', 'ConnectMeetModalQuery'],
  };

  const memo = new Map();
  const cached = (key, ttlMs, fn) => {
    const hit = memo.get(key);
    if (hit && Date.now() - hit.t < ttlMs) return hit.p;
    const p = fn().catch((e) => { memo.delete(key); throw e; });
    memo.set(key, { t: Date.now(), p });
    return p;
  };
  const invalidate = (prefix) => { for (const k of memo.keys()) if (k.startsWith(prefix)) memo.delete(k); };

  const data = (CC.data = {
    Q, M, invalidate,

    async event(slug = CC.route().slug) {
      if (!slug) return null;
      return cached('event:' + slug, 30 * 60e3, async () => {
        const { event } = await CC.query(Q.event, { slug }, { fetchPolicy: 'cache-first' });
        const views = (event.contents && event.contents.views) || [];
        return {
          id: event._id,
          slug: event.slug,
          title: event.title,
          timezone: event.timezone,
          beginsAt: event.beginsAt,
          endsAt: event.endsAt,
          communityId: event.community && event.community.id,
          me: event.eventPerson, // { id, userId }
          agendaViewId: (views.find((v) => v.__typename === 'Core_EventPlanningListView') || {}).id,
          peopleViewIds: views.filter((v) => v.__typename === 'Core_EventPeopleListView').map((v) => v.id),
        };
      });
    },

    async sessions() {
      const ev = await data.event();
      if (!ev || !ev.agendaViewId) return [];
      return cached('sessions:' + ev.id, 60e3, async () => {
        const r = await CC.query(Q.sessions, { viewId: ev.agendaViewId, eventId: ev.id, tz: ev.timezone });
        return r.view.plannings.nodes.map((n) => ({
          id: n.id,
          title: n.withEvent.title,
          start: new Date(n.beginsAt),
          end: new Date(n.endsAt),
          place: n.place,
          format: n.format,
          html: n.htmlDescription,
          maxSeats: n.maxSeats,
          remainingSeats: n.remainingSeats,
          tags: (n.categories || []).map((c) => c.name),
          speakers: n.withEvent.firstSpeakers || [],
          attending: !!(n.withEvent.bookmark && n.withEvent.bookmark.isBookmarked),
          canBookmark: !!(n.withEvent.bookmark && n.withEvent.bookmark.canBookmark),
        }));
      });
    },

    // My agenda: booked meetings and sessions I'm attending, normalised to {kind, start, end, title}.
    async agenda() {
      const ev = await data.event();
      // Not registered for this event (or no event in the URL): nothing to show.
      if (!ev || !ev.me) return [];
      return cached('agenda:' + ev.id, 30e3, async () => {
        const r = await CC.query(Q.agenda, { eventId: ev.id });
        return r.agenda.map((a) => {
          if (a.__typename === 'Core_UserMeetingBooked') {
            const others = (a.meeting.participants || []).filter((p) => p.person && p.person.id !== ev.me.id);
            return {
              kind: 'meeting',
              id: a.meeting.id,
              status: a.meeting.status,
              start: new Date(a.meeting.beginsAt || a.starts),
              end: new Date(a.meeting.endsAt || a.ends),
              title: others.length ? 'Meeting with ' + others.map((p) => p.person.firstName).join(', ') : 'Meeting',
              personIds: others.map((p) => p.person.id),
              place: a.meeting.place && a.meeting.place.name,
            };
          }
          return {
            kind: 'session',
            id: a.id,
            start: new Date(a.beginsAt),
            end: new Date(a.endsAt),
            title: (a.withEvent && a.withEvent.title) || 'Session',
            place: a.place,
          };
        }).sort((x, y) => x.start - y.start);
      });
    },

    async person(personId) {
      const ev = await data.event();
      return cached('person:' + personId, 60e3, async () => {
        const { person } = await CC.query(Q.person, { id: personId, eventId: ev.id });
        const fields = ((person.withEvent && person.withEvent.fields) || []).map((f) => {
          const name = f.definition && f.definition.name;
          let value = null;
          if (f.values) value = f.values.map((v) => v.text).filter(Boolean);
          else if (f.value) value = f.value.longText || f.value.text || f.value.url || null;
          return { name, type: f.__typename, value };
        }).filter((f) => f.name && f.value && (!Array.isArray(f.value) || f.value.length));
        return { ...person, fields, canMeet: !!(person.withEvent && person.withEvent.canMeet) };
      });
    },

    // Your chat conversations (Swapcard's chat API), newest first.
    async chats() {
      const ev = await data.event();
      if (!ev || !ev.me) return [];
      return cached('chats:' + ev.id, 15e3, async () => {
        const r = await CC.query(Q.chats, { userId: ev.me.userId }, { client: 'chat' });
        const me = ev.me.userId;
        const owned = (r.viewer && r.viewer.ownedUsers && r.viewer.ownedUsers[0]) || {};
        return (owned.channelsUsers || []).map((cu) => {
          const ch = cu.channel;
          const others = ch.channelUsers.filter((u) => u.userId !== me && !u.hasLeaved);
          const o = others[0] || {};
          const prof = o.user && o.user.externalRessource;
          const redir = o.profileRedirection || {};
          const last = ch.messages[0];
          return {
            channelId: ch.id,
            isGroup: others.length > 1,
            title: others.length > 1 ? (ch.name || others.map((u) => u.user && u.user.externalRessource && u.user.externalRessource.displayName).filter(Boolean).join(', ')) : (prof && prof.displayName) || ch.name || 'Conversation',
            photoUrl: others.length > 1 ? ch.imageUrl : prof && prof.pictureUrl,
            userId: o.userId,
            personId: redir.eventSlug === ev.slug ? redir.id : null,
            unread: cu.notSeenMessageCount || 0,
            muted: !!cu.isMuted,
            last: last ? { text: last.content || '', at: new Date(last.createdAt), fromMe: last.userId === me } : null,
          };
        });
      });
    },

    async session(id) {
      const ev = await data.event();
      const { planning: p } = await CC.query(Q.session, { id, eventId: ev.id });
      const w = p.withEvent || {};
      return {
        id: p.id,
        title: w.title,
        start: new Date(p.beginsAt),
        end: new Date(p.endsAt),
        place: p.place,
        format: p.format,
        html: p.htmlDescription,
        maxSeats: p.maxSeats,
        remainingSeats: p.remainingSeats,
        tags: (p.categories || []).map((c) => c.name),
        attending: !!(w.bookmark && w.bookmark.isBookmarked),
        canBookmark: !!(w.bookmark && w.bookmark.canBookmark),
        speakers: w.firstSpeakers || [],
        attendees: (w.attendeeProfiles && w.attendeeProfiles.nodes) || [],
        attendeeCount: (w.attendeeProfiles && w.attendeeProfiles.totalCount) || 0,
      };
    },

    async meeting(id) {
      const ev = await data.event();
      const { meeting: m } = await CC.query(Q.meeting, { id });
      const me = m.userParticipant || {};
      const myId = ev && ev.me && ev.me.id;
      const others = (m.participants || []).filter((p) => p.person && p.person.id !== myId);
      return {
        id: m.id,
        status: m.status, // PENDING | CONFIRMED | DECLINED | CANCELED …
        description: m.description,
        start: new Date(m.beginsAt),
        end: new Date(m.endsAt),
        place: m.place && m.place.name,
        myParticipantId: me.id,
        myStatus: me.status,
        iOrganized: !!me.isOrganizer,
        others: others.map((p) => ({ ...p.person, participantStatus: p.status, isOrganizer: p.isOrganizer })),
      };
    },

    // Pending requests for the current event (meeting + connection, received + sent).
    requests() { return data.requestsWithStatus('PENDING'); },
    // Declined ones (by you or by them), so those people stay findable in the Inbox.
    declinedRequests() { return data.requestsWithStatus('DECLINED'); },
    async requestsWithStatus(status) {
      const ev = await data.event();
      return cached('requests:' + status + ':' + ((ev && ev.id) || ''), 20e3, async () => {
        const r = await CC.query(Q.requests, { status });
        return r.reqs.nodes
          .filter((n) => n.id && (!n.event || !ev || n.event.id === ev.id || n.event.slug === ev.slug))
          .map((n) => ({
            id: n.id,
            type: n.__typename.replace('Core_', ''), // ConnectionRequestReceived, MeetingRequestReceived, ...
            incoming: /Received$/.test(n.__typename),
            isMeeting: /Meeting/.test(n.__typename),
            message: n.message,
            sentAt: n.sentAt ? new Date(n.sentAt) : null,
            seen: n.seen,
            declined: n.status === 'DECLINED',
            personId: n.eventPerson && n.eventPerson.id,
            user: n.user || {},
            meeting: n.meeting ? {
              id: n.meeting.id,
              start: new Date(n.meeting.beginsAt),
              end: new Date(n.meeting.endsAt),
              place: n.meeting.place && n.meeting.place.name,
              description: (n.meeting.description || '').trim(),
            } : null,
          }))
          .sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));
      });
    },

    async mutualSlots(personIds) {
      const ev = await data.event();
      // A day either side of the event, so early and late slots are included.
      const start = new Date(new Date(ev.beginsAt).getTime() - 36e5 * 24);
      const end = new Date(new Date(ev.endsAt).getTime() + 36e5 * 24);
      const r = await CC.query(Q.mutualSlots, {
        eventId: ev.id,
        peopleIds: personIds,
        dateRange: { start: start.toISOString(), end: end.toISOString() },
      });
      return r.event.availableMeetingSlots.nodes.map((s) => ({ id: s.id, start: new Date(s.starts), end: new Date(s.ends) }));
    },

    // Attendees matching a name: [{ personId, name, photoUrl, sub }], yourself left out.
    async searchPeople(search) {
      const ev = await data.event();
      const viewId = ev && ev.peopleViewIds[0];
      if (!viewId || !search) return [];
      return cached('people:' + viewId + ':' + search.toLowerCase(), 60e3, async () => {
        const r = await CC.query(Q.searchPeople, { viewId, search });
        const nodes = (r.view && r.view.people && r.view.people.nodes) || [];
        return nodes.filter((n) => n && n.id && n.id !== (ev.me && ev.me.id)).map((n) => ({
          personId: n.id,
          name: [n.firstName, n.lastName].filter(Boolean).join(' ') || 'Someone',
          photoUrl: n.photoUrl,
          sub: [n.jobTitle, n.organization].filter(Boolean).join(' · '),
        }));
      });
    },

    // Your contacts at this event: [{ personId, name, firstName, photoUrl, sub, connectedAt }].
    async contacts() {
      const ev = await data.event();
      if (!ev) return [];
      return cached('contacts:' + ev.id, 60e3, async () => {
        const out = [];
        let after = null;
        for (let page = 0; page < 5; page++) { // up to 500; plenty for one event
          const r = await CC.query(Q.contacts, { filter: { eventId: ev.id }, after });
          const c = r.contacts;
          for (const n of c.nodes) {
            if (!n || !n.id) continue;
            out.push({
              personId: n.id,
              name: [n.firstName, n.lastName].filter(Boolean).join(' ') || 'Someone',
              firstName: n.firstName || '',
              photoUrl: n.photoUrl,
              sub: [n.jobTitle, n.organization].filter(Boolean).join(' · '),
              connectedAt: n.connectionInfo && n.connectionInfo.connectedAt ? new Date(n.connectionInfo.connectedAt) : null,
            });
          }
          if (!c.pageInfo || !c.pageInfo.hasNextPage) break;
          after = c.pageInfo.endCursor;
        }
        return out;
      });
    },

    // Your own 1:1 slots across the event, flattened: [{ id, start, end, state }].
    async availability() {
      const ev = await data.event();
      if (!ev || !ev.me) return [];
      return cached('avail:' + ev.id, 60e3, async () => {
        const start = new Date(new Date(ev.beginsAt).getTime() - 36e5 * 24);
        const end = new Date(new Date(ev.endsAt).getTime() + 36e5 * 24);
        const r = await CC.query(Q.availability, {
          eventId: ev.id, dateRange: { start: start.toISOString(), end: end.toISOString() }, timezone: ev.timezone,
        });
        const days = (r.event && r.event.eventPerson && r.event.eventPerson.withEvent
          && r.event.eventPerson.withEvent.meetingSlotsByDayWithState.slotsByDay) || [];
        return days.flatMap((d) => d.slots.map((x) => ({ id: x.id, start: new Date(x.starts), end: new Date(x.ends), state: x.state })));
      });
    },

    // Mark 1:1 slots unavailable (disabled = true) or available again. Slots taken by a meeting
    // can't be changed and should not be passed.
    async setSlotsDisabled(slotIds, disabled) {
      const ev = await data.event();
      if (!slotIds.length) return;
      await CC.mutate(M.setSlotsDisabled, { input: { eventId: ev.id, personId: ev.me.id, isDisabled: !!disabled, meetingSlotIds: slotIds } });
      invalidate('avail:');
      invalidate('slots:');
      CC.emit('availability-changed');
    },

    async places(slotId, personIds) {
      const ev = await data.event();
      const r = await CC.query(Q.places, { eventId: ev.id, slotId, peopleIds: personIds });
      const node = r.event.availableMeetingSlots.nodes[0];
      return (node && node.places) || [];
    },

    // ---- mutations (each one is something the user clicked) ----
    async toggleSession(sessionId) {
      const ev = await data.event();
      const r = await CC.mutate(M.bookmark, { id: sessionId, eventId: ev.id }, { refetch: SWAPCARD_REFETCH.schedule });
      invalidate('sessions:'); invalidate('agenda:');
      CC.emit('schedule-changed');
      return r.planning.withEvent.bookmark.isBookmarked;
    },
    async acceptRequest(id) {
      const r = await CC.mutate(M.accept, { id }, { refetch: SWAPCARD_REFETCH.requests });
      invalidate('requests'); invalidate('agenda:'); invalidate('person:');
      CC.emit('requests-changed');
      return r;
    },
    async declineRequest(id) {
      const r = await CC.mutate(M.decline, { id }, { refetch: SWAPCARD_REFETCH.requests });
      invalidate('requests'); invalidate('person:');
      CC.emit('requests-changed');
      return r;
    },
    async connect(userId, message) {
      const ev = await data.event();
      const r = await CC.mutate(M.connect, { userId, eventId: ev.id, communityId: ev.communityId, message: message || null }, { refetch: SWAPCARD_REFETCH.person });
      invalidate('person:');
      CC.emit('requests-changed');
      return r;
    },
    async cancelMeeting(id) {
      const r = await CC.mutate(M.cancelMeeting, { id }, { refetch: SWAPCARD_REFETCH.schedule.concat(SWAPCARD_REFETCH.requests) });
      invalidate('agenda:'); invalidate('requests');
      CC.emit('schedule-changed');
      return r;
    },
    async rescheduleMeeting({ meetingId, slotId, placeId, description }) {
      const r = await CC.mutate(M.reschedule, { input: { meetingId, slotId, placeId, description: description || '' } }, { refetch: SWAPCARD_REFETCH.schedule });
      const errs = r.r && r.r.errors;
      if (errs && errs.length) throw new Error(errs.map((e) => e.message).join('; '));
      invalidate('agenda:');
      CC.emit('schedule-changed');
      return r.r.meeting;
    },
    // status: 'GOING' | 'NOT_GOING' (how a participant accepts or declines a meeting).
    async setParticipation(meetingParticipantId, status) {
      const r = await CC.mutate(M.participation, { input: { meetingParticipantId, status } }, { refetch: SWAPCARD_REFETCH.schedule.concat(SWAPCARD_REFETCH.requests) });
      const errs = r.u && r.u.errors;
      if (errs && errs.length) throw new Error(errs.map((e) => e.message).join('; '));
      invalidate('agenda:'); invalidate('requests');
      CC.emit('schedule-changed');
      return r.u.meeting;
    },
    // Builds the same input Swapcard's own Meet modal sends.
    meetingInput({ eventId, personIds, slotId, placeId, message, description }) {
      return {
        eventId,
        participants: personIds.map((id) => ({ id, message: message || '' })),
        slotId,
        placeId,
        description: (description || '').trim(),
      };
    },
    async createMeeting(opts) {
      const ev = await data.event();
      const input = data.meetingInput({ ...opts, eventId: ev.id });
      const r = await CC.mutate(M.createMeeting, { input }, { refetch: SWAPCARD_REFETCH.schedule.concat(SWAPCARD_REFETCH.person) });
      const errs = r.Core_createMeeting && r.Core_createMeeting.errors;
      if (errs && errs.length) throw new Error(errs.map((e) => e.message).join('; '));
      invalidate('agenda:'); invalidate('requests');
      CC.emit('schedule-changed');
      return r.Core_createMeeting.meeting;
    },
  });
})();
