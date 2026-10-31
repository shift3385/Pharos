//! Evidence store (DAT-03, ADR-0014): attachment contents live encrypted
//! outside the database, in `<data dir>/evidence/`, one file per distinct
//! content. The database keeps who attached what (`attachments`) and the local
//! state of each content (`blobs`); saving the database never depends on the
//! size of the evidence.
//!
//! - **Names.** `evidence/<2 hex>/<hmac>.pev`, with
//!   `hmac = HMAC-SHA256(name key, sha256 of the plaintext)`. The plaintext hash
//!   is only kept inside the encrypted database, so the disk alone does not tell
//!   whether a known file is here.
//! - **Keys.** `evidence_key = HKDF-SHA256(db_key, "pharos-evidence-v1")`, and
//!   from it a name key and a file key (HKDF-Expand, "name" / "file"), so one
//!   key is never used by two primitives. Nothing new goes to the keychain and
//!   the recovery key (SEC-03) covers the evidence too.
//! - **`.pev` v1.** A 16-byte header (`"PEV1"`, format version, block size,
//!   7-byte random nonce prefix) and AES-256-GCM in STREAM mode (`StreamBE32`,
//!   64 KiB blocks, the header as associated data of every block, the last
//!   block flagged, so truncation is an error). Files are encrypted and
//!   decrypted block by block: never whole in memory. Reading recomputes the
//!   sha256 and fails on a mismatch, so a renamed or swapped file is never
//!   served as another one.
//! - **Atomic writes** (as SEC-02): `tmp/<uuid>.pev.new`, `sync_all`, `rename`.
//!   Content already stored is not written again. `tmp/` only ever holds
//!   ciphertext of unfinished writes and is emptied when the database opens.
//! - **Deleting** follows the database: a file is written before the database
//!   that references it is saved, and removed only after the database that no
//!   longer references it is saved. A content without live references becomes
//!   `local_state = 'deleting'` in the same transaction; `collect`, run after
//!   `Db::persist` (and at open), removes the file and then the row.
//!
//! Evidence never syncs yet (SYNC-04b, 0.4.0): no `attachments` row reaches the
//! oplog and the bytes never leave this folder. Logs carry counts, sizes and
//! error kinds only: never a name, a mime type or a hash.

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::stream::{DecryptorBE32, EncryptorBE32};
use aes_gcm::aead::{generic_array::GenericArray, KeyInit, OsRng, Payload};
use aes_gcm::Aes256Gcm;
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use rusqlite::{params, Connection, DatabaseName, OptionalExtension};
use serde_json::json;
use sha2::{Digest, Sha256};
use tauri::ipc::{InvokeBody, Request};
use tauri::State;

use crate::db::Db;
use crate::journal::{self, Action, Actor};

/// Largest evidence file accepted (ADR-0014, user decision 1). The Admin
/// setting that changes it arrives with step 7 of the 0.2.0 design.
pub const MAX_FILE_BYTES: u64 = 200 * 1024 * 1024;
/// Plaintext bytes per STREAM block.
const BLOCK: usize = 64 * 1024;
/// AES-GCM tag after every block.
const TAG: usize = 16;
const HEADER_LEN: usize = 16;
const MAGIC: &[u8; 4] = b"PEV1";
const FORMAT_VERSION: u8 = 1;
/// Nonce prefix of `StreamBE32` with a 96-bit nonce (4-byte counter + flag).
const NONCE_PREFIX: usize = 7;
const DIR: &str = "evidence";
const TMP: &str = "tmp";

/// Error kinds the UI translates (prefixes of the error strings).
pub const EVIDENCE_MISSING: &str = "evidence-missing";
pub const EVIDENCE_NEWER: &str = "evidence-newer-than-app";
pub const EVIDENCE_UNREADABLE: &str = "evidence-unreadable";
pub const EVIDENCE_TOO_LARGE: &str = "evidence-too-large";

