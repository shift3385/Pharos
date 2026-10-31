use super::*;

const KEY: [u8; 32] = [7u8; 32];
const OTHER_KEY: [u8; 32] = [8u8; 32];

fn temp_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("pharos-evidence-test-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    dir
}

/// Deterministic bytes that do not compress or repeat per block.
pub(crate) fn sample(len: usize) -> Vec<u8> {
    let mut state = 0x9E37_79B9_7F4A_7C15u64;
    (0..len)
        .map(|_| {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            state as u8
        })
        .collect()
}

fn sha(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

fn read_all(store: &EvidenceStore, sha256: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    store
        .open(sha256)?
        .read_to_end(&mut out)
        .map_err(|e| e.to_string())?;
    Ok(out)
}

/// Every file under `dir`, relative, sorted.
fn files(dir: &Path) -> Vec<String> {
    let mut out = Vec::new();
    for entry in fs::read_dir(dir).into_iter().flatten().flatten() {
        let path = entry.path();
        if path.is_dir() {
            for f in files(&path) {
                out.push(format!("{}/{f}", entry.file_name().to_string_lossy()));
            }
        } else {
            out.push(entry.file_name().to_string_lossy().into_owned());
        }
    }
    out.sort();
    out
}

#[test]
fn contents_round_trip_at_every_block_boundary() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    for len in [0, 1, BLOCK - 1, BLOCK, BLOCK + 1, 3 * BLOCK, 3 * BLOCK + 17] {
        let bytes = sample(len);
        let stored = store.put(&bytes[..], MAX_FILE_BYTES).unwrap();
        assert_eq!(
            stored,
            Stored {
                sha256: sha(&bytes),
                size: len as u64
            }
        );
        assert_eq!(
            read_all(&store, &stored.sha256).unwrap(),
            bytes,
            "len {len}"
        );
        let on_disk = fs::metadata(store.path_for(&stored.sha256).unwrap())
            .unwrap()
            .len();
        assert_eq!(on_disk, expected_len(len as u64), "len {len}");
        assert!(store.is_stored(&stored.sha256, len as u64));
        // Tiny reads work across block boundaries too.
        let mut reader = store.open(&stored.sha256).unwrap();
        let (mut out, mut buf) = (Vec::new(), [0u8; 7]);
        loop {
            let n = reader.read(&mut buf).unwrap();
            if n == 0 {
                break;
            }
            out.extend_from_slice(&buf[..n]);
        }
        assert_eq!(out, bytes);
    }
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn a_large_file_is_streamed_block_by_block() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let bytes = sample(12 * 1024 * 1024 + 5);
    let mut writer = store.writer(MAX_FILE_BYTES).unwrap();
    for chunk in bytes.chunks(4 * 1024 * 1024) {
        writer.write(chunk).unwrap();
        // Only one block of plaintext is ever buffered.
        assert!(writer.buf.capacity() <= BLOCK);
    }
    writer.seal().unwrap();
    let stored = writer.commit(&store).unwrap().stored;
    assert_eq!(stored.size, bytes.len() as u64);
    let mut reader = store.open(&stored.sha256).unwrap();
    let mut out = Vec::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = reader.read(&mut buf).unwrap();
        if n == 0 {
            break;
        }
        assert!(reader.out.len() <= BLOCK);
        out.extend_from_slice(&buf[..n]);
    }
    assert!(out == bytes);
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn the_same_content_is_stored_once_and_nothing_is_left_behind() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let a = store.put(&b"same bytes"[..], MAX_FILE_BYTES).unwrap();
    let b = store.put(&b"same bytes"[..], MAX_FILE_BYTES).unwrap();
    assert_eq!(a, b);
    let names = files(&dir.join(DIR));
    assert_eq!(names.len(), 1, "{names:?}");
    assert!(names[0].ends_with(".pev"));
    // The name is the HMAC, never the plaintext hash.
    assert!(!names[0].contains(&a.sha256));
    assert!(fs::read_dir(dir.join(DIR).join(TMP))
        .unwrap()
        .next()
        .is_none());
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn attaching_the_same_content_again_repairs_a_damaged_copy() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let bytes = sample(BLOCK + 500);
    let stored = store.put(&bytes[..], MAX_FILE_BYTES).unwrap();
    let path = store.path_for(&stored.sha256).unwrap();
    let original = fs::read(&path).unwrap();

    // An intact copy is reused: the new writer's file is discarded.
    let mut again = store.writer(MAX_FILE_BYTES).unwrap();
    again.write(&bytes).unwrap();
    assert!(!again.commit(&store).unwrap().wrote);

    // Truncated, or the same length with a foreign header: replaced.
    let mut foreign_header = original.clone();
    foreign_header[..4].copy_from_slice(b"XXXX");
    for damaged in [original[..original.len() - 10].to_vec(), foreign_header] {
        fs::write(&path, &damaged).unwrap();
        assert!(!store.is_stored(&stored.sha256, stored.size));
        let mut writer = store.writer(MAX_FILE_BYTES).unwrap();
        writer.write(&bytes).unwrap();
        assert!(writer.commit(&store).unwrap().wrote);
        assert_eq!(read_all(&store, &stored.sha256).unwrap(), bytes);
    }
    assert!(fs::read_dir(dir.join(DIR).join(TMP))
        .unwrap()
        .next()
        .is_none());
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn no_plaintext_reaches_the_disk() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let marker = b"SECRET-EVIDENCE-MARKER-0123456789".repeat(5000);
    store.put(&marker[..], MAX_FILE_BYTES).unwrap();
    for name in files(&dir.join(DIR)) {
        let raw = fs::read(dir.join(DIR).join(&name)).unwrap();
        assert!(!raw.windows(22).any(|w| w == &marker[..22]), "{name}");
    }
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn another_key_neither_finds_nor_decrypts_the_file() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let stored = store.put(&b"evidence"[..], MAX_FILE_BYTES).unwrap();
    let other = EvidenceStore::new(&dir, &OTHER_KEY);
    // Names depend on the key: the other key does not even find it…
    let err = other.open(&stored.sha256).err().unwrap();
    assert!(err.starts_with(EVIDENCE_MISSING), "{err}");
    // …and under the name it would use, it does not decrypt.
    let theirs = other.path_for(&stored.sha256).unwrap();
    fs::create_dir_all(theirs.parent().unwrap()).unwrap();
    fs::copy(store.path_for(&stored.sha256).unwrap(), &theirs).unwrap();
    let err = read_all(&other, &stored.sha256).err().unwrap();
    assert!(err.contains(EVIDENCE_UNREADABLE), "{err}");
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn damaged_truncated_or_swapped_files_are_refused() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let bytes = sample(2 * BLOCK + 100);
    let stored = store.put(&bytes[..], MAX_FILE_BYTES).unwrap();
    let path = store.path_for(&stored.sha256).unwrap();
    let original = fs::read(&path).unwrap();

    let mut flipped = original.clone();
    flipped[HEADER_LEN + BLOCK + 3] ^= 1;
    fs::write(&path, &flipped).unwrap();
    assert!(read_all(&store, &stored.sha256)
        .unwrap_err()
        .contains(EVIDENCE_UNREADABLE));

    // Dropping the last block: the block before it is not flagged as last.
    fs::write(&path, &original[..HEADER_LEN + 2 * (BLOCK + TAG)]).unwrap();
    assert!(read_all(&store, &stored.sha256)
        .unwrap_err()
        .contains(EVIDENCE_UNREADABLE));

    let mut header = original.clone();
    header[9] ^= 1; // the nonce prefix is authenticated as associated data
    fs::write(&path, &header).unwrap();
    assert!(read_all(&store, &stored.sha256)
        .unwrap_err()
        .contains(EVIDENCE_UNREADABLE));

    // Another content under this name decrypts but does not hash right.
    let other = store.put(&b"another content"[..], MAX_FILE_BYTES).unwrap();
    fs::copy(store.path_for(&other.sha256).unwrap(), &path).unwrap();
    assert!(read_all(&store, &stored.sha256)
        .unwrap_err()
        .contains("does not match"));
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn a_file_from_a_newer_format_is_refused_as_such() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let stored = store.put(&b"x"[..], MAX_FILE_BYTES).unwrap();
    let path = store.path_for(&stored.sha256).unwrap();
    let mut raw = fs::read(&path).unwrap();
    raw[4] = FORMAT_VERSION + 1;
    fs::write(&path, raw).unwrap();
    let err = store.open(&stored.sha256).err().unwrap();
    assert!(err.starts_with(EVIDENCE_NEWER), "{err}");
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn the_size_limit_stops_a_write_and_drops_its_temp_file() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let mut writer = store.writer(10).unwrap();
    writer.write(b"0123456789").unwrap();
    let err = writer.write(b"!").unwrap_err();
    assert!(err.starts_with(EVIDENCE_TOO_LARGE), "{err}");
    drop(writer);
    assert!(files(&dir.join(DIR)).is_empty());
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn leftovers_of_an_unfinished_write_are_removed_at_open() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    fs::create_dir_all(dir.join(DIR).join(TMP)).unwrap();
    fs::write(dir.join(DIR).join(TMP).join("x.pev.new"), b"ciphertext").unwrap();
    store.clean_tmp();
    assert!(files(&dir.join(DIR)).is_empty());
    fs::remove_dir_all(dir).unwrap();
}

