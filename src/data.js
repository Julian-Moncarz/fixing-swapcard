// Calmer Card data layer: our own GraphQL, sent through Swapcard's Apollo client.
// Field names come from Swapcard's bundle (see CATALOG.md section 4).
(() => {
  const CC = window.CalmerCard;
  if (!CC || CC.data) return;

  const Q = {
    event: `query CalmerCardEvent($slug: String!) {
      event: Core_event(slug: $slug) {
        _id slug title timezone beginsAt endsAt
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
            id beginsAt endsAt place type format htmlDescription maxSeats remainingSeats
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
        ... on Core_Planning { id beginsAt endsAt place withEvent(eventId: $eventId) { title } }
        ... on Core_UserMeetingBooked {
          id starts ends
          meeting {
            id status beginsAt endsAt
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

    requests: `query CalmerCardRequests {
      reqs: Core_requests(cursor: { first: 100 }, filters: { shouldRequestStatusIn: PENDING }) {
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
            meeting { id beginsAt(format: ISO8601) endsAt(format: ISO8601) place { id name } }
          }
          ... on Core_MeetingRequestSent {
            meeting { id beginsAt(format: ISO8601) endsAt(format: ISO8601) place { id name } }
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
      if (!ev) return [];
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

    // Pending requests for the current event (meeting + connection, received + sent).
    async requests() {
      const ev = await data.event();
      return cached('requests', 20e3, async () => {
        const r = await CC.query(Q.requests, {});
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
            personId: n.eventPerson && n.eventPerson.id,
            user: n.user || {},
            meeting: n.meeting ? {
              id: n.meeting.id,
              start: new Date(n.meeting.beginsAt),
              end: new Date(n.meeting.endsAt),
              place: n.meeting.place && n.meeting.place.name,
            } : null,
          }))
          .sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));
      });
    },

    async mutualSlots(personIds) {
      const ev = await data.event();
      const start = new Date(new Date(ev.beginsAt.replace(' ', 'T') + 'Z').getTime() - 36e5 * 24);
      const end = new Date(new Date(ev.endsAt.replace(' ', 'T') + 'Z').getTime() + 36e5 * 24);
      const r = await CC.query(Q.mutualSlots, {
        eventId: ev.id,
        peopleIds: personIds,
        dateRange: { start: start.toISOString(), end: end.toISOString() },
      });
      return r.event.availableMeetingSlots.nodes.map((s) => ({ id: s.id, start: new Date(s.starts), end: new Date(s.ends) }));
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
