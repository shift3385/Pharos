//! AI online provider (Gemini) + API-key storage (spec §8, §15). The key lives
//! only in the OS keychain (Windows Credential Manager) and is read here to make
//! the HTTPS call from Rust, so it never crosses the frontend or appears in logs.
//! `ai_key_status` never returns the value. The offline provider (Ollama) is
//! handled client-side (local, no key).

use keyring::Entry;
use serde::Deserialize;
use serde_json::{json, Value};

const AI_SERVICE: &str = "pharos-ai";

fn key_account(provider: &str) -> String {
    format!("ai-key.{provider}")
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
    Entry::new(AI_SERVICE, &key_account(&provider))
        .and_then(|e| e.set_password(&key))
        .map_err(|e| e.to_string())
}

/// Whether a provider's key is configured (never returns the key itself).
#[tauri::command]
pub fn ai_key_status(provider: String) -> Result<bool, String> {
    Ok(read_key(&provider)?.is_some())
}

/// Removes a provider's stored key.
#[tauri::command]
pub fn ai_key_clear(provider: String) -> Result<(), String> {
    let entry = Entry::new(AI_SERVICE, &key_account(&provider)).map_err(|e| e.to_string())?;
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

/// Calls Google Gemini's generateContent with the stored key. Returns the reply
/// text. Errors bubble up a human-readable message (e.g. missing key, HTTP error).
#[tauri::command]
pub async fn ai_chat_online(
    model: String,
    temperature: f32,
    messages: Vec<AiMessage>,
) -> Result<String, String> {
    let key = read_key("gemini")?.ok_or_else(|| "AI key not set".to_string())?;

    let mut contents: Vec<Value> = Vec::new();
    let mut system: Option<String> = None;
    for m in &messages {
        match m.role.as_str() {
            "system" => system = Some(m.content.clone()),
            "assistant" => {
                contents.push(json!({ "role": "model", "parts": [{ "text": m.content }] }))
            }
            _ => contents.push(json!({ "role": "user", "parts": [{ "text": m.content }] })),
        }
    }

    let mut body = json!({
        "contents": contents,
        "generationConfig": { "temperature": temperature },
    });
    if let Some(s) = system {
        body["systemInstruction"] = json!({ "parts": [{ "text": s }] });
    }

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    );
    let resp = reqwest::Client::new()
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    let val: Value = resp.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let msg = val["error"]["message"]
            .as_str()
            .unwrap_or("AI request failed");
        return Err(msg.to_string());
    }

    Ok(val["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string())
}
