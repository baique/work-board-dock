//! Signal light (红绿灯) — session status channel.
//!
//! A lightweight always-on HTTP endpoint on `127.0.0.1:9087` that any agent
//! (pi, codex, a plain shell script, ...) can POST status to via curl. Every
//! accepted mutation pushes a real-time `signal-updated` event to the renderer
//! (event push, no polling). `get_signal_summary` remains as an initial-sync
//! command on mount.
//!
//! Protocol (POST /api/signal):
//!   { "session": "proj-main", "state": "idle|running|failed|success", "msg?" }
//!
//! Four-state model (no terminal binding):
//!   idle    — a pi session is open but not working (count of open sessions)
//!   running — the agent is processing a turn
//!   failed  — a turn errored / needs attention
//!   success — an agent run settled without errors
//!
//! The renderer displays four persistent counters (idle/running/failed/success).
//! The total of the four = number of open pi sessions. Hovering a counter
//! shows the session names in that state.

use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

/// The port the signal HTTP endpoint listens on (localhost only).
pub const SIGNAL_PORT: u16 = 9087;

/// Session lifecycle states for the four-counter display.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SignalState {
    Idle,
    Running,
    Failed,
    Success,
}

/// Notification tier carried with a status report. The renderer decides
/// whether to show a popup card: `none` = light-only, `info` = green card
/// (final success), `alert` = red card (failed / awaiting permission).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SignalLevel {
    #[default]
    None,
    Info,
    Alert,
}

/// A single session's reported status.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SignalPayload {
    pub session: String,
    pub state: SignalState,
    #[serde(default)]
    pub msg: Option<String>,
    /// Popup tier; defaults to `none` (light-only) when omitted.
    #[serde(default)]
    pub level: SignalLevel,
}

/// Internal store entry: payload + last-seen timestamp for TTL reaping.
/// `last_seen` is not part of the wire protocol.
#[derive(Debug, Clone)]
struct SignalEntry {
    payload: SignalPayload,
    last_seen: std::time::Instant,
}

/// Describes what changed in one store mutation, so the renderer can show a
/// popup card ("which task, which light") without diffing full summaries.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalChange {
    pub session: String,
    pub state: SignalState,
    pub level: SignalLevel,
    /// true when the session was removed (session closed / TTL reaped).
    pub removed: bool,
}

/// Derived per-state aggregate returned to the renderer.
#[derive(Debug, Clone, Default, Serialize)]
pub struct SignalSummary {
    /// session → state for every open session.
    pub sessions: HashMap<String, SignalState>,
    /// Number of sessions per state.
    pub idle: usize,
    pub running: usize,
    pub failed: usize,
    pub success: usize,
    /// Total open sessions (idle + running + failed + success).
    pub total: usize,
}

/// Fires after every store mutation so the renderer can be updated in real
/// time (event push) instead of polling. `SignalSummary` is passed so the
/// frontend can render the fresh counts directly; `Option<SignalChange>`
/// describes this mutation (None for TTL reaping batches).
pub type SignalChangeCallback = Arc<dyn Fn(SignalSummary, Option<SignalChange>) + Send + Sync>;

/// Manage-able shared signal state. Wrapped in `Arc<RwLock<_>>`-style interior
/// mutability so the HTTP handler (async) and the Tauri command (sync) can both
/// read/write it without a tokio runtime requirement.
#[derive(Default)]
pub struct SignalStore {
    signals: RwLock<HashMap<String, SignalEntry>>,
    on_change: RwLock<Option<SignalChangeCallback>>,
    /// Sessions idle longer than this are reaped (crashed pi = no shutdown
    /// DELETE). 30 minutes — a normal working session may sit idle that long.
    pub ttl: std::time::Duration,
}

impl SignalStore {
    pub fn new() -> Self {
        Self {
            ttl: std::time::Duration::from_secs(30 * 60),
            ..Default::default()
        }
    }

    /// Register a callback fired after every mutation (upsert/remove) with the
    /// fresh summary. The HTTP server uses it to push real-time events.
    pub fn set_on_change(&self, cb: Option<SignalChangeCallback>) {
        *self.on_change.write() = cb;
    }

    fn fire_change(&self, change: Option<SignalChange>) {
        let cb = self.on_change.read().clone();
        if let Some(cb) = cb {
            cb(self.summary(), change);
        }
    }