// ---- database side ------------------------------------------------------

const OWNER: &str = "user-1";

/// A database with project p1 (owned by OWNER) and card c1.
fn conn() -> Connection {
    let c = Connection::open_in_memory().unwrap();
    crate::db::run_migrations(&c).unwrap();
    let ws = crate::db::ensure_workspace(&c).unwrap();
    c.execute(
        "INSERT INTO projects (id, workspace_id, owner_id, name, created_by, updated_by, \
         created_at, updated_at) VALUES ('p1', ?1, ?2, 'P', ?2, ?2, datetime('now'), datetime('now'))",
        params![ws, OWNER],
    )
    .unwrap();
    c
}

fn attach(
    c: &Connection,
    id: &str,
    stored: &Stored,
    owner_entity: &str,
    kind: &str,
    age_days: i64,
) {
    record_blob(c, stored, None).unwrap();
    c.execute(
        "INSERT INTO attachments (id, workspace_id, project_id, sha256, size, name, owner_entity, \
         owner_id, kind, created_by, updated_by, created_at, updated_at) \
         SELECT ?1, id, 'p1', ?2, ?3, 'n', ?4, 'o1', ?5, ?6, ?6, \
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || ?7 || ' days'), 'now' FROM workspaces",
        params![
            id,
            stored.sha256,
            stored.size as i64,
            owner_entity,
            kind,
            OWNER,
            age_days
        ],
    )
    .unwrap();
}

