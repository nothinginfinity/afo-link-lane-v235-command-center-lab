// apps/afo-link-lane/universe-access.js
//
// Step 3B: centralized universe access-policy seam.
//
// This module is intentionally DB-free and imports nothing from chat-universe.js or
// worker.js, so both of those can import FROM it with no circular-import risk. It does
// not choose or hard-code an authentication provider: callers are responsible for
// validating credentials server-side (e.g. the existing LAB_INGEST_TOKEN check in
// chat-universe.js's requireAuth) and constructing an actor object from the result.
// This module only answers: given an already-validated actor, is this action on this
// universe allowed?
//
// ui_visible is treated here as an interim Step 3A lab publication/listing flag, not
// the final ownership/visibility/discovery model described in
// ROADMAP-multi-universe (that model lands in Step 3D).

const DEFAULT_UNIVERSE_ID = "default";

// Explicit action vocabulary. Unknown actions always fail closed in authorizeUniverse.
const ACTIONS = Object.freeze({
  DISCOVER: "discover",
  VIEW: "view",
  QUERY: "query",
  CONTRIBUTE: "contribute",
  EDIT: "edit",
  ADMINISTER: "administer",
  SHARE: "share"
});
const ACTION_SET = new Set(Object.values(ACTIONS));

// The only actor type any unauthenticated browser request can ever have.
const ANONYMOUS_ACTOR = Object.freeze({ type: "anonymous" });

// Constructed by a caller AFTER it has independently verified LAB_INGEST_TOKEN (or, in
// the future, some other server-side credential). This is today's stand-in for the
// "future service/system actor" described in the roadmap -- not an authenticated human
// subject, and it carries no subject_id.
function createServiceActor(authenticated) {
  return Object.freeze({ type: "service", authenticated: Boolean(authenticated) });
}

// Future: createAuthenticatedActor(subjectId) lands here once a real authentication
// layer exists, without changing any other export in this module.

const DEFAULT_UNIVERSE_DESCRIPTOR = Object.freeze({
  universe_id: DEFAULT_UNIVERSE_ID,
  title: "Default Universe",
  type: "default",
  status: "finalized",
  ui_visible: 1
});

// Normalizes a raw chat_universes row (or the default sentinel) into the shape
// authorizeUniverse expects. Never touches D1 itself -- callers fetch the row.
function normalizeUniverseDescriptor(row) {
  if (!row) return null;
  if (row.type === "default" || row.universe_id === DEFAULT_UNIVERSE_ID) {
    return DEFAULT_UNIVERSE_DESCRIPTOR;
  }
  return {
    universe_id: String(row.universe_id || ""),
    title: String(row.title || row.universe_id || ""),
    type: "chat",
    status: String(row.status || ""),
    ui_visible: Number(row.ui_visible) === 1 ? 1 : 0
  };
}

// The only fields ever safe to return to a browser/public caller. Internal fields
// (status, ui_visible, and future owner_subject/visibility/listed) never leave this
// function.
function projectPublicUniverse(universe) {
  if (!universe) return null;
  return { universe_id: universe.universe_id, title: universe.title, type: universe.type };
}

function isPublishedChatUniverse(universe) {
  return universe.type === "chat" && universe.status === "finalized" && Number(universe.ui_visible) === 1;
}

// authorizeUniverse(actor, universe, action)
//
// Single centralized decision point for every universe access check in this Worker.
// `universe` may be a raw chat_universes row, the default sentinel, or null/undefined
// (e.g. an unknown universe_id) -- it is normalized internally.
//
// Returns { allowed, action, reason, universe }. `universe` is always the SAFE public
// projection, or null when the caller should learn nothing about the universe at all.
// `reason` is for server logs and tests only -- it must never reach a public response,
// which is what keeps a hidden universe's 404 indistinguishable from an unknown
// universe_id's 404.
function authorizeUniverse(actor, universe, action) {
  const safeActor = actor || ANONYMOUS_ACTOR;
  const safeUniverse = normalizeUniverseDescriptor(universe);

  if (!ACTION_SET.has(action)) {
    return { allowed: false, action, reason: "unknown_action", universe: null };
  }
  if (!safeUniverse) {
    return { allowed: false, action, reason: "universe_not_found", universe: null };
  }

  const isDefault = safeUniverse.type === "default";
  const isService = safeActor.type === "service" && safeActor.authenticated === true;

  if (action === ACTIONS.DISCOVER || action === ACTIONS.VIEW) {
    if (isDefault) {
      return { allowed: true, action, reason: "default_universe", universe: projectPublicUniverse(safeUniverse) };
    }
    if (isPublishedChatUniverse(safeUniverse)) {
      return { allowed: true, action, reason: "published_chat_universe", universe: projectPublicUniverse(safeUniverse) };
    }
    // Deliberately the same reason for "does not exist" and "exists but hidden or
    // non-finalized" -- callers must not use `reason` to distinguish these in a public
    // response; that distinction is exactly what fail-closed-by-omission protects.
    return { allowed: false, action, reason: "not_visible", universe: null };
  }

  if (
    action === ACTIONS.CONTRIBUTE ||
    action === ACTIONS.EDIT ||
    action === ACTIONS.QUERY ||
    action === ACTIONS.ADMINISTER
  ) {
    if (isDefault) {
      return { allowed: false, action, reason: "default_universe_not_a_chat_universe", universe: null };
    }
    if (!isService) {
      return { allowed: false, action, reason: "authentication_required", universe: projectPublicUniverse(safeUniverse) };
    }
    return { allowed: true, action, reason: "service_actor_authenticated", universe: projectPublicUniverse(safeUniverse) };
  }

  // SHARE: vocabulary exists for the Step 3D/6 membership model, not wired to any route
  // yet. Fail closed rather than silently allowing or silently no-oping.
  return { allowed: false, action, reason: "not_implemented", universe: null };
}

export {
  ACTIONS,
  ANONYMOUS_ACTOR,
  createServiceActor,
  DEFAULT_UNIVERSE_ID,
  DEFAULT_UNIVERSE_DESCRIPTOR,
  normalizeUniverseDescriptor,
  projectPublicUniverse,
  authorizeUniverse
};