    /// Upsert a session's signal. Returns the previous payload, if any.
    pub fn upsert(&self, payload: SignalPayload) -> Option<SignalPayload> {
        let prev = self
            .signals
            .write()
            .insert(
                payload.session.clone(),
                SignalEntry {
                    payload: payload.clone(),
                    last_seen: std::time::Instant::now(),
                },
            )
            .map(|e| e.payload);
        let change = SignalChange {
            session: payload.session.clone(),
            state: payload.state,
            level: payload.level,
            removed: false,
        };
        self.fire_change(Some(change));
        prev
    }

    /// Remove a session's signal (e.g. pi session closed / manual dismissal).
    pub fn remove(&self, session: &str) -> Option<SignalPayload> {
        let prev = self.signals.write().remove(session).map(|e| e.payload);
        if prev.is_some() {
            let change = SignalChange {
                session: session.to_string(),
                state: prev.as_ref().map(|p| p.state).unwrap_or(SignalState::Idle),
                level: prev.as_ref().map(|p| p.level).unwrap_or(SignalLevel::None),
                removed: true,
            };
            self.fire_change(Some(change));
        }
        prev
    }

    /// Reap sessions whose last update is older than `now - ttl` (crashed
    /// agents never send DELETE). Returns the removed session ids.
    pub fn purge_stale(&self, now: std::time::Instant) -> Vec<String> {
        let cutoff = now.checked_sub(self.ttl);
        let Some(cutoff) = cutoff else {
            return Vec::new();
        };
        let stale: Vec<String> = self
            .signals
            .read()
            .iter()
            .filter(|(_, e)| e.last_seen < cutoff)
            .map(|(k, _)| k.clone())
            .collect();
        if stale.is_empty() {
            return stale;
        }
        {
            let mut w = self.signals.write();
            for s in &stale {
                w.remove(s);
            }
        }
        self.fire_change(None);
        stale
    }

    /// Snapshot of all current signals.
    pub fn snapshot(&self) -> Vec<SignalPayload> {
        self.signals.read().values().map(|e| e.payload.clone()).collect()
    }

    /// Test-only: backdate a session's last_seen for TTL reaping tests.
    #[cfg(test)]
    pub fn backdate_last_seen(&self, session: &str, age: std::time::Duration) {
        if let Some(e) = self.signals.write().get_mut(session) {
            e.last_seen = std::time::Instant::now() - age;
        }
    }

    /// Derived summary: per-state counts + session lists + total.
    pub fn summary(&self) -> SignalSummary {
        let snap = self.snapshot();
        let mut summary = SignalSummary {
            sessions: HashMap::with_capacity(snap.len()),
            ..Default::default()
        };
        for s in snap {
            summary.sessions.insert(s.session.clone(), s.state);
            match s.state {
                SignalState::Idle => summary.idle += 1,
                SignalState::Running => summary.running += 1,
                SignalState::Failed => summary.failed += 1,
                SignalState::Success => summary.success += 1,
            }
        }
        summary.total = summary.idle + summary.running + summary.failed + summary.success;
        summary
    }
}

// ---------------------------------------------------------------------------
// HTTP endpoint (127.0.0.1:9087) — accepts POST /api/signal from any agent.
// ---------------------------------------------------------------------------

use axum::{
    body::Bytes,
    extract::State,
    http::StatusCode,
    routing::get,
    Json, Router,
};
use std::net::SocketAddr;

/// Read-only snapshot of the current aggregated state. Diagnostic endpoint:
/// `curl http://127.0.0.1:9087/api/signal` — lets you verify what the backend
/// store actually holds (e.g. whether a failed state persisted) without a UI.
async fn get_signal(
    State(store): State<Arc<SignalStore>>,
) -> (StatusCode, Json<serde_json::Value>) {
    let summary = store.summary();
    let sessions: serde_json::Map<String, serde_json::Value> = summary
        .sessions
        .iter()
        .map(|(k, v)| (k.clone(), serde_json::json!(v)))
        .collect();
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "idle": summary.idle,
            "running": summary.running,
            "failed": summary.failed,
            "success": summary.success,
            "total": summary.total,
            "sessions": sessions,
        })),
    )
}

/// Accept POST /api/signal from any agent with a one-line curl — no
/// `Content-Type` header required. The body is parsed manually so a plain
/// `curl -d '{"..."}'` works without `-H 'Content-Type: application/json'`.
async fn receive_signal(
    State(store): State<Arc<SignalStore>>,
    body: Bytes,
) -> (StatusCode, Json<serde_json::Value>) {
    match serde_json::from_slice::<SignalPayload>(&body) {
        Ok(payload) => {
            store.upsert(payload);
            (StatusCode::OK, Json(serde_json::json!({ "ok": true })))
        }
        Err(err) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "ok": false, "error": format!("invalid signal payload: {err}") })),
        ),
    }
}