/// Days a content of each `kind` is kept (ADR-0014; None = always), unless the
/// project overrides it in `evidence_retention`.
pub const DEFAULT_RETENTION: &[(&str, Option<i64>)] = &[
    ("trace", Some(30)),
    ("video", Some(30)),
    ("raw_report", Some(90)),
    ("log", Some(90)),
    ("screenshot", None),
    ("evidence", None),
];

/// The content of one stored file: its plaintext hash (hex) and size.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Stored {
    pub sha256: String,
    pub size: u64,
}

/// The evidence folder of one database and the keys derived from its key.
pub struct EvidenceStore {
    dir: PathBuf,
    name_key: [u8; 32],
    file_key: [u8; 32],
}

impl EvidenceStore {
    /// The store under `data_dir`, keyed from the database key. Creates nothing.
    pub(crate) fn new(data_dir: &Path, db_key: &[u8; 32]) -> Self {
        let mut evidence_key = [0u8; 32];
        Hkdf::<Sha256>::new(None, db_key)
            .expand(b"pharos-evidence-v1", &mut evidence_key)
            .expect("32 bytes is a valid HKDF-SHA256 length");
        let sub = Hkdf::<Sha256>::from_prk(&evidence_key).expect("32-byte PRK");
        let (mut name_key, mut file_key) = ([0u8; 32], [0u8; 32]);
        sub.expand(b"name", &mut name_key).expect("valid length");
        sub.expand(b"file", &mut file_key).expect("valid length");
        Self {
            dir: data_dir.join(DIR),
            name_key,
            file_key,
        }
    }

    fn tmp_dir(&self) -> PathBuf {
        self.dir.join(TMP)
    }

    /// `evidence/<2 hex>/<hmac>.pev` of a content hash.
    fn path_for(&self, sha256: &str) -> Result<PathBuf, String> {
        let raw = decode_hex(sha256).ok_or("not a sha256")?;
        let mut mac =
            <Hmac<Sha256> as Mac>::new_from_slice(&self.name_key).expect("any key length");
        mac.update(&raw);
        let name = hex(&mac.finalize().into_bytes());
        Ok(self.dir.join(&name[..2]).join(format!("{name}.pev")))
    }

    fn cipher(&self) -> Aes256Gcm {
        Aes256Gcm::new(GenericArray::from_slice(&self.file_key))
    }

    /// True if the file of this content is on disk.
    pub(crate) fn exists(&self, sha256: &str) -> bool {
        self.path_for(sha256).map(|p| p.is_file()).unwrap_or(false)
    }

    /// Starts writing one content, at most `limit` bytes.
    pub(crate) fn writer(&self, limit: u64) -> Result<BlobWriter, String> {
        let tmp_dir = self.tmp_dir();
        fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
        let tmp = tmp_dir.join(format!("{}.pev.new", uuid::Uuid::new_v4()));
        let mut file = BufWriter::new(File::create(&tmp).map_err(|e| e.to_string())?);
        let mut prefix = [0u8; NONCE_PREFIX];
        OsRng.fill_bytes(&mut prefix);
        let mut header = [0u8; HEADER_LEN];
        header[..4].copy_from_slice(MAGIC);
        header[4] = FORMAT_VERSION;
        header[5..9].copy_from_slice(&(BLOCK as u32).to_le_bytes());
        header[9..].copy_from_slice(&prefix);
        let written = file.write_all(&header);
        let writer = BlobWriter {
            tmp,
            file: Some(file),
            enc: Some(EncryptorBE32::from_aead(
                self.cipher(),
                GenericArray::from_slice(&prefix),
            )),
            header,
            buf: Vec::with_capacity(BLOCK),
            hasher: Sha256::new(),
            size: 0,
            limit,
            sealed: None,
        };
        written.map_err(|e| e.to_string())?;
        Ok(writer)
    }

    /// Stores everything `reader` yields (streamed) and returns its identity.
    pub(crate) fn put(&self, mut reader: impl Read, limit: u64) -> Result<Stored, String> {
        let mut writer = self.writer(limit)?;
        let mut chunk = vec![0u8; BLOCK];
        loop {
            let n = reader.read(&mut chunk).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            writer.write(&chunk[..n])?;
        }
        writer.seal()?;
        writer.commit(self)
    }

