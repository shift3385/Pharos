//! `pharos setup-path add|remove <dir>` (INT-01 L5, ADR-0054 §4): the
//! installer's hooks put `<install>\bin` on the user's PATH and take it off on
//! uninstall through this command. NSIS here works with strings of at most
//! 1024 characters, shorter than many PATHs, so editing the PATH in the
//! installer could truncate it; Rust has no such limit.
//!
//! The user PATH is `HKCU\Environment\Path`, read without expanding
//! (`%USERPROFILE%\…` entries stay as they are) and written back as
//! `REG_EXPAND_SZ`; then Windows is told the environment changed, so new
//! terminals see it. Only the one entry is added or removed: every other
//! entry is kept as it is (a trailing `;` may be dropped).

use crate::exit::{Exit, Failure};

/// Two PATH entries name the same folder: case and a trailing slash aside.
fn same(a: &str, b: &str) -> bool {
    let norm = |s: &str| s.trim().trim_end_matches(['\\', '/']).to_lowercase();
    !a.trim().is_empty() && norm(a) == norm(b)
}

/// `path` with `dir` appended, or `None` when it is already there.
pub fn with_dir(path: &str, dir: &str) -> Option<String> {
    if path.split(';').any(|entry| same(entry, dir)) {
        return None;
    }
    let base = path.trim_end_matches(';');
    Some(if base.is_empty() {
        dir.to_string()
    } else {
        format!("{base};{dir}")
    })
}

/// `path` without any entry naming `dir`, or `None` when it has none.
pub fn without_dir(path: &str, dir: &str) -> Option<String> {
    let entries: Vec<&str> = path.split(';').collect();
    if !entries.iter().any(|entry| same(entry, dir)) {
        return None;
    }
    Some(
        entries
            .into_iter()
            .filter(|entry| !same(entry, dir))
            .collect::<Vec<_>>()
            .join(";"),
    )
}

/// The registry key of the user's environment.
pub const ENVIRONMENT: &str = "Environment";

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Change {
    Add,
    Remove,
}

/// What `apply` did.
#[derive(Debug, PartialEq)]
pub enum Outcome {
    Changed,
    Unchanged,
}

/// Adds or removes `dir` in the `Path` value of `HKCU\<key>` (the real one is
/// `ENVIRONMENT`; tests use a key of their own).
#[cfg(windows)]
pub fn apply(key: &str, dir: &str, change: Change) -> Result<Outcome, String> {
    let current = reg::read(key)?.unwrap_or_default();
    let next = match change {
        Change::Add => with_dir(&current, dir),
        Change::Remove => without_dir(&current, dir),
    };
    match next {
        None => Ok(Outcome::Unchanged),
        Some(next) if next.is_empty() => {
            reg::delete(key)?;
            Ok(Outcome::Changed)
        }
        Some(next) => {
            reg::write(key, &next)?;
            Ok(Outcome::Changed)
        }
    }
}

/// Tells running programs (Explorer, so new terminals) that the environment
/// changed.
#[cfg(windows)]
pub fn broadcast() {
    reg::broadcast();
}

/// The command: `pharos setup-path add|remove <dir>`.
pub fn command(args: &[String]) -> Result<String, Failure> {
    let usage = || {
        Failure::usage("unknown-option", "err.unknown-option")
            .arg(args.join(" "))
            .arg("setup-path")
    };
    let (change, dir) = match args {
        [verb, dir] if verb == "add" => (Change::Add, dir.as_str()),
        [verb, dir] if verb == "remove" => (Change::Remove, dir.as_str()),
        _ => return Err(usage()),
    };
    if dir.trim().is_empty() || dir.contains(';') {
        return Err(usage());
    }
    #[cfg(windows)]
    {
        let outcome = apply(ENVIRONMENT, dir, change)
            .map_err(|e| Failure::new(Exit::Internal, "path", "err.internal").detail(e))?;
        if outcome == Outcome::Changed {
            broadcast();
        }
        Ok(format!("{change:?} {dir}: {outcome:?}"))
    }
    #[cfg(not(windows))]
    {
        let _ = (change, dir);
        Err(Failure::new(Exit::Usage, "not-available", "err.command-later").arg("setup-path"))
    }
}

