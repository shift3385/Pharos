//! AI online providers + API-key storage (spec §8, §15; backlog IA-08). Each
//! provider's key lives only in the OS keychain (Windows Credential Manager) and
//! is read here to make the HTTPS call from Rust, so it never crosses the
//! frontend, never goes in a URL and never appears in an error message.
//! `ai_key_status` never returns the value. The offline provider (Ollama) is
//! handled client-side (local, no key).
//!
//! Three wire formats cover the supported providers: Gemini `generateContent`,
//! OpenAI-style chat completions (OpenAI, OpenRouter and any compatible
//! endpoint) and the Anthropic Messages API. Building and parsing requests are
//! pure functions so they are tested without network or keychain.

use std::time::Duration;

use keyring::Entry;
use serde::Deserialize;
use serde_json::{json, Value};

const AI_SERVICE: &str = "pharos-ai";
/// Long enough for a slow model to draft a section; short enough that a hung
/// provider surfaces as an error instead of a spinner that never ends.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

const ANTHROPIC_VERSION: &str = "2026-10-21";
/// Non-streaming requests: room for long drafts while staying under timeouts.
const ANTHROPIC_MAX_TOKENS: u32 = 16000;
/// Server-side refusal fallback: a declined request is retried on another model
/// inside the same call. Only these models accept the `"default"` form.
const ANTHROPIC_FALLBACK_BETA: &str = "server-side-fallback-2026-07-01";
const ANTHROPIC_FALLBACK_MODELS: &[&str] = &[
    "claude-fable-5-1",
    "claude-opus-5-5",
    "claude-opus-5",
    "claude-sonnet-5-5",
];

/// An online provider the app can call. `Custom` is any OpenAI-compatible
/// endpoint (Groq, DeepSeek, Mistral, LM Studio, vLLM…) at a user-given URL.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Provider {
    Gemini,
    OpenAi,
    Anthropic,
    OpenRouter,
    Custom,
}

impl Provider {
    fn parse(id: &str) -> Result<Self, String> {
        match id {
            "gemini" => Ok(Self::Gemini),
            "openai" => Ok(Self::OpenAi),
            "anthropic" => Ok(Self::Anthropic),
            "openrouter" => Ok(Self::OpenRouter),
            "custom" => Ok(Self::Custom),
            other => Err(format!("Unknown AI provider: {other}")),
        }
    }

    fn id(self) -> &'static str {
        match self {
            Self::Gemini => "gemini",
            Self::OpenAi => "openai",
            Self::Anthropic => "anthropic",
            Self::OpenRouter => "openrouter",
            Self::Custom => "custom",
        }
    }

    /// A local OpenAI-compatible server (LM Studio, vLLM) may need no key.
    fn key_required(self) -> bool {
        self != Self::Custom
    }

    fn openai_style(self) -> bool {
        matches!(self, Self::OpenAi | Self::OpenRouter | Self::Custom)
    }

    fn base_url(self, custom: Option<&str>) -> Result<String, String> {
        Ok(match self {
            Self::Gemini => "https://generativelanguage.googleapis.com/v1beta".into(),
            Self::OpenAi => "https://api.openai.com/v1".into(),
            Self::Anthropic => "https://api.anthropic.com/v1".into(),
            Self::OpenRouter => "https://openrouter.ai/api/v1".into(),
            Self::Custom => validate_custom_url(custom)?,
        })
    }
}

/// The custom endpoint must be HTTPS; plain HTTP is accepted only for a server
/// on this machine, so a key is never sent unencrypted over the network.
fn validate_custom_url(raw: Option<&str>) -> Result<String, String> {
    let url = raw
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "AI base URL not set".to_string())?
        .trim_end_matches('/');
    if url.len() > "https://".len() && url.starts_with("https://") {
        return Ok(url.to_string());
    }
    if let Some(rest) = url.strip_prefix("http://") {
        let local = ["localhost", "127.0.0.1", "[::1]"].iter().any(|host| {
            rest.strip_prefix(host).is_some_and(|tail| {
                tail.is_empty() || tail.starts_with(':') || tail.starts_with('/')
            })
        });
        if local {
            return Ok(url.to_string());
        }
    }
    Err("AI base URL must use https (http is only allowed for localhost)".into())
}

