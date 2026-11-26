//! PDF books: the files in `books/`, their details and reading progress, and the Books list.

mod files;
mod library;
mod reader;

pub use files::{BOOKS_DIR, BookFile, BookId, book_fingerprint};
pub use library::Book;
pub use reader::{BookRecord, ReadingPosition};
