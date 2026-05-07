// OpenAI public list prices for the models served via Codex CLI / Desktop.
// Subscription users (Plus / Pro / Team) don't pay per-token — these numbers
// are reference cost so the UI can show "API value vs. flat fee" the same way
// the Claude tab does for Max plans.

use crate::pricing::ModelPrice;
use crate::types::TokenTotals;

pub fn price_for(model: &str) -> ModelPrice {
    let m = model.to_lowercase();
    if m.contains("gpt-5-codex") || m.contains("codex") {
        // GPT-5-Codex variant tracks GPT-5 pricing as of writing.
        ModelPrice {
            input: 1.25,
            output: 10.0,
            cache_write: 1.25,
            cache_read: 0.125,
        }
    } else if m.contains("gpt-5") {
        ModelPrice {
            input: 1.25,
            output: 10.0,
            cache_write: 1.25,
            cache_read: 0.125,
        }
    } else if m.contains("gpt-4.1-mini") || m.contains("gpt-4o-mini") {
        ModelPrice {
            input: 0.40,
            output: 1.60,
            cache_write: 0.40,
            cache_read: 0.10,
        }
    } else if m.contains("gpt-4.1") || m.contains("gpt-4o") {
        ModelPrice {
            input: 2.00,
            output: 8.00,
            cache_write: 2.00,
            cache_read: 0.50,
        }
    } else if m.contains("o3") || m.contains("o4") {
        ModelPrice {
            input: 2.00,
            output: 8.00,
            cache_write: 2.00,
            cache_read: 0.50,
        }
    } else {
        // Default fallback — assume GPT-5 family rate.
        ModelPrice {
            input: 1.25,
            output: 10.0,
            cache_write: 1.25,
            cache_read: 0.125,
        }
    }
}

pub fn family_for(model: &str) -> &'static str {
    let m = model.to_lowercase();
    if m.contains("gpt-5-codex") || (m.contains("codex") && m.contains("gpt-5")) {
        "GPT-5-Codex"
    } else if m.contains("gpt-5.5") {
        "GPT-5.5"
    } else if m.contains("gpt-5") {
        "GPT-5"
    } else if m.contains("gpt-4.1") || m.contains("gpt-4o") {
        "GPT-4.1"
    } else {
        "Other"
    }
}

pub fn cost_usd(model: &str, tokens: &TokenTotals) -> f64 {
    let p = price_for(model);
    let per_million = 1_000_000.0;
    (tokens.input_tokens as f64) * p.input / per_million
        + (tokens.output_tokens as f64) * p.output / per_million
        + (tokens.cache_creation_tokens as f64) * p.cache_write / per_million
        + (tokens.cache_read_tokens as f64) * p.cache_read / per_million
}