/// Model ids go into the request (and, for Gemini, into the URL path), so only
/// the characters real ids use are accepted.
fn validate_model(provider: Provider, model: &str) -> Result<(), String> {
    let allowed = |c: char| c.is_ascii_alphanumeric() || "-._:@".contains(c);
    // OpenRouter and compatible servers use "vendor/model" ids; Gemini puts the
    // id in the path, so "/" is not allowed there.
    let slash_ok = provider != Provider::Gemini;
    let ok = !model.is_empty()
        && model.len() <= 200
        && model.chars().all(|c| allowed(c) || (slash_ok && c == '/'));
    if ok {
        Ok(())
    } else {
        Err("Invalid AI model name".into())
    }
}

/// Keychain account of a provider's key; scoped per instance, so an E2E run
/// never reads or overwrites the user's real keys (instance.rs).
fn key_account(provider: &str) -> String {
    crate::instance::account(&format!("ai-key.{provider}"))
}

fn read_key(provider: &str) -> Result<Option<String>, String> {
    let entry = Entry::new(AI_SERVICE, &key_account(provider)).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Stores an AI provider's API key in the OS keychain.
#[tauri::command]
pub fn ai_key_set(provider: String, key: String) -> Result<(), String> {
    let provider = Provider::parse(&provider)?;
    Entry::new(AI_SERVICE, &key_account(provider.id()))
        .and_then(|e| e.set_password(key.trim()))
        .map_err(|e| e.to_string())
}

/// Whether a provider's key is configured (never returns the key itself).
#[tauri::command]
pub fn ai_key_status(provider: String) -> Result<bool, String> {
    let provider = Provider::parse(&provider)?;
    Ok(read_key(provider.id())?.is_some())
}

/// Removes a provider's stored key.
#[tauri::command]
pub fn ai_key_clear(provider: String) -> Result<(), String> {
    let provider = Provider::parse(&provider)?;
    let entry = Entry::new(AI_SERVICE, &key_account(provider.id())).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Deserialize)]
pub struct AiMessage {
    role: String,
    content: String,
}

