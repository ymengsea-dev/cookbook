/// What a long import or export reports its progress to, and asks whether to stop.
pub trait Job {
    fn progress(&self, done: usize, total: usize);
    fn is_cancelled(&self) -> bool;
}

/// A job nobody watches, for tests and small work.
pub struct QuietJob;

impl Job for QuietJob {
    fn progress(&self, _done: usize, _total: usize) {}

    fn is_cancelled(&self) -> bool {
        false
    }
}