fn state(c: &Connection, sha256: &str) -> Option<String> {
    c.query_row(
        "SELECT local_state FROM blobs WHERE sha256 = ?1",
        params![sha256],
        |r| r.get(0),
    )
    .optional()
    .unwrap()
}

#[test]
fn collect_removes_released_contents_only_after_they_are_released() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let c = conn();
    let shared = store.put(&b"shared"[..], MAX_FILE_BYTES).unwrap();
    attach(&c, "a1", &shared, "planner_card", "evidence", 0);
    attach(&c, "a2", &shared, "planner_card", "evidence", 0);

    c.execute(
        "UPDATE attachments SET deleted_at = 'now' WHERE id = 'a1'",
        [],
    )
    .unwrap();
    release(&c, &shared.sha256).unwrap();
    assert_eq!(
        state(&c, &shared.sha256).as_deref(),
        Some("present"),
        "a2 still needs it"
    );

    c.execute(
        "UPDATE attachments SET deleted_at = 'now' WHERE id = 'a2'",
        [],
    )
    .unwrap();
    release(&c, &shared.sha256).unwrap();
    assert_eq!(state(&c, &shared.sha256).as_deref(), Some("deleting"));
    assert!(store.exists(&shared.sha256), "the file waits for collect");

    assert_eq!(collect(&c, &store).unwrap(), 1);
    assert!(!store.exists(&shared.sha256));
    assert_eq!(state(&c, &shared.sha256), None);
    // A second run (the row's removal was not saved yet) is harmless.
    assert_eq!(collect(&c, &store).unwrap(), 0);
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn a_content_referenced_again_before_collect_is_kept() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let c = conn();
    let s = store.put(&b"again"[..], MAX_FILE_BYTES).unwrap();
    attach(&c, "a1", &s, "planner_card", "evidence", 0);
    c.execute(
        "UPDATE attachments SET deleted_at = 'now' WHERE id = 'a1'",
        [],
    )
    .unwrap();
    release(&c, &s.sha256).unwrap();
    // The same file is attached again before the deletion ran.
    let again = store.put(&b"again"[..], MAX_FILE_BYTES).unwrap();
    attach(&c, "a2", &again, "planner_card", "evidence", 0);
    assert_eq!(state(&c, &s.sha256).as_deref(), Some("present"));
    assert_eq!(collect(&c, &store).unwrap(), 0);
    assert_eq!(read_all(&store, &s.sha256).unwrap(), b"again");
    // A row left in 'deleting' by a crash but needed again goes back too.
    c.execute("UPDATE blobs SET local_state = 'deleting'", [])
        .unwrap();
    assert_eq!(collect(&c, &store).unwrap(), 0);
    assert_eq!(state(&c, &s.sha256).as_deref(), Some("present"));
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn files_without_a_row_are_counted_never_swept() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let c = conn();
    let known = store.put(&b"known"[..], MAX_FILE_BYTES).unwrap();
    record_blob(&c, &known, None).unwrap();
    let stray = store.put(&b"stray"[..], MAX_FILE_BYTES).unwrap();
    assert_eq!(store.unreferenced_files(&c).unwrap(), 1);
    release_unreferenced(&c).unwrap();
    collect(&c, &store).unwrap();
    assert!(
        store.exists(&stray.sha256),
        "an unknown file is never removed"
    );
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn retention_expires_by_kind_keeps_the_record_and_audits_a_redaction() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let c = conn();
    let put = |b: &[u8]| store.put(b, MAX_FILE_BYTES).unwrap();
    let (trace_old, trace_new, log_old, shot_old) = (
        put(b"trace old"),
        put(b"trace new"),
        put(b"log old"),
        put(b"shot old"),
    );
    attach(&c, "t-old", &trace_old, "run_shard", "trace", 31);
    attach(&c, "t-new", &trace_new, "run_shard", "trace", 29);
    attach(&c, "l-old", &log_old, "run_shard", "log", 91);
    attach(&c, "s-old", &shot_old, "run_shard", "screenshot", 4000);
    // A planner card's file never expires, whatever its kind.
    let card_trace = put(b"card trace");
    attach(&c, "card", &card_trace, "planner_card", "trace", 4000);

    assert_eq!(expire(&c).unwrap(), 2);
    let purged: Vec<String> = c
        .prepare("SELECT id FROM attachments WHERE blob_purged_at IS NOT NULL ORDER BY id")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap();
    assert_eq!(purged, ["l-old", "t-old"]);
    // The row keeps what there was; the content is released.
    let sha: String = c
        .query_row(
            "SELECT sha256 FROM attachments WHERE id = 't-old'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(sha, trace_old.sha256);
    assert_eq!(state(&c, &trace_old.sha256).as_deref(), Some("deleting"));
    assert_eq!(state(&c, &trace_new.sha256).as_deref(), Some("present"));
    let (action, actor, owner): (String, String, String) = c
        .query_row(
            "SELECT action, actor, user_id FROM audit_log WHERE entity_id = 't-old'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    assert_eq!(
        (action.as_str(), actor.as_str(), owner.as_str()),
        ("redact", "system:evidence", OWNER)
    );
    collect(&c, &store).unwrap();
    assert!(!store.exists(&trace_old.sha256) && store.exists(&trace_new.sha256));
    // Running it again expires nothing new.
    assert_eq!(expire(&c).unwrap(), 0);
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn a_project_can_override_the_retention_of_a_kind() {
    let dir = temp_dir();
    let store = EvidenceStore::new(&dir, &KEY);
    let c = conn();
    let a = store.put(&b"trace"[..], MAX_FILE_BYTES).unwrap();
    let b = store.put(&b"shot"[..], MAX_FILE_BYTES).unwrap();
    attach(&c, "trace", &a, "run_shard", "trace", 400);
    attach(&c, "shot", &b, "run_shard", "screenshot", 10);
    c.execute_batch(
        "INSERT INTO evidence_retention (project_id, kind, days) VALUES \
         ('p1', 'trace', NULL), ('p1', 'screenshot', 7)",
    )
    .unwrap();
    assert_eq!(expire(&c).unwrap(), 1);
    let purged: String = c
        .query_row(
            "SELECT id FROM attachments WHERE blob_purged_at IS NOT NULL",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(purged, "shot");
    fs::remove_dir_all(dir).unwrap();
}

#[test]
fn nothing_about_attachments_reaches_the_sync_outbox() {
    let c = conn();
    let ws = crate::db::ensure_workspace(&c).unwrap();
    c.execute(
        "INSERT INTO planner_cards (id, workspace_id, project_id, owner_id, kind, title, \
         created_by, updated_by, created_at, updated_at) \
         VALUES ('c1', ?1, 'p1', ?2, 'task', 'T', ?2, ?2, 'now', 'now')",
        params![ws, OWNER],
    )
    .unwrap();
    let stored = Stored {
        sha256: sha(b"bytes"),
        size: 5,
    };
    crate::planner::add_attachment(&c, "a1", "c1", OWNER, "f.txt", None, &stored).unwrap();
    crate::planner::delete_attachment(&c, "a1", OWNER).unwrap();
    for pending in [
        crate::sync::build_pending(&c, OWNER).unwrap(),
        crate::sync::build_pending_append(&c, OWNER).unwrap(),
    ] {
        let pending = serde_json::to_value(pending).unwrap();
        for delta in pending["deltas"].as_array().unwrap() {
            assert_ne!(delta["entity"], "attachment");
        }
        // Only the audit events of link/unlink travel, with metadata only.
        let text = pending.to_string();
        assert!(
            !text.contains("Ynl0ZXM") && !text.contains("dataBase64"),
            "{text}"
        );
    }
    assert!(crate::sync_class::append_only("attachment").is_none());
    assert!(!crate::oplog::SYNCED.contains(&"attachment"));
    assert_eq!(
        c.query_row(
            "SELECT count(*) FROM oplog WHERE entity = 'attachment'",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        0
    );
}