/// A provider HTTP call, built without touching the network.
#[derive(Debug)]
struct HttpCall {
    url: String,
    headers: Vec<(&'static str, String)>,
    /// `None` = GET, `Some` = POST with this JSON body.
    body: Option<Value>,
}

fn auth_headers(provider: Provider, key: Option<&str>) -> Vec<(&'static str, String)> {
    let mut headers = Vec::new();
    match provider {
        Provider::Gemini => {
            if let Some(k) = key {
                headers.push(("x-goog-api-key", k.to_string()));
            }
        }
        Provider::Anthropic => {
            if let Some(k) = key {
                headers.push(("x-api-key", k.to_string()));
            }
            headers.push(("anthropic-version", ANTHROPIC_VERSION.to_string()));
        }
        _ => {
            if let Some(k) = key.filter(|k| !k.is_empty()) {
                headers.push(("authorization", format!("Bearer {k}")));
            }
            if provider == Provider::OpenRouter {
                headers.push(("x-title", "Pharos".to_string()));
            }
        }
    }
    headers
}

/// Builds a chat request. `temperature: None` omits the field (the Anthropic
/// API rejects it, and some OpenAI models only accept the default).
fn chat_call(
    provider: Provider,
    base: &str,
    key: Option<&str>,
    model: &str,
    temperature: Option<f32>,
    messages: &[AiMessage],
) -> HttpCall {
    let mut headers = auth_headers(provider, key);
    let system: Vec<&str> = messages
        .iter()
        .filter(|m| m.role == "system")
        .map(|m| m.content.as_str())
        .collect();
    let turns = messages.iter().filter(|m| m.role != "system");

    match provider {
        Provider::Gemini => {
            let contents: Vec<Value> = turns
                .map(|m| {
                    let role = if m.role == "assistant" {
                        "model"
                    } else {
                        "user"
                    };
                    json!({ "role": role, "parts": [{ "text": m.content }] })
                })
                .collect();
            let mut body = json!({ "contents": contents });
            if let Some(t) = temperature {
                body["generationConfig"] = json!({ "temperature": t });
            }
            if !system.is_empty() {
                body["systemInstruction"] = json!({ "parts": [{ "text": system.join("\n\n") }] });
            }
            HttpCall {
                url: format!("{base}/models/{model}:generateContent"),
                headers,
                body: Some(body),
            }
        }
        Provider::Anthropic => {
            let msgs: Vec<Value> = turns
                .map(|m| {
                    let role = if m.role == "assistant" {
                        "assistant"
                    } else {
                        "user"
                    };
                    json!({ "role": role, "content": m.content })
                })
                .collect();
            let mut body = json!({
                "model": model,
                "max_tokens": ANTHROPIC_MAX_TOKENS,
                "messages": msgs,
            });
            if !system.is_empty() {
                body["system"] = json!(system.join("\n\n"));
            }
            if ANTHROPIC_FALLBACK_MODELS.contains(&model) {
                headers.push(("anthropic-beta", ANTHROPIC_FALLBACK_BETA.to_string()));
                body["fallbacks"] = json!("default");
            }
            HttpCall {
                url: format!("{base}/messages"),
                headers,
                body: Some(body),
            }
        }
        _ => {
            let msgs: Vec<Value> = messages
                .iter()
                .map(|m| json!({ "role": m.role, "content": m.content }))
                .collect();
            let mut body = json!({ "model": model, "messages": msgs });
            if let Some(t) = temperature {
                body["temperature"] = json!(t);
            }
            HttpCall {
                url: format!("{base}/chat/completions"),
                headers,
                body: Some(body),
            }
        }
    }
}

fn models_call(provider: Provider, base: &str, key: Option<&str>) -> HttpCall {
    let url = match provider {
        Provider::Gemini => format!("{base}/models?pageSize=1000"),
        Provider::Anthropic => format!("{base}/models?limit=1000"),
        _ => format!("{base}/models"),
    };
    HttpCall {
        url,
        headers: auth_headers(provider, key),
        body: None,
    }
}

/// The provider's own error message, or a generic one with the HTTP status.
fn error_message(val: &Value, status: u16) -> String {
    let msg = val["error"]["message"]
        .as_str()
        .or_else(|| val["error"].as_str())
        .or_else(|| val["message"].as_str());
    match msg {
        Some(m) if !m.trim().is_empty() => m.trim().to_string(),
        _ => format!("AI request failed (HTTP {status})"),
    }
}

fn parse_chat(provider: Provider, status: u16, val: &Value) -> Result<String, String> {
    if !(200..300).contains(&status) {
        return Err(error_message(val, status));
    }
    match provider {
        Provider::Gemini => {
            let parts = val["candidates"][0]["content"]["parts"].as_array();
            Ok(parts
                .map(|ps| {
                    ps.iter()
                        .filter_map(|p| p["text"].as_str())
                        .collect::<String>()
                })
                .unwrap_or_default())
        }
        Provider::Anthropic => {
            if val["stop_reason"] == "refusal" {
                return Err("The model declined this request (refusal)".into());
            }
            // Thinking and fallback blocks can precede the answer; keep text only.
            let blocks = val["content"].as_array();
            Ok(blocks
                .map(|bs| {
                    bs.iter()
                        .filter(|b| b["type"] == "text")
                        .filter_map(|b| b["text"].as_str())
                        .collect::<String>()
                })
                .unwrap_or_default())
        }
        _ => Ok(val["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string()),
    }
}

fn parse_models(provider: Provider, status: u16, val: &Value) -> Result<Vec<String>, String> {
    if !(200..300).contains(&status) {
        return Err(error_message(val, status));
    }
    let mut ids: Vec<String> = match provider {
        Provider::Gemini => val["models"]
            .as_array()
            .map(|ms| {
                ms.iter()
                    .filter(|m| {
                        m["supportedGenerationMethods"]
                            .as_array()
                            .is_some_and(|gm| gm.iter().any(|g| g == "generateContent"))
                    })
                    .filter_map(|m| m["name"].as_str())
                    .map(|n| n.trim_start_matches("models/").to_string())
                    .collect()
            })
            .unwrap_or_default(),
        _ => val["data"]
            .as_array()
            .map(|ms| {
                ms.iter()
                    .filter_map(|m| m["id"].as_str())
                    .map(String::from)
                    .collect()
            })
            .unwrap_or_default(),
    };
    ids.sort();
    ids.dedup();
    Ok(ids)
}

/// Sends a call. Transport errors drop the URL and never include headers, so
/// nothing about the key can reach the UI.
async fn send(call: &HttpCall) -> Result<(u16, Value), String> {
    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| e.without_url().to_string())?;
    let mut req = match &call.body {
        Some(body) => client.post(&call.url).json(body),
        None => client.get(&call.url),
    };
    for (name, value) in &call.headers {
        req = req.header(*name, value);
    }
    let resp = req.send().await.map_err(|e| {
        if e.is_timeout() {
            "The AI provider did not answer in time".to_string()
        } else if e.is_connect() {
            "Could not connect to the AI provider".to_string()
        } else {
            e.without_url().to_string()
        }
    })?;
    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| e.without_url().to_string())?;
    let val = serde_json::from_str(&text).unwrap_or(Value::Null);
    if val.is_null() && (200..300).contains(&status) {
        return Err(format!(
            "Unexpected response from the AI provider (HTTP {status})"
        ));
    }
    Ok((status, val))
}

fn credentials(
    provider: Provider,
    base_url: Option<&str>,
) -> Result<(String, Option<String>), String> {
    let base = provider.base_url(base_url)?;
    let key = read_key(provider.id())?;
    if provider.key_required() && key.is_none() {
        return Err("AI key not set".into());
    }
    Ok((base, key))
}

/// Calls the selected online provider with its stored key and returns the reply
/// text. Errors are human-readable (missing key, provider message, timeout).
#[tauri::command]
pub async fn ai_chat_online(
    provider: String,
    model: String,
    temperature: f32,
    messages: Vec<AiMessage>,
    base_url: Option<String>,
) -> Result<String, String> {
    let provider = Provider::parse(&provider)?;
    let model = model.trim();
    validate_model(provider, model)?;
    let (base, key) = credentials(provider, base_url.as_deref())?;
    let temp = (provider != Provider::Anthropic).then_some(temperature);

    let call = chat_call(provider, &base, key.as_deref(), model, temp, &messages);
    let (status, val) = send(&call).await?;
    // Some OpenAI-style models only accept the default temperature: retry once
    // without it instead of failing the user's request.
    if provider.openai_style()
        && status == 400
        && error_message(&val, status)
            .to_lowercase()
            .contains("temperature")
    {
        let retry = chat_call(provider, &base, key.as_deref(), model, None, &messages);
        let (status, val) = send(&retry).await?;
        return parse_chat(provider, status, &val);
    }
    parse_chat(provider, status, &val)
}

/// Lists the models the provider offers to this key, so the user picks a real
/// id instead of typing one that may have been retired.
#[tauri::command]
pub async fn ai_list_models(
    provider: String,
    base_url: Option<String>,
) -> Result<Vec<String>, String> {
    let provider = Provider::parse(&provider)?;
    let (base, key) = credentials(provider, base_url.as_deref())?;
    let (status, val) = send(&models_call(provider, &base, key.as_deref())).await?;
    parse_models(provider, status, &val)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msgs() -> Vec<AiMessage> {
        vec![
            AiMessage {
                role: "system".into(),
                content: "Be brief".into(),
            },
            AiMessage {
                role: "user".into(),
                content: "Hi".into(),
            },
            AiMessage {
                role: "assistant".into(),
                content: "Hello".into(),
            },
            AiMessage {
                role: "user".into(),
                content: "Draft".into(),
            },
        ]
    }

    fn header<'a>(call: &'a HttpCall, name: &str) -> Option<&'a str> {
        call.headers
            .iter()
            .find(|(n, _)| *n == name)
            .map(|(_, v)| v.as_str())
    }

    #[test]
    fn gemini_sends_the_key_in_a_header_never_in_the_url() {
        let base = Provider::Gemini.base_url(None).unwrap();
        let call = chat_call(
            Provider::Gemini,
            &base,
            Some("SECRET"),
            "gemini-x",
            Some(0.3),
            &msgs(),
        );
        assert!(!call.url.contains("SECRET"));
        assert!(call.url.ends_with("/models/gemini-x:generateContent"));
        assert_eq!(header(&call, "x-goog-api-key"), Some("SECRET"));
        let body = call.body.unwrap();
        assert_eq!(body["systemInstruction"]["parts"][0]["text"], "Be brief");
        assert_eq!(body["contents"].as_array().unwrap().len(), 3);
        assert_eq!(body["contents"][1]["role"], "model");
        assert_eq!(body["generationConfig"]["temperature"], json!(0.3_f32));
    }

    #[test]
    fn openai_style_uses_bearer_and_passes_messages_through() {
        let call = chat_call(
            Provider::OpenAi,
            "https://api.openai.com/v1",
            Some("k"),
            "m",
            Some(0.5),
            &msgs(),
        );
        assert_eq!(call.url, "https://api.openai.com/v1/chat/completions");
        assert_eq!(header(&call, "authorization"), Some("Bearer k"));
        let body = call.body.unwrap();
        assert_eq!(body["messages"].as_array().unwrap().len(), 4);
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["temperature"], json!(0.5_f32));

        let no_temp = chat_call(Provider::OpenAi, "b", Some("k"), "m", None, &msgs());
        assert!(no_temp.body.unwrap().get("temperature").is_none());
    }

    #[test]
    fn openrouter_identifies_the_app_and_custom_may_go_without_key() {
        let or = chat_call(
            Provider::OpenRouter,
            "b",
            Some("k"),
            "vendor/model",
            None,
            &msgs(),
        );
        assert_eq!(header(&or, "x-title"), Some("Pharos"));
        let local = chat_call(
            Provider::Custom,
            "http://localhost:1234/v1",
            None,
            "m",
            None,
            &msgs(),
        );
        assert!(header(&local, "authorization").is_none());
        assert_eq!(local.url, "http://localhost:1234/v1/chat/completions");
    }

    #[test]
    fn anthropic_uses_its_headers_top_level_system_and_no_temperature() {
        let base = Provider::Anthropic.base_url(None).unwrap();
        let call = chat_call(
            Provider::Anthropic,
            &base,
            Some("k"),
            "claude-haiku-4-5",
            None,
            &msgs(),
        );
        assert_eq!(call.url, "https://api.anthropic.com/v1/messages");
        assert_eq!(header(&call, "x-api-key"), Some("k"));
        assert_eq!(header(&call, "anthropic-version"), Some(ANTHROPIC_VERSION));
        assert!(header(&call, "anthropic-beta").is_none());
        let body = call.body.unwrap();
        assert_eq!(body["system"], "Be brief");
        assert_eq!(body["max_tokens"], ANTHROPIC_MAX_TOKENS);
        assert_eq!(body["messages"].as_array().unwrap().len(), 3);
        assert!(body.get("temperature").is_none());
        assert!(body.get("fallbacks").is_none());
    }

    #[test]
    fn anthropic_enables_refusal_fallback_only_on_models_that_accept_it() {
        let call = chat_call(
            Provider::Anthropic,
            "b",
            Some("k"),
            "claude-opus-5-5",
            None,
            &msgs(),
        );
        assert_eq!(
            header(&call, "anthropic-beta"),
            Some(ANTHROPIC_FALLBACK_BETA)
        );
        assert_eq!(call.body.unwrap()["fallbacks"], "default");
    }

    #[test]
    fn parses_text_from_each_format() {
        let gemini = json!({ "candidates": [{ "content": { "parts": [{ "text": "Ho" }, { "text": "la" }] } }] });
        assert_eq!(parse_chat(Provider::Gemini, 200, &gemini).unwrap(), "Hola");

        let openai = json!({ "choices": [{ "message": { "content": "Hola" } }] });
        assert_eq!(
            parse_chat(Provider::OpenRouter, 200, &openai).unwrap(),
            "Hola"
        );

        let claude = json!({
            "stop_reason": "end_turn",
            "content": [{ "type": "thinking", "thinking": "" }, { "type": "text", "text": "Hola" }]
        });
        assert_eq!(
            parse_chat(Provider::Anthropic, 200, &claude).unwrap(),
            "Hola"
        );
    }

    #[test]
    fn surfaces_refusals_and_provider_errors() {
        let refusal = json!({ "stop_reason": "refusal", "content": [] });
        assert!(parse_chat(Provider::Anthropic, 200, &refusal)
            .unwrap_err()
            .contains("refusal"));

        let err = json!({ "error": { "message": "Incorrect API key" } });
        assert_eq!(
            parse_chat(Provider::OpenAi, 401, &err).unwrap_err(),
            "Incorrect API key"
        );
        assert_eq!(
            parse_chat(Provider::Gemini, 500, &Value::Null).unwrap_err(),
            "AI request failed (HTTP 500)"
        );
    }

    #[test]
    fn parses_model_lists() {
        let gemini = json!({ "models": [
            { "name": "models/gemini-b", "supportedGenerationMethods": ["generateContent"] },
            { "name": "models/embed", "supportedGenerationMethods": ["embedContent"] },
            { "name": "models/gemini-a", "supportedGenerationMethods": ["generateContent"] }
        ]});
        assert_eq!(
            parse_models(Provider::Gemini, 200, &gemini).unwrap(),
            vec!["gemini-a", "gemini-b"]
        );

        let openai = json!({ "data": [{ "id": "z" }, { "id": "a" }, { "id": "a" }] });
        assert_eq!(
            parse_models(Provider::OpenAi, 200, &openai).unwrap(),
            vec!["a", "z"]
        );
        assert_eq!(
            parse_models(
                Provider::Anthropic,
                200,
                &json!({ "data": [{ "id": "claude-x" }] })
            )
            .unwrap(),
            vec!["claude-x"]
        );

        let anthropic_models = models_call(Provider::Anthropic, "b", Some("k"));
        assert_eq!(
            header(&anthropic_models, "anthropic-version"),
            Some(ANTHROPIC_VERSION)
        );
        assert!(anthropic_models.body.is_none());
    }

    #[test]
    fn custom_base_url_must_be_https_or_local() {
        assert_eq!(
            validate_custom_url(Some(" https://api.groq.com/openai/v1/ ")).unwrap(),
            "https://api.groq.com/openai/v1"
        );
        assert_eq!(
            validate_custom_url(Some("http://localhost:1234/v1")).unwrap(),
            "http://localhost:1234/v1"
        );
        assert!(validate_custom_url(Some("http://127.0.0.1")).is_ok());
        assert!(validate_custom_url(Some("http://example.com/v1")).is_err());
        assert!(validate_custom_url(Some("http://localhost.evil.com")).is_err());
        assert!(validate_custom_url(Some("ftp://x")).is_err());
        assert!(validate_custom_url(Some("https://")).is_err());
        assert!(validate_custom_url(None).is_err());
    }

    #[test]
    fn model_names_are_validated() {
        assert!(validate_model(Provider::OpenRouter, "anthropic/claude-sonnet-5-5").is_ok());
        assert!(validate_model(Provider::Custom, "llama3.2:3b").is_ok());
        assert!(validate_model(Provider::Gemini, "gemini-2.0-flash").is_ok());
        assert!(validate_model(Provider::Gemini, "a/../b").is_err());
        assert!(validate_model(Provider::OpenAi, "m?key=x").is_err());
        assert!(validate_model(Provider::OpenAi, "").is_err());
    }

    /// A one-shot-per-response HTTP server on 127.0.0.1 that records each raw
    /// request, standing in for an OpenAI-compatible provider (no real key).
    fn mock_server(
        responses: Vec<(u16, &'static str)>,
    ) -> (String, std::sync::mpsc::Receiver<String>) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!(
            "http://127.0.0.1:{}/v1",
            listener.local_addr().unwrap().port()
        );
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            for (status, body) in responses {
                let (mut stream, _) = listener.accept().unwrap();
                let mut raw = Vec::new();
                let mut buf = [0u8; 4096];
                loop {
                    let n = stream.read(&mut buf).unwrap();
                    raw.extend_from_slice(&buf[..n]);
                    let text = String::from_utf8_lossy(&raw).to_string();
                    if let Some(end) = text.find("\r\n\r\n") {
                        let len = text
                            .lines()
                            .find_map(|l| {
                                l.to_lowercase()
                                    .strip_prefix("content-length:")
                                    .map(|v| v.trim().parse::<usize>().unwrap_or(0))
                            })
                            .unwrap_or(0);
                        if raw.len() >= end + 4 + len {
                            break;
                        }
                    }
                    if n == 0 {
                        break;
                    }
                }
                tx.send(String::from_utf8_lossy(&raw).to_string()).unwrap();
                let reply = format!(
                    "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                stream.write_all(reply.as_bytes()).unwrap();
            }
        });
        (base, rx)
    }

    fn user_msg() -> Vec<AiMessage> {
        vec![AiMessage {
            role: "user".into(),
            content: "Reply OK".into(),
        }]
    }

    #[test]
    fn calls_a_compatible_endpoint_end_to_end() {
        let (base, requests) =
            mock_server(vec![(200, r#"{"choices":[{"message":{"content":"OK"}}]}"#)]);
        let reply = tauri::async_runtime::block_on(ai_chat_online(
            "custom".into(),
            "local-model".into(),
            0.4,
            user_msg(),
            Some(base),
        ))
        .unwrap();
        assert_eq!(reply, "OK");
        let req = requests.recv().unwrap();
        assert!(req.starts_with("POST /v1/chat/completions"));
        assert!(req.contains(r#""model":"local-model""#));
        assert!(req.contains(r#""temperature""#));
    }

    #[test]
    fn retries_without_temperature_when_the_model_rejects_it() {
        let (base, requests) = mock_server(vec![
            (
                400,
                r#"{"error":{"message":"Unsupported value: 'temperature' does not support 0.4"}}"#,
            ),
            (200, r#"{"choices":[{"message":{"content":"OK"}}]}"#),
        ]);
        let reply = tauri::async_runtime::block_on(ai_chat_online(
            "custom".into(),
            "m".into(),
            0.4,
            user_msg(),
            Some(base),
        ))
        .unwrap();
        assert_eq!(reply, "OK");
        assert!(requests.recv().unwrap().contains(r#""temperature""#));
        assert!(!requests.recv().unwrap().contains(r#""temperature""#));
    }

    #[test]
    fn lists_models_and_passes_provider_errors_through() {
        // Keep the receivers alive: the mock records each request before replying.
        let (base, _list_requests) =
            mock_server(vec![(200, r#"{"data":[{"id":"b"},{"id":"a"}]}"#)]);
        let models =
            tauri::async_runtime::block_on(ai_list_models("custom".into(), Some(base))).unwrap();
        assert_eq!(models, vec!["a", "b"]);

        let (base, _chat_requests) = mock_server(vec![(
            404,
            r#"{"error":{"message":"The model `nope` does not exist"}}"#,
        )]);
        let err = tauri::async_runtime::block_on(ai_chat_online(
            "custom".into(),
            "nope".into(),
            0.4,
            user_msg(),
            Some(base),
        ))
        .unwrap_err();
        assert_eq!(err, "The model `nope` does not exist");
    }

    #[test]
    fn unreachable_endpoint_gives_a_plain_error_without_the_url() {
        // Nothing listens on this port once the listener is dropped.
        let port = std::net::TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        let base = format!("http://127.0.0.1:{port}/v1");
        let err = tauri::async_runtime::block_on(ai_chat_online(
            "custom".into(),
            "m".into(),
            0.4,
            user_msg(),
            Some(base),
        ))
        .unwrap_err();
        assert!(!err.contains("127.0.0.1"), "error leaked the URL: {err}");
    }

    #[test]
    fn unknown_providers_are_rejected() {
        assert!(Provider::parse("gemini").is_ok());
        assert!(Provider::parse("evil").is_err());
        assert!(Provider::Custom.base_url(Some("https://x.dev/v1")).is_ok());
        assert!(!Provider::Custom.key_required());
        assert!(Provider::Anthropic.key_required());
    }
}