/// Accept DELETE /api/signal to remove a session (e.g. pi session closed).
/// Body: { "session": "..." } — no Content-Type required.
async fn remove_signal(
    State(store): State<Arc<SignalStore>>,
    body: Bytes,
) -> (StatusCode, Json<serde_json::Value>) {
    match serde_json::from_slice::<serde_json::Value>(&body) {
        Ok(v) => {
            if let Some(session) = v.get("session").and_then(|s| s.as_str()) {
                store.remove(session);
                (StatusCode::OK, Json(serde_json::json!({ "ok": true })))
            } else {
                (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({ "ok": false, "error": "missing session" })),
                )
            }
        }
        Err(err) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "ok": false, "error": format!("invalid payload: {err}") })),
        ),
    }
}

/// Tauri event name pushed to the renderer after every store mutation.
pub const SIGNAL_UPDATE_EVENT: &str = "signal-updated";

/// Event payload pushed to the renderer: fresh summary + what changed (so the
/// renderer can show a popup card for alert/info levels).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalUpdateEvent {
    pub summary: SignalSummary,
    pub last_change: Option<SignalChange>,
}

/// Build the signal HTTP router. `store` is shared with the Tauri command.
fn signal_router(store: Arc<SignalStore>) -> Router {
    Router::new()
        .route(
            "/api/signal",
            get(get_signal).post(receive_signal).delete(remove_signal),
        )
        .with_state(store)
}

/// Spawn the always-on signal HTTP server on 127.0.0.1:9087. Every accepted
/// mutation pushes a real-time `signal-updated` event (carrying the fresh
/// summary) to the renderer so the status dots update without polling.
pub fn spawn_signal_server(store: Arc<SignalStore>, app: tauri::AppHandle) -> tauri::async_runtime::JoinHandle<()> {
    store.set_on_change(Some(Arc::new(move |summary: SignalSummary, last_change: Option<SignalChange>| {
        let _ = app.emit(
            SIGNAL_UPDATE_EVENT,
            SignalUpdateEvent {
                summary,
                last_change,
            },
        );
    })));

    // Periodic TTL sweeper: reap sessions that stopped heartbeating (crashed
    // pi never sends DELETE). Runs every 60s; harmless when the store is empty.
    {
        let store = store.clone();
        tauri::async_runtime::spawn(async move {
            let mut ticker = tokio::time::interval(std::time::Duration::from_secs(60));
            ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                ticker.tick().await;
                let reaped = store.purge_stale(std::time::Instant::now());
                if !reaped.is_empty() {
                    log::info!("[signal] reaped {} stale session(s): {:?}", reaped.len(), reaped);
                }
            }
        });
    }

    let addr = SocketAddr::from(([127, 0, 0, 1], SIGNAL_PORT));
    let app = signal_router(store);
    tauri::async_runtime::spawn(async move {
        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                log::error!("[signal] failed to bind {addr}: {e}");
                return;
            }
        };
        log::info!("[signal] HTTP endpoint listening on {addr}");
        if let Err(e) = axum::serve(listener, app).await {
            log::error!("[signal] server error: {e}");
        }
    })
}

/// Tauri command: return the derived summary (counts + session lists) for the
/// renderer's three-counter display. The renderer polls this (e.g. every 2s).
#[tauri::command]
pub fn get_signal_summary(store: tauri::State<'_, Arc<SignalStore>>) -> SignalSummary {
    store.summary()
}

