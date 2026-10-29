//! Recovery key of the local database (SEC-03, ADR-0024). It is the 32-byte
//! `db-key` itself, so it also covers everything derived from it (the evidence
//! key of ADR-0014), written for a person to keep on paper or in a password
//! manager:
//!
//! - payload: `key (32 bytes) || check (3 bytes)`, with
//!   `check = SHA-256("pharos-recovery-v1" || key)[..3]`. The version lives in
//!   the checksum domain, so a future format never passes as this one;
//! - text: the 35 bytes (280 bits) as 56 Crockford base32 characters, in 14
//!   groups of 4 separated by `-`.
//!
//! Reading forgives what people get wrong when copying by hand: case, spaces
//! and hyphens anywhere, and `I`/`L` for `1` and `O` for `0`. A typo is caught
//! by the checksum (a 1 in 16.7 million chance of slipping through, and then
//! the key still has to decrypt the file). No error ever repeats the input.

use sha2::{Digest, Sha256};

/// Crockford base32: no `I`, `L`, `O` or `U`.
const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const DOMAIN: &[u8] = b"pharos-recovery-v1";
const KEY_LEN: usize = 32;
const CHECK_LEN: usize = 3;
const PAYLOAD_LEN: usize = KEY_LEN + CHECK_LEN;
/// 280 bits in 5-bit characters: exactly 56, no padding.
const CHARS: usize = PAYLOAD_LEN * 8 / 5;
const GROUP: usize = 4;

/// Prefix of every error for text that is not a well-formed recovery key
/// (wrong length, a character outside the alphabet, a failed checksum). The UI
/// matches it to explain a typo.
pub const INVALID_RECOVERY_KEY: &str = "recovery-key-invalid";

fn checksum(key: &[u8; KEY_LEN]) -> [u8; CHECK_LEN] {
    let digest = Sha256::new()
        .chain_update(DOMAIN)
        .chain_update(key)
        .finalize();
    let mut out = [0u8; CHECK_LEN];
    out.copy_from_slice(&digest[..CHECK_LEN]);
    out
}

/// The recovery key text for `key`: `XXXX-XXXX-…`, 14 groups of 4.
pub fn encode(key: &[u8; KEY_LEN]) -> String {
    let mut payload = [0u8; PAYLOAD_LEN];
    payload[..KEY_LEN].copy_from_slice(key);
    payload[KEY_LEN..].copy_from_slice(&checksum(key));

    let mut out = String::with_capacity(CHARS + CHARS / GROUP);
    let (mut acc, mut bits, mut written) = (0u32, 0u32, 0usize);
    for byte in payload {
        acc = (acc << 8) | u32::from(byte);
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            if written > 0 && written % GROUP == 0 {
                out.push('-');
            }
            out.push(ALPHABET[((acc >> bits) & 0x1f) as usize] as char);
            written += 1;
        }
    }
    out
}

/// The value of one typed character, `None` for a separator, `Err` for a
/// character that cannot be part of a key.
fn value(c: char) -> Result<Option<u32>, ()> {
    let c = match c.to_ascii_uppercase() {
        ' ' | '\t' | '\r' | '\n' | '-' => return Ok(None),
        'I' | 'L' => '1',
        'O' => '0',
        other => other,
    };
    ALPHABET
        .iter()
        .position(|&a| a as char == c)
        .map(|v| Some(v as u32))
        .ok_or(())
}

