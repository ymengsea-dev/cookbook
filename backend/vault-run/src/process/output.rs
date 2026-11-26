//! Turning a program's raw output into text events for the UI, with a size limit.

use crate::process::events::{OutputStream, RunEvent};

/// Decodes UTF-8 that arrives in chunks. A character split across two chunks, common
/// with Khmer, Chinese or Japanese output, is held back until the rest of it arrives.
#[derive(Debug, Default)]
pub struct Utf8Decoder {
    pending: Vec<u8>,
}

impl Utf8Decoder {
    pub fn decode(&mut self, bytes: &[u8]) -> String {
        self.pending.extend_from_slice(bytes);
        let mut text = String::new();
        loop {
            let error = match std::str::from_utf8(&self.pending) {
                Ok(valid) => {
                    text.push_str(valid);
                    self.pending.clear();
                    return text;
                }
                Err(error) => error,
            };
            let valid_up_to = error.valid_up_to();
            text.push_str(&String::from_utf8_lossy(&self.pending[..valid_up_to]));
            match error.error_len() {
                // The tail is the start of a character: keep it for the next chunk.
                None => {
                    self.pending.drain(..valid_up_to);
                    return text;
                }
                // Bytes that are not UTF-8 at all.
                Some(bad_length) => {
                    text.push(char::REPLACEMENT_CHARACTER);
                    self.pending.drain(..valid_up_to + bad_length);
                }
            }
        }
    }

    /// Whatever is left when the stream ends. A cut-off character becomes `�`.
    pub fn finish(&mut self) -> String {
        let rest = String::from_utf8_lossy(&self.pending).into_owned();
        self.pending.clear();
        rest
    }
}

/// Collects output between sends to the UI, joining text from the same stream, and
/// stops collecting once `limit` bytes have been sent in total.
#[derive(Debug)]
pub struct OutputBuffer {
    pending: Vec<RunEvent>,
    used_bytes: usize,
    limit: usize,
    truncated: bool,
}

impl OutputBuffer {
    pub fn new(limit: usize) -> Self {
        Self {
            pending: Vec::new(),
            used_bytes: 0,
            limit,
            truncated: false,
        }
    }

    pub fn push(&mut self, stream: OutputStream, text: &str) {
        if self.truncated || text.is_empty() {
            return;
        }
        let room = self.limit - self.used_bytes;
        if text.len() <= room {
            self.append(stream, text);
            return;
        }
        let cut = floor_char_boundary(text, room);
        self.append(stream, &text[..cut]);
        self.truncated = true;
        self.pending.push(RunEvent::Truncated { bytes: self.limit });
    }

    /// Sends everything collected so far, in order.
    pub fn flush(&mut self, on_event: &mut impl FnMut(RunEvent)) {
        for event in self.pending.drain(..) {
            on_event(event);
        }
    }

    fn append(&mut self, stream: OutputStream, text: &str) {
        if text.is_empty() {
            return;
        }
        self.used_bytes += text.len();
        if let Some(RunEvent::Output {
            stream: last_stream,
            text: last_text,
        }) = self.pending.last_mut()
            && *last_stream == stream
        {
            last_text.push_str(text);
            return;
        }
        self.pending.push(RunEvent::Output {
            stream,
            text: text.to_string(),
        });
    }
}

// The largest index at or below `index` that does not split a character.
fn floor_char_boundary(text: &str, index: usize) -> usize {
    let mut cut = index.min(text.len());
    while !text.is_char_boundary(cut) {
        cut -= 1;
    }
    cut
}

#[cfg(test)]
mod tests {
    use super::*;

    fn collect(buffer: &mut OutputBuffer) -> Vec<RunEvent> {
        let mut events = Vec::new();
        buffer.flush(&mut |event| events.push(event));
        events
    }

    fn stdout(text: &str) -> RunEvent {
        RunEvent::Output {
            stream: OutputStream::Stdout,
            text: text.to_string(),
        }
    }

    #[test]
    fn a_character_split_across_chunks_is_kept_whole() {
        let bytes = "ខ្មែរ 日本".as_bytes();
        let mut decoder = Utf8Decoder::default();
        let mut text = String::new();
        for chunk in bytes.chunks(2) {
            text.push_str(&decoder.decode(chunk));
        }
        text.push_str(&decoder.finish());
        assert_eq!(text, "ខ្មែរ 日本");
    }

    #[test]
    fn bytes_that_are_not_utf8_become_replacement_characters() {
        let mut decoder = Utf8Decoder::default();
        assert_eq!(decoder.decode(b"a\xffb"), "a\u{fffd}b");
        assert_eq!(decoder.decode(b"\xe6\x97"), "");
        assert_eq!(decoder.finish(), "\u{fffd}");
    }

    #[test]
    fn text_from_the_same_stream_is_joined() {
        let mut buffer = OutputBuffer::new(100);
        buffer.push(OutputStream::Stdout, "a");
        buffer.push(OutputStream::Stdout, "b");
        buffer.push(OutputStream::Stderr, "c");

        let events = collect(&mut buffer);
        assert_eq!(events[0], stdout("ab"));
        assert_eq!(events.len(), 2);
    }

    #[test]
    fn output_stops_at_the_limit_without_splitting_a_character() {
        let mut buffer = OutputBuffer::new(4);
        buffer.push(OutputStream::Stdout, "ab");
        buffer.push(OutputStream::Stdout, "日本");
        buffer.push(OutputStream::Stdout, "more");

        let events = collect(&mut buffer);
        assert_eq!(events, [stdout("ab"), RunEvent::Truncated { bytes: 4 }]);
    }
}