    /// A streaming reader of a content; it fails at the end if the plaintext
    /// does not hash to `sha256`.
    pub(crate) fn open(&self, sha256: &str) -> Result<BlobReader, String> {
        let path = self.path_for(sha256)?;
        let file = match File::open(&path) {
            Ok(f) => f,
            Err(e) if e.kind() == io::ErrorKind::NotFound => {
                return Err(format!(
                    "{EVIDENCE_MISSING}: the file is not on this device"
                ))
            }
            Err(e) => return Err(e.to_string()),
        };
        let len = file.metadata().map_err(|e| e.to_string())?.len();
        let mut file = BufReader::new(file);
        let mut header = [0u8; HEADER_LEN];
        if len < (HEADER_LEN + TAG) as u64 || file.read_exact(&mut header).is_err() {
            return Err(format!("{EVIDENCE_UNREADABLE}: the file is damaged"));
        }
        if &header[..4] != MAGIC {
            return Err(format!("{EVIDENCE_UNREADABLE}: not an evidence file"));
        }
        if header[4] > FORMAT_VERSION {
            return Err(format!(
                "{EVIDENCE_NEWER}: the file was written by a newer version of Pharos"
            ));
        }
        if header[4] != FORMAT_VERSION
            || u32::from_le_bytes(header[5..9].try_into().unwrap()) as usize != BLOCK
        {
            return Err(format!("{EVIDENCE_UNREADABLE}: unknown file format"));
        }
        Ok(BlobReader {
            file,
            dec: Some(DecryptorBE32::from_aead(
                self.cipher(),
                GenericArray::from_slice(&header[9..]),
            )),
            header,
            remaining: len - HEADER_LEN as u64,
            out: Vec::new(),
            pos: 0,
            hasher: Sha256::new(),
            expected: sha256.to_string(),
        })
    }

    /// Streams the plaintext of a content into `out` (verified at the end).
    /// Errors reading the content are `downloads::source_error`s.
    pub(crate) fn copy_to(&self, sha256: &str, out: &mut dyn Write) -> io::Result<u64> {
        let mut reader = self.open(sha256).map_err(crate::downloads::source_error)?;
        let mut buf = vec![0u8; BLOCK];
        let mut total = 0;
        loop {
            let n = reader
                .read(&mut buf)
                .map_err(crate::downloads::source_error)?;
            if n == 0 {
                return Ok(total);
            }
            out.write_all(&buf[..n])?;
            total += n as u64;
        }
    }

    /// Removes the file of a content (fine if it is already gone).
    pub(crate) fn remove(&self, sha256: &str) -> Result<(), String> {
        let path = self.path_for(sha256)?;
        match fs::remove_file(&path) {
            Ok(()) => {}
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
        if let Some(parent) = path.parent() {
            // Only succeeds once the folder is empty.
            let _ = fs::remove_dir(parent);
        }
        Ok(())
    }

    /// Deletes what unfinished writes left in `tmp/` (ciphertext only).
    pub(crate) fn clean_tmp(&self) {
        let Ok(entries) = fs::read_dir(self.tmp_dir()) else {
            return;
        };
        let mut removed = 0;
        for entry in entries.filter_map(Result::ok) {
            if fs::remove_file(entry.path()).is_ok() {
                removed += 1;
            }
        }
        if removed > 0 {
            tracing::info!(removed, "unfinished evidence writes removed");
        }
    }

    /// `.pev` files on disk whose content no `blobs` row knows. Counted for the
    /// diagnostic bundle only: they are never swept automatically, because they
    /// may belong to a newer database the user moved aside (ADR-0014).
    pub(crate) fn unreferenced_files(&self, conn: &Connection) -> Result<usize, String> {
        let mut known = std::collections::HashSet::new();
        let mut stmt = conn
            .prepare("SELECT sha256 FROM blobs")
            .map_err(|e| e.to_string())?;
        let shas = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        for sha in shas {
            let sha = sha.map_err(|e| e.to_string())?;
            if let Ok(path) = self.path_for(&sha) {
                known.insert(path);
            }
        }
        let Ok(folders) = fs::read_dir(&self.dir) else {
            return Ok(0);
        };
        let mut count = 0;
        for folder in folders.filter_map(Result::ok) {
            if folder.file_name() == TMP || !folder.path().is_dir() {
                continue;
            }
            for file in fs::read_dir(folder.path()).into_iter().flatten().flatten() {
                let path = file.path();
                if path.extension().is_some_and(|e| e == "pev") && !known.contains(&path) {
                    count += 1;
                }
            }
        }
        Ok(count)
    }
}

/// One content being written: encrypted and hashed block by block.
pub struct BlobWriter {
    tmp: PathBuf,
    file: Option<BufWriter<File>>,
    enc: Option<EncryptorBE32<Aes256Gcm>>,
    header: [u8; HEADER_LEN],
    buf: Vec<u8>,
    hasher: Sha256,
    size: u64,
    limit: u64,
    /// The content's identity once `seal` wrote the last block.
    sealed: Option<Stored>,
}

impl BlobWriter {
    pub(crate) fn size(&self) -> u64 {
        self.size
    }