/// Tauri command: remove a session (e.g. pi session closed).
#[tauri::command]
pub fn clear_signal(store: tauri::State<'_, Arc<SignalStore>>, session: String) {
    store.remove(&session);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn sig(session: &str, state: SignalState) -> SignalPayload {
        SignalPayload {
            session: session.to_string(),
            state,
            msg: None,
            level: SignalLevel::None,
        }
    }

    #[test]
    fn parses_lowercase_state() {
        let body = r#"{"session":"proj-main","state":"running","msg":"等待"}"#;
        let parsed: SignalPayload = serde_json::from_str(body).unwrap();
        assert_eq!(parsed.session, "proj-main");
        assert_eq!(parsed.state, SignalState::Running);
        assert_eq!(parsed.msg.as_deref(), Some("等待"));
    }

    #[test]
    fn parses_failed_and_success() {
        let f: SignalPayload = serde_json::from_str(r#"{"session":"a","state":"failed"}"#).unwrap();
        assert_eq!(f.state, SignalState::Failed);
        let s: SignalPayload = serde_json::from_str(r#"{"session":"b","state":"success"}"#).unwrap();
        assert_eq!(s.state, SignalState::Success);
    }

    #[test]
    fn rejects_unknown_state() {
        let body = r#"{"session":"s","state":"purple"}"#;
        let parsed: Result<SignalPayload, _> = serde_json::from_str(body);
        assert!(parsed.is_err());
    }

    #[test]
    fn parses_level_and_defaults_to_none() {
        // Explicit alert level.
        let body = r#"{"session":"s","state":"failed","level":"alert"}"#;
        let p: SignalPayload = serde_json::from_str(body).unwrap();
        assert_eq!(p.level, SignalLevel::Alert);

        // Omitted level defaults to None.
        let body = r#"{"session":"s","state":"running"}"#;
        let p: SignalPayload = serde_json::from_str(body).unwrap();
        assert_eq!(p.level, SignalLevel::None);

        let body = r#"{"session":"s","state":"success","level":"info"}"#;
        let p: SignalPayload = serde_json::from_str(body).unwrap();
        assert_eq!(p.level, SignalLevel::Info);
    }

    #[test]
    fn rejects_unknown_level() {
        let body = r#"{"session":"s","state":"failed","level":"urgent"}"#;
        let parsed: Result<SignalPayload, _> = serde_json::from_str(body);
        assert!(parsed.is_err());
    }

    #[test]
    fn upsert_emits_last_change_with_level() {
        let store = SignalStore::new();
        let changes = Arc::new(std::sync::Mutex::new(Vec::new()));
        let changes_clone = changes.clone();
        store.set_on_change(Some(Arc::new(move |_summary, change| {
            if let Some(c) = change {
                changes_clone.lock().unwrap().push(c);
            }
        })));

        store.upsert(SignalPayload {
            session: "proj-a".into(),
            state: SignalState::Failed,
            msg: None,
            level: SignalLevel::Alert,
        });
        let c = changes.lock().unwrap().last().unwrap().clone();
        assert_eq!(c.session, "proj-a");
        assert_eq!(c.state, SignalState::Failed);
        assert_eq!(c.level, SignalLevel::Alert);
        assert!(!c.removed);
    }

    #[test]
    fn remove_emits_last_change_with_removed_flag() {
        let store = SignalStore::new();
        let changes = Arc::new(std::sync::Mutex::new(Vec::new()));
        let changes_clone = changes.clone();
        store.set_on_change(Some(Arc::new(move |_summary, change| {
            if let Some(c) = change {
                changes_clone.lock().unwrap().push(c);
            }
        })));

        store.upsert(sig("proj-a", SignalState::Running));
        store.remove("proj-a");
        let c = changes.lock().unwrap().last().unwrap().clone();
        assert_eq!(c.session, "proj-a");
        assert!(c.removed);
    }

    #[test]
    fn purge_stale_reaps_expired_and_keeps_fresh() {
        let mut store = SignalStore::new();
        store.ttl = std::time::Duration::from_secs(60);
        store.upsert(sig("stale", SignalState::Failed));
        store.upsert(sig("fresh", SignalState::Running));

        // Backdate only the stale session beyond the TTL.
        store.backdate_last_seen("stale", std::time::Duration::from_secs(5 * 60));
        let reaped = store.purge_stale(std::time::Instant::now());

        assert!(reaped.contains(&"stale".to_string()));
        assert!(!reaped.contains(&"fresh".to_string()));
        let s = store.summary();
        assert_eq!(s.total, 1);
        assert!(s.sessions.contains_key("fresh"));
    }

    #[test]
    fn purge_stale_fires_change_callback_with_none() {
        let mut store = SignalStore::new();
        store.ttl = std::time::Duration::from_secs(60);
        let calls = Arc::new(std::sync::Mutex::new(Vec::new()));
        let calls_clone = calls.clone();
        store.set_on_change(Some(Arc::new(move |_summary, change| {
            calls_clone.lock().unwrap().push(change);
        })));

        store.upsert(sig("a", SignalState::Failed));
        store.backdate_last_seen("a", std::time::Duration::from_secs(10 * 60));
        store.purge_stale(std::time::Instant::now());

        let changes = calls.lock().unwrap();
        // upsert -> Some(change), purge -> None
        assert!(changes[0].is_some());
        assert!(changes[1].is_none());
    }

    #[test]
    fn purge_stale_noop_when_nothing_expired() {
        let mut store = SignalStore::new();
        store.ttl = std::time::Duration::from_secs(60);
        store.upsert(sig("a", SignalState::Running));
        let reaped = store.purge_stale(std::time::Instant::now());
        assert!(reaped.is_empty());
        assert_eq!(store.summary().total, 1);
    }

    #[test]
    fn summary_counts_each_state_and_total() {
        let store = SignalStore::new();
        store.upsert(sig("a", SignalState::Idle));
        store.upsert(sig("b", SignalState::Running));
        store.upsert(sig("c", SignalState::Running));
        store.upsert(sig("d", SignalState::Failed));
        store.upsert(sig("e", SignalState::Success));

        let summary = store.summary();
        assert_eq!(summary.idle, 1);
        assert_eq!(summary.running, 2);
        assert_eq!(summary.failed, 1);
        assert_eq!(summary.success, 1);
        assert_eq!(summary.total, 5);
        assert_eq!(summary.sessions.len(), 5);
    }

    #[test]
    fn summary_empty_by_default() {
        let store = SignalStore::new();
        let summary = store.summary();
        assert_eq!(summary.total, 0);
        assert_eq!(summary.idle, 0);
        assert_eq!(summary.running, 0);
        assert_eq!(summary.failed, 0);
        assert_eq!(summary.success, 0);
    }

    #[test]
    fn state_transition_moves_session_between_counts() {
        let store = SignalStore::new();
        store.upsert(sig("a", SignalState::Idle));
        assert_eq!(store.summary().idle, 1);

        // Session starts working: idle → running.
        store.upsert(sig("a", SignalState::Running));
        let s = store.summary();
        assert_eq!(s.idle, 0);
        assert_eq!(s.running, 1);

        // Error: running → failed.
        store.upsert(sig("a", SignalState::Failed));
        let s = store.summary();
        assert_eq!(s.running, 0);
        assert_eq!(s.failed, 1);

        // Completed: failed → success.
        store.upsert(sig("a", SignalState::Success));
        let s = store.summary();
        assert_eq!(s.failed, 0);
        assert_eq!(s.success, 1);
    }

    #[test]
    fn remove_decrements_and_drops_session() {
        let store = SignalStore::new();
        store.upsert(sig("a", SignalState::Running));
        store.upsert(sig("b", SignalState::Idle));
        assert_eq!(store.summary().total, 2);

        store.remove("a");
        let s = store.summary();
        assert_eq!(s.total, 1);
        assert!(!s.sessions.contains_key("a"));
    }

    #[test]
    fn notifies_on_change_callback_after_upsert_and_remove() {
        let store = SignalStore::new();
        let calls = Arc::new(AtomicUsize::new(0));
        let calls_clone = calls.clone();
        store.set_on_change(Some(Arc::new(move |_summary, _change| {
            calls_clone.fetch_add(1, Ordering::SeqCst);
        })));

        store.upsert(sig("a", SignalState::Running));
        store.upsert(sig("a", SignalState::Success));
        store.remove("a");

        assert_eq!(calls.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn accepts_post_without_content_type_header() {
        use axum::body::Body;
        use axum::http::{Request, StatusCode};
        use tower::ServiceExt;

        let store = Arc::new(SignalStore::new());
        let app = signal_router(store.clone());

        // Plain curl-style POST, NO Content-Type header.
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/signal")
                    .body(Body::from(r#"{"session":"x","state":"running"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(store.summary().running, 1);
    }

    #[tokio::test]
    async fn rejects_invalid_payload_with_400() {
        use axum::body::Body;
        use axum::http::{Request, StatusCode};
        use tower::ServiceExt;

        let store = Arc::new(SignalStore::new());
        let app = signal_router(store.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/signal")
                    .body(Body::from(r#"{"session":"x","state":"purple"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert!(store.summary().total == 0);
    }

    #[tokio::test]
    async fn delete_removes_session() {
        use axum::body::Body;
        use axum::http::{Request, StatusCode};
        use tower::ServiceExt;

        let store = Arc::new(SignalStore::new());
        store.upsert(sig("x", SignalState::Running));
        let app = signal_router(store.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri("/api/signal")
                    .body(Body::from(r#"{"session":"x"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(store.summary().total, 0);
    }

    #[tokio::test]
    async fn get_returns_readonly_snapshot() {
        use axum::body::Body;
        use axum::http::{Request, StatusCode};
        use tower::ServiceExt;

        let store = Arc::new(SignalStore::new());
        store.upsert(sig("a", SignalState::Failed));
        store.upsert(sig("b", SignalState::Success));
        let app = signal_router(store.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/signal")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 1024 * 64).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["failed"], 1);
        assert_eq!(json["success"], 1);
        assert_eq!(json["total"], 2);
        assert_eq!(json["sessions"]["a"], "failed");
        assert_eq!(json["sessions"]["b"], "success");
    }
}