/// The database key in a typed recovery key, or an `INVALID_RECOVERY_KEY`
/// error. A key with a valid checksum can still be the wrong one: only
/// decrypting the file tells (`Db::recover`).
pub fn decode(input: &str) -> Result<[u8; KEY_LEN], String> {
    let mut values = Vec::with_capacity(CHARS);
    for c in input.chars() {
        match value(c) {
            Ok(Some(v)) => values.push(v),
            Ok(None) => {}
            Err(()) => {
                return Err(format!(
                    "{INVALID_RECOVERY_KEY}: a character is not part of a recovery key"
                ));
            }
        }
    }
    if values.len() != CHARS {
        return Err(format!(
            "{INVALID_RECOVERY_KEY}: a recovery key has {CHARS} characters, this one has {}",
            values.len()
        ));
    }

    let mut payload = [0u8; PAYLOAD_LEN];
    let (mut acc, mut bits, mut filled) = (0u32, 0u32, 0usize);
    for v in values {
        acc = (acc << 5) | v;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            payload[filled] = (acc >> bits) as u8;
            filled += 1;
        }
    }
    let mut key = [0u8; KEY_LEN];
    key.copy_from_slice(&payload[..KEY_LEN]);
    if payload[KEY_LEN..] != checksum(&key) {
        return Err(format!(
            "{INVALID_RECOVERY_KEY}: the recovery key does not pass its check; look for a typo"
        ));
    }
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: [u8; 32] = [
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
        0x0f, 0xf0, 0xe1, 0xd2, 0xc3, 0xb4, 0xa5, 0x96, 0x87, 0x78, 0x69, 0x5a, 0x4b, 0x3c, 0x2d,
        0x1e, 0xff,
    ];

    #[test]
    fn encodes_14_groups_of_4_and_decodes_back() {
        let text = encode(&KEY);
        let groups: Vec<&str> = text.split('-').collect();
        assert_eq!(groups.len(), 14);
        assert!(groups.iter().all(|g| g.len() == 4));
        assert!(text
            .chars()
            .all(|c| c == '-' || ALPHABET.contains(&(c as u8))));
        assert_eq!(decode(&text).unwrap(), KEY);
        for key in [[0u8; 32], [0xffu8; 32]] {
            assert_eq!(decode(&encode(&key)).unwrap(), key);
        }
    }

    #[test]
    fn forgives_case_separators_and_look_alike_letters() {
        let text = encode(&KEY);
        assert_eq!(decode(&text.to_lowercase()).unwrap(), KEY);
        assert_eq!(decode(&text.replace('-', " ")).unwrap(), KEY);
        assert_eq!(decode(&text.replace('-', "")).unwrap(), KEY);
        assert_eq!(
            decode(&format!("  {}\n", text.replace('-', " - "))).unwrap(),
            KEY
        );
        let look_alike: String = text
            .chars()
            .map(|c| match c {
                '1' => 'l',
                '0' => 'O',
                other => other,
            })
            .collect();
        assert_eq!(decode(&look_alike).unwrap(), KEY);
    }

    #[test]
    fn any_single_typo_fails_the_checksum() {
        let text = encode(&KEY).replace('-', "");
        for (i, original) in text.char_indices() {
            let typo = if original == 'Z' { 'Y' } else { 'Z' };
            let mut bad = text.clone();
            bad.replace_range(i..i + 1, &typo.to_string());
            let err = decode(&bad).expect_err("a typo must not decode");
            assert!(err.starts_with(INVALID_RECOVERY_KEY), "{err}");
        }
        // Two characters swapped.
        let mut chars: Vec<char> = text.chars().collect();
        let j = (0..chars.len() - 1)
            .find(|&j| chars[j] != chars[j + 1])
            .unwrap();
        chars.swap(j, j + 1);
        let swapped: String = chars.into_iter().collect();
        assert!(decode(&swapped).is_err());
    }

    #[test]
    fn rejects_wrong_length_and_foreign_characters() {
        let text = encode(&KEY);
        let short = &text[..text.len() - 1];
        assert!(decode(short).unwrap_err().contains("55"));
        assert!(decode(&format!("{text}0")).is_err());
        assert!(decode("").is_err());
        // `U` is not in Crockford base32, nor is punctuation.
        let with_u = format!("U{}", &text[1..]);
        assert!(decode(&with_u)
            .unwrap_err()
            .starts_with(INVALID_RECOVERY_KEY));
        assert!(decode(&text.replace('-', ".")).is_err());
    }

    #[test]
    fn errors_never_repeat_the_input() {
        let text = encode(&KEY);
        let last = if text.ends_with('Z') { 'Y' } else { 'Z' };
        let typo = format!("{}{last}", &text[..text.len() - 1]);
        for bad in [typo.as_str(), &text[..20], "ŨŨŨ"] {
            let err = decode(bad).unwrap_err();
            assert!(!err.contains(&text[..8]), "{err}");
        }
    }
}