#[cfg(windows)]
mod reg {
    use std::ptr::null_mut;

    use windows_sys::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
    use windows_sys::Win32::System::Registry::{
        RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_EXPAND_SZ,
        RRF_NOEXPAND, RRF_RT_REG_EXPAND_SZ, RRF_RT_REG_SZ,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    const VALUE: &str = "Path";

    /// The value, unexpanded; `None` when the key or the value is missing.
    pub fn read(key: &str) -> Result<Option<String>, String> {
        let (k, v) = (wide(key), wide(VALUE));
        let flags = RRF_RT_REG_SZ | RRF_RT_REG_EXPAND_SZ | RRF_NOEXPAND;
        let mut size: u32 = 0;
        // SAFETY: valid NUL-terminated names; a null buffer asks for the size.
        let rc = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                k.as_ptr(),
                v.as_ptr(),
                flags,
                null_mut(),
                null_mut(),
                &mut size,
            )
        };
        if rc == ERROR_FILE_NOT_FOUND {
            return Ok(None);
        }
        if rc != ERROR_SUCCESS {
            return Err(format!("reading HKCU\\{key}\\{VALUE}: error {rc}"));
        }
        let mut buf = vec![0u16; (size as usize).div_ceil(2) + 1];
        let mut bytes = (buf.len() * 2) as u32;
        // SAFETY: the buffer holds `bytes` bytes.
        let rc = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                k.as_ptr(),
                v.as_ptr(),
                flags,
                null_mut(),
                buf.as_mut_ptr().cast(),
                &mut bytes,
            )
        };
        if rc != ERROR_SUCCESS {
            return Err(format!("reading HKCU\\{key}\\{VALUE}: error {rc}"));
        }
        let len = buf.iter().position(|c| *c == 0).unwrap_or(buf.len());
        Ok(Some(String::from_utf16_lossy(&buf[..len])))
    }

    /// Writes the value as `REG_EXPAND_SZ`, creating the key if needed.
    pub fn write(key: &str, value: &str) -> Result<(), String> {
        let (k, v, data) = (wide(key), wide(VALUE), wide(value));
        // SAFETY: `data` is NUL-terminated and its size is given in bytes.
        let rc = unsafe {
            RegSetKeyValueW(
                HKEY_CURRENT_USER,
                k.as_ptr(),
                v.as_ptr(),
                REG_EXPAND_SZ,
                data.as_ptr().cast(),
                (data.len() * 2) as u32,
            )
        };
        if rc != ERROR_SUCCESS {
            return Err(format!("writing HKCU\\{key}\\{VALUE}: error {rc}"));
        }
        Ok(())
    }

    /// Removes the value (a PATH left with nothing in it).
    pub fn delete(key: &str) -> Result<(), String> {
        let (k, v) = (wide(key), wide(VALUE));
        // SAFETY: valid NUL-terminated names.
        let rc = unsafe { RegDeleteKeyValueW(HKEY_CURRENT_USER, k.as_ptr(), v.as_ptr()) };
        if rc != ERROR_SUCCESS && rc != ERROR_FILE_NOT_FOUND {
            return Err(format!("deleting HKCU\\{key}\\{VALUE}: error {rc}"));
        }
        Ok(())
    }

    pub fn broadcast() {
        let env = wide("Environment");
        let mut result = 0usize;
        // SAFETY: a broadcast with a NUL-terminated string, 5 s at most.
        unsafe {
            SendMessageTimeoutW(
                HWND_BROADCAST,
                WM_SETTINGCHANGE,
                0,
                env.as_ptr() as isize,
                SMTO_ABORTIFHUNG,
                5000,
                &mut result,
            );
        }
    }

    /// Removes a test key (never `Environment`).
    #[cfg(test)]
    pub fn delete_test_key(key: &str) {
        use windows_sys::Win32::System::Registry::RegDeleteTreeW;
        assert!(key.starts_with("Software\\PharosCliTest"), "{key}");
        let k = wide(key);
        // SAFETY: a NUL-terminated name under the test's own key.
        unsafe { RegDeleteTreeW(HKEY_CURRENT_USER, k.as_ptr()) };
        // The parent too, once no other test is using it (fails while it has keys).
        let parent = wide(r"Software\PharosCliTest");
        // SAFETY: a NUL-terminated name; RegDeleteKeyW refuses a key with subkeys.
        unsafe {
            windows_sys::Win32::System::Registry::RegDeleteKeyW(HKEY_CURRENT_USER, parent.as_ptr())
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_entry_is_added_once_and_the_rest_is_kept() {
        let bin = r"C:\Users\ana\AppData\Local\Pharos\bin";
        assert_eq!(with_dir("", bin).as_deref(), Some(bin));
        assert_eq!(
            with_dir(r"%USERPROFILE%\bin;C:\tools;", bin).unwrap(),
            format!(r"%USERPROFILE%\bin;C:\tools;{bin}")
        );
        // Already there, in another case or with a trailing slash.
        assert_eq!(
            with_dir(&format!(r"C:\a;{}\", bin.to_uppercase()), bin),
            None
        );
    }

    #[test]
    fn only_that_entry_is_removed() {
        let bin = r"C:\Pharos\bin";
        assert_eq!(
            without_dir(r"C:\a;c:\pharos\bin\;%USERPROFILE%\x;;C:\Pharos\bin", bin).unwrap(),
            r"C:\a;%USERPROFILE%\x;"
        );
        assert_eq!(without_dir(r"C:\a;C:\Pharos\binaries", bin), None);
        assert_eq!(without_dir(bin, bin).as_deref(), Some(""));
    }

    #[test]
    fn the_command_takes_add_or_remove_and_one_folder() {
        for bad in [
            &[][..],
            &["add".to_string()][..],
            &["move".into(), "x".into()][..],
            &["add".into(), "a;b".into()][..],
        ] {
            assert_eq!(command(bad).unwrap_err().exit, Exit::Usage, "{bad:?}");
        }
    }

    /// The registry round trip on a key of the test's own (never the real
    /// `Environment`), with a PATH far longer than NSIS's 1024 characters.
    #[cfg(windows)]
    #[test]
    fn a_long_path_survives_the_registry_round_trip() {
        let key = format!("Software\\PharosCliTest\\{}", uuid::Uuid::new_v4());
        let long: String = (0..200)
            .map(|i| format!(r"%USERPROFILE%\tools\t{i:03};"))
            .collect();
        assert!(long.len() > 3000);
        reg::write(&key, &long).unwrap();
        let bin = r"C:\Program Files\Pharos\bin";
        assert_eq!(apply(&key, bin, Change::Add).unwrap(), Outcome::Changed);
        assert_eq!(apply(&key, bin, Change::Add).unwrap(), Outcome::Unchanged);
        let read = reg::read(&key).unwrap().unwrap();
        assert!(
            read.starts_with(r"%USERPROFILE%\tools\t000;"),
            "kept unexpanded"
        );
        assert!(read.ends_with(bin));
        assert_eq!(apply(&key, bin, Change::Remove).unwrap(), Outcome::Changed);
        assert_eq!(
            reg::read(&key).unwrap().unwrap(),
            long.trim_end_matches(';')
        );
        // A PATH that only had our folder loses the value.
        reg::delete(&key).unwrap();
        apply(&key, bin, Change::Add).unwrap();
        apply(&key, bin, Change::Remove).unwrap();
        assert_eq!(reg::read(&key).unwrap(), None);
        reg::delete_test_key(&key);
    }
}
