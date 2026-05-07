use crate::types::TokenTotals;

#[derive(Debug, Clone, Copy)]
pub struct ModelPrice {
    /// USD per 1M tokens
    pub input: f64,
    pub output: f64,
    pub cache_write: f64,
    pub cache_read: f64,
}

/// Approximate Anthropic public list prices per 1M tokens.
/// Tài khoản subscription (Claude Pro/Max) không tính theo USD — số $ ở UI chỉ
/// có ý nghĩa tham khảo / so sánh nếu dùng pay-as-you-go API key.
pub fn price_for(model: &str) -> ModelPrice {
    let m = model.to_lowercase();
    if m.contains("opus") {
        ModelPrice {
            input: 15.0,
            output: 75.0,
            cache_write: 18.75,
            cache_read: 1.50,
        }
    } else if m.contains("haiku") {
        // Haiku 4.x is more expensive than Haiku 3.x.
        if m.contains("haiku-4") {
            ModelPrice {
                input: 1.0,
                output: 5.0,
                cache_write: 1.25,
                cache_read: 0.10,
            }
        } else {
            // Haiku 3.x and earlier
            ModelPrice {
                input: 0.80,
                output: 4.0,
                cache_write: 1.0,
                cache_read: 0.08,
            }
        }
    } else {
        // Sonnet (default)
        ModelPrice {
            input: 3.0,
            output: 15.0,
            cache_write: 3.75,
            cache_read: 0.30,
        }
    }
}

pub fn family_for(model: &str) -> &'static str {
    let m = model.to_lowercase();
    if m.contains("opus") {
        "Opus"
    } else if m.contains("haiku") {
        "Haiku"
    } else if m.contains("sonnet") {
        "Sonnet"
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
