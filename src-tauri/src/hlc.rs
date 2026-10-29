//! Hybrid Logical Clock (SYNC-01, spec §9). Orders changes across devices whose
//! wall clocks disagree: wall-clock ms + a logical counter + the device id as the
//! final tie-break. Pure (no DB, no Tauri) so it moves as-is into `pharos-core`.
//! The TS client (`sync-offline/domain/hlc.ts`) implements the same algorithm
//! and the same text encoding, so every side compares HLCs as plain strings.

use std::cmp::Ordering;

const COUNTER_MAX: u32 = 99_999;

/// Field order matters: the derived `Ord` compares wall time, then counter,
/// then device id — the total order every device agrees on.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Hlc {
    pub wall_ms: u64,
    pub counter: u32,
    pub device_id: String,
}

impl Hlc {
    /// Fixed-width text form `<wall_ms:15>-<counter:5>-<device_id>`; byte-wise
    /// string order equals `Ord`.
    pub fn encode(&self) -> String {
        format!(
            "{:015}-{:05}-{}",
            self.wall_ms, self.counter, self.device_id
        )
    }

    pub fn parse(s: &str) -> Option<Hlc> {
        let (wall, rest) = s.split_once('-')?;
        let (counter, device) = rest.split_once('-')?;
        // Digits only: `str::parse` alone would also take a sign ("+0…").
        let digits = |t: &str, n: usize| t.len() == n && t.bytes().all(|c| c.is_ascii_digit());
        if !digits(wall, 15) || !digits(counter, 5) || device.is_empty() {
            return None;
        }
        Some(Hlc {
            wall_ms: wall.parse().ok()?,
            counter: counter.parse().ok()?,
            device_id: device.to_string(),
        })
    }
}

/// Keeps the counter inside its fixed width: on overflow the clock moves one
/// millisecond forward instead (order is preserved).
fn normalize(wall_ms: u64, counter: u32, device_id: &str) -> Hlc {
    if counter > COUNTER_MAX {
        Hlc {
            wall_ms: wall_ms + 1,
            counter: 0,
            device_id: device_id.to_string(),
        }
    } else {
        Hlc {
            wall_ms,
            counter,
            device_id: device_id.to_string(),
        }
    }
}

/// Next timestamp for a local change (send event).
pub fn tick(prev: Option<&Hlc>, now_ms: u64, device_id: &str) -> Hlc {
    let last = prev.map_or(0, |p| p.wall_ms);
    let wall = last.max(now_ms);
    let counter = match prev {
        Some(p) if wall == last => p.counter + 1,
        _ => 0,
    };
    normalize(wall, counter, device_id)
}

/// Merges a timestamp seen from another device (receive event), so the local
/// clock never issues a value at or below what it has already observed.
pub fn recv(prev: Option<&Hlc>, remote: &Hlc, now_ms: u64, device_id: &str) -> Hlc {
    let last = prev.map_or(0, |p| p.wall_ms);
    let wall = last.max(remote.wall_ms).max(now_ms);
    let counter = match prev {
        Some(p) if wall == last && wall == remote.wall_ms => p.counter.max(remote.counter) + 1,
        Some(p) if wall == last => p.counter + 1,
        _ if wall == remote.wall_ms => remote.counter + 1,
        _ => 0,
    };
    normalize(wall, counter, device_id)
}

