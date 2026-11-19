//! What the CLI prints (ADR-0054 §2): text in the user's language, or with
//! `--json` one JSON object per line with stable English keys. Errors go to
//! stderr with their code in brackets, the same in both languages. Colors only
//! on a terminal without `NO_COLOR`. A token is never printed (tokens never
//! reach this module; L2 adds a test over the whole output).

use std::io::Write;

use serde_json::Value;

use crate::exit::Failure;
use crate::i18n::{tr, Lang};

pub struct Printer<'a> {
    pub lang: Lang,
    pub json: bool,
    pub quiet: bool,
    pub color: bool,
    out: &'a mut dyn Write,
    err: &'a mut dyn Write,
}

/// A mark at the start of a line.
#[derive(Clone, Copy)]
pub enum Mark {
    Ok,
    Fail,
    Warn,
    Skip,
}

impl<'a> Printer<'a> {
    pub fn new(lang: Lang, out: &'a mut dyn Write, err: &'a mut dyn Write) -> Self {
        Printer {
            lang,
            json: false,
            quiet: false,
            color: false,
            out,
            err,
        }
    }

    pub fn t(&self, key: &str, args: &[String]) -> String {
        tr(self.lang, key, args)
    }

    fn paint(&self, code: &str, text: &str) -> String {
        if self.color {
            format!("\x1b[{code}m{text}\x1b[0m")
        } else {
            text.to_string()
        }
    }

    pub fn dim(&self, text: &str) -> String {
        self.paint("2", text)
    }

    pub fn bold(&self, text: &str) -> String {
        self.paint("1", text)
    }

    pub fn mark(&self, mark: Mark) -> String {
        match mark {
            Mark::Ok => self.paint("32", "✓"),
            Mark::Fail => self.paint("31", "✗"),
            Mark::Warn => self.paint("33", "!"),
            Mark::Skip => self.dim("·"),
        }
    }

    /// A line of normal output (not in `--json` nor `--quiet`).
    pub fn line(&mut self, text: &str) {
        if !self.json && !self.quiet {
            let _ = writeln!(self.out, "{text}");
        }
    }

    /// Always printed in text mode, even with `--quiet` (the result of a
    /// command that only prints, such as `--version`).
    pub fn always(&mut self, text: &str) {
        let _ = writeln!(self.out, "{text}");
    }

    /// One JSON object per line (only with `--json`).
    pub fn json_line(&mut self, value: &Value) {
        if self.json {
            let _ = writeln!(self.out, "{value}");
        }
    }

    /// A failure on stderr: the message, its code, and the core's detail.
    pub fn failure(&mut self, f: &Failure) {
        if self.json {
            let line = serde_json::json!({
                "error": { "code": f.code, "exit": f.exit.code(),
                           "message": tr(Lang::En, f.key, &f.args), "detail": f.detail }
            });
            let _ = writeln!(self.out, "{line}");
            return;
        }
        let text = tr(self.lang, f.key, &f.args);
        let mark = self.mark(Mark::Fail);
        let code = self.dim(&format!("[{}]", f.code));
        let _ = writeln!(self.err, "{mark} {text} {code}");
        if let Some(detail) = &f.detail {
            let detail = self.dim(detail);
            let _ = writeln!(self.err, "  {detail}");
        }
    }

    /// A warning on stderr (text mode only; JSON carries warnings in its lines).
    pub fn warn(&mut self, text: &str) {
        if !self.json {
            let mark = self.mark(Mark::Warn);
            let _ = writeln!(self.err, "{mark} {text}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::exit::Exit;

    #[test]
    fn failures_carry_their_code_in_both_languages() {
        let f = Failure::new(Exit::DbInUse, "db-in-use", "err.db-in-use").detail("core text");
        for lang in [Lang::Es, Lang::En] {
            let (mut out, mut err) = (Vec::new(), Vec::new());
            Printer::new(lang, &mut out, &mut err).failure(&f);
            let err = String::from_utf8(err).unwrap();
            assert!(err.contains("[db-in-use]"), "{err}");
            assert!(err.contains("core text"), "{err}");
            assert!(out.is_empty());
        }
        let (mut out, mut err) = (Vec::new(), Vec::new());
        let mut p = Printer::new(Lang::Es, &mut out, &mut err);
        p.json = true;
        p.failure(&f);
        let line: Value = serde_json::from_slice(&out).unwrap();
        assert_eq!(line["error"]["code"], "db-in-use");
        assert_eq!(line["error"]["exit"], 6);
        // JSON is for scripts: English, whatever the language.
        assert!(line["error"]["message"]
            .as_str()
            .unwrap()
            .starts_with("Pharos is open"));
    }

    #[test]
    fn colors_only_when_asked() {
        let (mut out, mut err) = (Vec::new(), Vec::new());
        let mut p = Printer::new(Lang::En, &mut out, &mut err);
        assert_eq!(p.mark(Mark::Ok), "✓");
        p.color = true;
        assert_eq!(p.mark(Mark::Ok), "\x1b[32m✓\x1b[0m");
    }
}