    fn encrypt_block(&mut self, last: bool) -> Result<(), String> {
        let payload = Payload {
            msg: &self.buf,
            aad: &self.header,
        };
        let block = if last {
            let enc = self.enc.take().ok_or("evidence writer already sealed")?;
            enc.encrypt_last(payload)
        } else {
            self.enc
                .as_mut()
                .ok_or("evidence writer already sealed")?
                .encrypt_next(payload)
        }
        .map_err(|_| "failed to encrypt evidence".to_string())?;
        self.file
            .as_mut()
            .ok_or("evidence writer already sealed")?
            .write_all(&block)
            .map_err(|e| e.to_string())?;
        self.buf.clear();
        Ok(())
    }

    /// Appends plaintext. Over the limit, the write fails (and is discarded
    /// when the writer is dropped).
    pub(crate) fn write(&mut self, mut data: &[u8]) -> Result<(), String> {
        if self.size + data.len() as u64 > self.limit {
            return Err(format!(
                "{EVIDENCE_TOO_LARGE}: the file is larger than {} MB",
                self.limit / (1024 * 1024)
            ));
        }
        self.size += data.len() as u64;
        self.hasher.update(data);
        while !data.is_empty() {
            // A full block is only encrypted once more data follows, so the
            // last block (flagged as such) is never empty unless the file is.
            if self.buf.len() == BLOCK {
                self.encrypt_block(false)?;
            }
            let n = (BLOCK - self.buf.len()).min(data.len());
            self.buf.extend_from_slice(&data[..n]);
            data = &data[n..];
        }
        Ok(())
    }

    /// Writes the last block and makes the temp file durable (`sync_all`). Slow
    /// for big files, so it runs before taking the database lock.
    pub(crate) fn seal(&mut self) -> Result<(), String> {
        if self.sealed.is_some() {
            return Ok(());
        }
        self.encrypt_block(true)?;
        let file = self.file.take().ok_or("evidence writer already sealed")?;
        let file = file.into_inner().map_err(|e| e.error().to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        let sha256 = hex(&std::mem::take(&mut self.hasher).finalize());
        self.sealed = Some(Stored {
            sha256,
            size: self.size,
        });
        Ok(())
    }

    /// Moves the sealed file to its name; if that content is already stored,
    /// the copy is discarded. Call it with the database lock held, so a
    /// concurrent `collect` cannot remove the file between this and the row
    /// that references it.
    pub(crate) fn commit(mut self, store: &EvidenceStore) -> Result<Stored, String> {
        self.seal()?;
        let stored = self.sealed.clone().expect("sealed above");
        let dest = store.path_for(&stored.sha256)?;
        if dest.is_file() {
            return Ok(stored); // Drop removes the temp copy.
        }
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        match fs::rename(&self.tmp, &dest) {
            Ok(()) => Ok(stored),
            // Another writer of the same content won the race.
            Err(_) if dest.is_file() => Ok(stored),
            Err(e) => Err(format!("failed to store evidence: {e}")),
        }
    }
}

impl Drop for BlobWriter {
    fn drop(&mut self) {
        drop(self.file.take());
        let _ = fs::remove_file(&self.tmp);
    }
}

/// A streaming reader of one content.
pub struct BlobReader {
    file: BufReader<File>,
    dec: Option<DecryptorBE32<Aes256Gcm>>,
    header: [u8; HEADER_LEN],
    /// Ciphertext bytes left after the header.
    remaining: u64,
    out: Vec<u8>,
    pos: usize,
    hasher: Sha256,
    expected: String,
}

fn unreadable(what: &str) -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidData,
        format!("{EVIDENCE_UNREADABLE}: {what}"),
    )
}