/// Compares two encoded HLCs (the form stored in the oplog and on the server).
pub fn cmp_encoded(a: &str, b: &str) -> Ordering {
    a.as_bytes().cmp(b.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: &str = "aaaaaaaa-0000-0000-0000-000000000000";
    const B: &str = "bbbbbbbb-0000-0000-0000-000000000000";

    #[test]
    fn monotonic_when_wall_clock_goes_backwards() {
        let mut h: Option<Hlc> = None;
        let mut seen = Vec::new();
        for now in [1000, 1000, 1001, 900, 900, 1001, 2000] {
            let next = tick(h.as_ref(), now, A);
            seen.push(next.clone());
            h = Some(next);
        }
        for w in seen.windows(2) {
            assert!(w[0] < w[1]);
        }
        assert_eq!(
            seen[3],
            Hlc {
                wall_ms: 1001,
                counter: 1,
                device_id: A.into()
            }
        );
    }

    #[test]
    fn causal_order_with_skewed_clocks() {
        let from_a = tick(None, 3_600_000 + 5_000, A); // A runs 1h ahead
        let b_after_recv = recv(None, &from_a, 5_100, B);
        let b_edit = tick(Some(&b_after_recv), 5_200, B);
        assert!(from_a < b_edit);
        assert_eq!(b_edit.wall_ms, from_a.wall_ms);
    }

    #[test]
    fn deterministic_tie_break_by_device() {
        let a = tick(None, 1000, A);
        let b = tick(None, 1000, B);
        assert_eq!(a.cmp(&b), Ordering::Less);
        assert_eq!(b.cmp(&a), Ordering::Greater);
        assert_eq!(cmp_encoded(&a.encode(), &b.encode()), Ordering::Less);
    }

    #[test]
    fn recv_merges_counters() {
        let prev = Hlc {
            wall_ms: 1000,
            counter: 3,
            device_id: A.into(),
        };
        let remote = Hlc {
            wall_ms: 1000,
            counter: 7,
            device_id: B.into(),
        };
        assert_eq!(
            recv(Some(&prev), &remote, 999, A),
            Hlc {
                wall_ms: 1000,
                counter: 8,
                device_id: A.into()
            }
        );
        assert_eq!(
            recv(Some(&prev), &remote, 2000, A),
            Hlc {
                wall_ms: 2000,
                counter: 0,
                device_id: A.into()
            }
        );
    }

    #[test]
    fn encoding_is_fixed_width_and_sortable() {
        let hs = [
            Hlc {
                wall_ms: 9,
                counter: 0,
                device_id: B.into(),
            },
            Hlc {
                wall_ms: 10,
                counter: 0,
                device_id: A.into(),
            },
            Hlc {
                wall_ms: 10,
                counter: 2,
                device_id: A.into(),
            },
            Hlc {
                wall_ms: 10,
                counter: 2,
                device_id: B.into(),
            },
            Hlc {
                wall_ms: 1_730_000_000_000,
                counter: 99_999,
                device_id: A.into(),
            },
        ];
        let enc: Vec<String> = hs.iter().map(Hlc::encode).collect();
        let mut sorted = enc.clone();
        sorted.sort();
        assert_eq!(sorted, enc);
        assert_eq!(enc[0], format!("000000000000009-00000-{B}"));
        assert_eq!(Hlc::parse(&enc[4]), Some(hs[4].clone()));
        assert_eq!(Hlc::parse("garbage"), None);
        // Same encoding as the TS client (src/modules/sync-offline/domain/hlc.ts).
        assert_eq!(hs[2].encode(), format!("000000000000010-00002-{A}"));
    }

    #[test]
    fn counter_overflow_rolls_into_next_ms() {
        let prev = Hlc {
            wall_ms: 50,
            counter: 99_999,
            device_id: A.into(),
        };
        assert_eq!(
            tick(Some(&prev), 10, A),
            Hlc {
                wall_ms: 51,
                counter: 0,
                device_id: A.into()
            }
        );
    }

    /// The HLC fixture shared with the server and the client (BASE-05,
    /// ADR-0026): all three give exactly these answers.
    #[test]
    fn matches_the_shared_fixture() {
        use serde_json::Value;
        let fixture: Value = serde_json::from_str(include_str!(
            "../../src/shared/contracts/fixtures/sync/hlc.json"
        ))
        .unwrap();
        let hlc = |v: &Value| -> Option<Hlc> {
            v.as_object().map(|o| Hlc {
                wall_ms: o["wallMs"].as_u64().unwrap(),
                counter: o["counter"].as_u64().unwrap() as u32,
                device_id: o["deviceId"].as_str().unwrap().into(),
            })
        };
        for case in fixture["encode"].as_array().unwrap() {
            let h = hlc(&case["hlc"]).unwrap();
            let text = case["text"].as_str().unwrap();
            assert_eq!(h.encode(), text);
            assert_eq!(Hlc::parse(text), Some(h));
        }
        for text in fixture["invalid"].as_array().unwrap() {
            assert_eq!(Hlc::parse(text.as_str().unwrap()), None, "{text}");
        }
        let sorted: Vec<&str> = fixture["sorted"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        for pair in sorted.windows(2) {
            assert_eq!(cmp_encoded(pair[0], pair[1]), Ordering::Less);
            let (a, b) = (Hlc::parse(pair[0]).unwrap(), Hlc::parse(pair[1]).unwrap());
            assert!(a < b, "{} < {}", pair[0], pair[1]);
        }
        for case in fixture["tick"].as_array().unwrap() {
            let prev = hlc(&case["prev"]);
            let now = case["nowMs"].as_u64().unwrap();
            let device = case["deviceId"].as_str().unwrap();
            assert_eq!(
                tick(prev.as_ref(), now, device),
                hlc(&case["next"]).unwrap()
            );
        }
        for case in fixture["recv"].as_array().unwrap() {
            let prev = hlc(&case["prev"]);
            let remote = hlc(&case["remote"]).unwrap();
            let now = case["nowMs"].as_u64().unwrap();
            let device = case["deviceId"].as_str().unwrap();
            assert_eq!(
                recv(prev.as_ref(), &remote, now, device),
                hlc(&case["next"]).unwrap()
            );
        }
    }
}
