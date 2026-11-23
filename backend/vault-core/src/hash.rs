use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// BLAKE3 hash of a file's bytes, as hex. Used to spot changes made outside the app.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ContentHash(String);

impl ContentHash {
    pub fn of(bytes: &[u8]) -> Self {
        Self(blake3::hash(bytes).to_hex().to_string())
    }

    /// A hash saved earlier with `as_str`, such as the one in the search index.
    pub fn from_stored(hex: &str) -> Self {
        Self(hex.to_string())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_bytes_give_the_same_hash() {
        assert_eq!(ContentHash::of(b"hello"), ContentHash::of(b"hello"));
        assert_ne!(ContentHash::of(b"hello"), ContentHash::of(b"hello!"));
    }
}