impl BlobReader {
    fn next_block(&mut self) -> io::Result<()> {
        let full = (BLOCK + TAG) as u64;
        let n = self.remaining.min(full) as usize;
        let last = self.remaining <= full;
        if n < TAG {
            return Err(unreadable("the file is truncated"));
        }
        let mut block = vec![0u8; n];
        self.file.read_exact(&mut block)?;
        self.remaining -= n as u64;
        let payload = Payload {
            msg: &block,
            aad: &self.header,
        };
        let plain = if last {
            let dec = self
                .dec
                .take()
                .ok_or_else(|| unreadable("read past the end"))?;
            dec.decrypt_last(payload)
        } else {
            self.dec
                .as_mut()
                .ok_or_else(|| unreadable("read past the end"))?
                .decrypt_next(payload)
        }
        .map_err(|_| unreadable("it does not decrypt (another key, or a damaged file)"))?;
        self.hasher.update(&plain);
        if last && hex(&std::mem::take(&mut self.hasher).finalize()) != self.expected {
            return Err(unreadable("its content does not match"));
        }
        self.out = plain;
        self.pos = 0;
        Ok(())
    }
}

impl Read for BlobReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        while self.pos == self.out.len() {
            if self.dec.is_none() {
                return Ok(0);
            }
            self.next_block()?;
        }
        let n = (self.out.len() - self.pos).min(buf.len());
        buf[..n].copy_from_slice(&self.out[self.pos..self.pos + n]);
        self.pos += n;
        Ok(n)
    }
}

pub(crate) fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn decode_hex(s: &str) -> Option<[u8; 32]> {
    if s.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(s.get(2 * i..2 * i + 2)?, 16).ok()?;
    }
    Some(out)
}

// ---- database side ------------------------------------------------------

/// Records a stored content as present here (again, if it was being deleted).
pub(crate) fn record_blob(
    conn: &Connection,
    stored: &Stored,
    mime: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO blobs (sha256, size, mime, local_state, stored_at) \
         VALUES (?1, ?2, ?3, 'present', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) \
         ON CONFLICT (sha256) DO UPDATE SET local_state = 'present'",
        params![stored.sha256, stored.size as i64, mime],
    )
    .map(drop)
    .map_err(|e| e.to_string())
}

/// Attachments that still need this content: live and not expired.
fn live_refs(conn: &Connection, sha256: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT count(*) FROM attachments \
         WHERE sha256 = ?1 AND deleted_at IS NULL AND blob_purged_at IS NULL",
        params![sha256],
        |r| r.get(0),
    )
    .map_err(|e| e.to_string())
}

/// Marks a content for deletion if nothing needs it any more. The file goes
/// in `collect`, after the database that says so is saved.
pub(crate) fn release(conn: &Connection, sha256: &str) -> Result<(), String> {
    if live_refs(conn, sha256)? == 0 {
        conn.execute(
            "UPDATE blobs SET local_state = 'deleting' WHERE sha256 = ?1",
            params![sha256],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Releases every content no live attachment needs (after a purge).
pub(crate) fn release_unreferenced(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "UPDATE blobs SET local_state = 'deleting' WHERE local_state <> 'deleting' \
         AND sha256 NOT IN (SELECT sha256 FROM attachments \
                            WHERE deleted_at IS NULL AND blob_purged_at IS NULL)",
        [],
    )
    .map(drop)
    .map_err(|e| e.to_string())
}

/// Removes the files of contents marked `deleting`, then their rows. Call it
/// after `Db::persist` (and at open), with the database lock held; the rows'
/// removal is saved by the next persist (if that never happens, the next run
/// finds the rows again and the files already gone). A content referenced
/// again in the meantime goes back to `present`. Returns the files removed.
pub(crate) fn collect(conn: &Connection, store: &EvidenceStore) -> Result<usize, String> {
    let mut stmt = conn
        .prepare("SELECT sha256 FROM blobs WHERE local_state = 'deleting'")
        .map_err(|e| e.to_string())?;
    let shas = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    let mut removed = 0;
    for sha in shas {
        if live_refs(conn, &sha)? > 0 {
            conn.execute(
                "UPDATE blobs SET local_state = 'present' WHERE sha256 = ?1",
                params![sha],
            )
            .map_err(|e| e.to_string())?;
            continue;
        }
        store.remove(&sha)?;
        conn.execute("DELETE FROM blobs WHERE sha256 = ?1", params![sha])
            .map_err(|e| e.to_string())?;
        removed += 1;
    }
    if removed > 0 {
        tracing::info!(removed, "evidence files removed");
    }
    Ok(removed)
}

/// What the audit keeps of an attachment: never its bytes.
pub(crate) fn attachment_fact(
    id: &str,
    name: &str,
    mime: Option<&str>,
    size: i64,
    sha256: &str,
) -> serde_json::Value {
    json!({"id": id, "name": name, "mime": mime, "size": size, "sha256": sha256})
}

/// True if a `blobs` row knows this content.
pub(crate) fn is_known(conn: &Connection, sha256: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM blobs WHERE sha256 = ?1",
        params![sha256],
        |_| Ok(()),
    )
    .optional()
    .map(|r| r.is_some())
    .map_err(|e| e.to_string())
}

// ---- uploads from the UI --------------------------------------------------

/// Header naming the upload of an `evidence_upload_chunk` call.
const UPLOAD_HEADER: &str = "x-pharos-upload";
/// Uploads open at once; an abandoned one only costs its temp file until the
/// next start.
const MAX_OPEN_UPLOADS: usize = 8;

/// Uploads in progress: the UI sends a file in raw chunks
/// (`evidence_upload_chunk`), each encrypted and hashed as it arrives, so the
/// file is never whole in memory nor sent as base64. A finished upload is
/// handed to the command that attaches it (`planner_attachment_add`).
#[derive(Default)]
pub struct Uploads {
    open: Mutex<HashMap<String, BlobWriter>>,
}

impl Uploads {
    fn put(&self, id: String, writer: BlobWriter) -> Result<(), String> {
        let mut open = self.open.lock().map_err(|_| "uploads lock poisoned")?;
        if open.len() >= MAX_OPEN_UPLOADS && !open.contains_key(&id) {
            return Err("too many uploads in progress".into());
        }
        open.insert(id, writer);
        Ok(())
    }

    /// Takes an upload out (dropping it discards its temp file).
    pub(crate) fn take(&self, id: &str) -> Result<BlobWriter, String> {
        self.open
            .lock()
            .map_err(|_| "uploads lock poisoned")?
            .remove(id)
            .ok_or_else(|| "upload not found".to_string())
    }
}

/// Starts an upload of `size` bytes; refuses it above the per-file limit.
#[tauri::command]
pub fn evidence_upload_begin(
    db: State<Db>,
    uploads: State<Uploads>,
    size: u64,
) -> Result<String, String> {
    if size > MAX_FILE_BYTES {
        return Err(format!(
            "{EVIDENCE_TOO_LARGE}: the file is larger than {} MB",
            MAX_FILE_BYTES / (1024 * 1024)
        ));
    }
    let id = uuid::Uuid::new_v4().to_string();
    uploads.put(id.clone(), db.evidence().writer(MAX_FILE_BYTES)?)?;
    Ok(id)
}

/// Appends a raw chunk to an upload (`x-pharos-upload` names it); returns the
/// bytes received so far. A failing chunk discards the upload.
#[tauri::command(async)]
pub fn evidence_upload_chunk(
    uploads: State<'_, Uploads>,
    request: Request<'_>,
) -> Result<u64, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw bytes".into());
    };
    let id = request
        .headers()
        .get(UPLOAD_HEADER)
        .and_then(|v| v.to_str().ok())
        .ok_or("missing upload id")?
        .to_string();
    let mut writer = uploads.take(&id)?;
    writer.write(bytes)?;
    let size = writer.size();
    uploads.put(id, writer)?;
    Ok(size)
}

/// Drops an upload the user abandoned (its temp file goes with it).
#[tauri::command]
pub fn evidence_upload_cancel(uploads: State<Uploads>, upload_id: String) {
    let _ = uploads.take(&upload_id);
}

// ---- retention (ADR-0014) -------------------------------------------------

/// Days a content of `kind` is kept in `project` (None = always): the
/// project's own setting, else the default; unknown kinds are kept.
fn retention_days(conn: &Connection, project_id: &str, kind: &str) -> Result<Option<i64>, String> {
    let custom: Option<Option<i64>> = conn
        .query_row(
            "SELECT days FROM evidence_retention WHERE project_id = ?1 AND kind = ?2",
            params![project_id, kind],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(custom.unwrap_or_else(|| {
        DEFAULT_RETENTION
            .iter()
            .find(|(k, _)| *k == kind)
            .and_then(|(_, days)| *days)
    }))
}

/// Whether the attachments of an owner never expire. Only evidence of imported
/// runs can expire: a planner card's files are the user's, and results keep
/// theirs until step 7 brings the ADR's exceptions (final failed or blocked
/// result, open defect, manual execution), which need the result tables.
fn exempt(owner_entity: &str) -> bool {
    owner_entity != "run_shard"
}

/// Expires the contents whose retention passed (local task, not sync): the
/// `attachments` row stays with `blob_purged_at` and its sha256, a `redact`
/// event is written, and the content is released. Returns how many expired.
pub(crate) fn expire(conn: &Connection) -> Result<usize, String> {
    type Row = (String, String, String, String, String, String);
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.project_id, a.kind, a.owner_entity, a.sha256, a.created_at \
             FROM attachments a WHERE a.deleted_at IS NULL AND a.blob_purged_at IS NULL",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<Row> = stmt
        .query_map([], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<_>>()
        .map_err(|e| e.to_string())?;
    let mut expired = 0;
    for (id, project_id, kind, owner_entity, sha256, created_at) in rows {
        if exempt(&owner_entity) {
            continue;
        }
        let Some(days) = retention_days(conn, &project_id, &kind)? else {
            continue;
        };
        let due: bool = conn
            .query_row(
                "SELECT julianday(?1) <= julianday('now') - ?2",
                params![created_at, days],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if !due {
            continue;
        }
        conn.execute(
            "UPDATE attachments SET blob_purged_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
             WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
        let owner = crate::oplog::owner_of(conn, "project", &project_id)?;
        let mut changes = serde_json::Map::new();
        changes.insert("blob".into(), json!([sha256, null]));
        journal::record_event_in(
            conn,
            Actor::System {
                component: "evidence",
                on_behalf_of: owner,
            },
            Action::Redact,
            "attachment",
            &id,
            Some(&project_id),
            changes,
            Some(json!({"reason": "retention", "kind": kind, "days": days})),
        )?;
        release(conn, &sha256)?;
        expired += 1;
    }
    if expired > 0 {
        tracing::info!(expired, "evidence expired by retention");
    }
    Ok(expired)
}

// ---- migration of planner_attachments (0022 → 0023) -----------------------

/// Moves every `planner_attachments` BLOB into the store, before migration
/// 0023 drops that table. Each row becomes a `blobs` row and an `attachments`
/// row with the same id (`owner_entity = 'planner_card'`). Deterministic and
/// resumable: a row already moved is skipped (its file is re-stored if it is
/// missing) and content already on disk is not written again, so a run cut at
/// any point and repeated ends in the same state. Rows whose card is gone are
/// dropped (the pre-migration backup keeps them). Without a store (bare test
/// connections) there must be nothing to move.
pub(crate) fn migrate_planner_attachments(
    conn: &Connection,
    store: Option<&EvidenceStore>,
) -> Result<(), String> {
    struct Old {
        rowid: i64,
        id: String,
        card_id: String,
        name: String,
        mime: Option<String>,
        created_at: String,
        /// (workspace_id, project_id, owner_id) of the card; None if it is gone.
        card: Option<(String, String, String)>,
    }
    let rows: Vec<Old> = conn
        .prepare(
            "SELECT a.rowid, a.id, a.card_id, a.name, a.mime, a.created_at, \
                    c.workspace_id, c.project_id, c.owner_id \
             FROM planner_attachments a LEFT JOIN planner_cards c ON c.id = a.card_id \
             ORDER BY a.rowid",
        )
        .and_then(|mut stmt| {
            stmt.query_map([], |r| {
                let card = match r.get::<_, Option<String>>(6)? {
                    Some(ws) => Some((ws, r.get(7)?, r.get(8)?)),
                    None => None,
                };
                Ok(Old {
                    rowid: r.get(0)?,
                    id: r.get(1)?,
                    card_id: r.get(2)?,
                    name: r.get(3)?,
                    mime: r.get(4)?,
                    created_at: r.get(5)?,
                    card,
                })
            })?
            .collect()
        })
        .map_err(|e| e.to_string())?;
    if rows.is_empty() {
        return Ok(());
    }
    let store = store.ok_or("planner attachments need the evidence store to migrate")?;
    let (mut moved, mut orphans) = (0usize, 0usize);
    for old in rows {
        let Some((workspace_id, project_id, owner_id)) = &old.card else {
            orphans += 1;
            continue;
        };
        let done: Option<String> = conn
            .query_row(
                "SELECT sha256 FROM attachments WHERE id = ?1",
                params![old.id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if done.as_deref().is_some_and(|sha| store.exists(sha)) {
            continue;
        }
        // Incremental BLOB I/O: the bytes are read in blocks, not copied whole.
        let blob = conn
            .blob_open(
                DatabaseName::Main,
                "planner_attachments",
                "bytes",
                old.rowid,
                true,
            )
            .map_err(|e| e.to_string())?;
        let stored = store.put(blob, u64::MAX)?;
        fault_point(moved)?;
        record_blob(conn, &stored, old.mime.as_deref())?;
        if done.is_none() {
            conn.execute(
                "INSERT INTO attachments (id, workspace_id, project_id, sha256, size, mime, name, \
                 owner_entity, owner_id, kind, created_by, updated_by, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'planner_card', ?8, 'evidence', ?9, ?9, \
                         ?10, ?10)",
                params![
                    old.id,
                    workspace_id,
                    project_id,
                    stored.sha256,
                    stored.size as i64,
                    old.mime,
                    old.name,
                    old.card_id,
                    owner_id,
                    old.created_at,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        moved += 1;
    }
    // A cut between this step and the SQL of 0023 must resume as well.
    fault_point(moved)?;
    tracing::info!(
        moved,
        orphans,
        "planner attachments moved to the evidence store"
    );
    Ok(())
}

#[cfg(test)]
thread_local! {
    /// Tests: fail the migration after this many rows were stored.
    pub(crate) static FAIL_AFTER: std::cell::Cell<Option<usize>> = const { std::cell::Cell::new(None) };
}

#[cfg(test)]
fn fault_point(moved: usize) -> Result<(), String> {
    match FAIL_AFTER.with(|f| f.get()) {
        Some(n) if moved >= n => Err("injected migration failure".into()),
        _ => Ok(()),
    }
}

#[cfg(not(test))]
fn fault_point(_moved: usize) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
pub(crate) mod tests;
