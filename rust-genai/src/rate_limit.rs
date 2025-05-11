use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub struct RateLimiter {
    clients: Arc<Mutex<HashMap<String, Vec<Instant>>>>,
    limit: usize,
    window: u64, // seconds
}

impl RateLimiter {
    pub fn new(limit: usize, window: u64) -> Self {
        RateLimiter {
            clients: Arc::new(Mutex::new(HashMap::new())),
            limit,
            window,
        }
    }

    pub fn allow(&self, ip: &str) -> bool {
        let mut clients = self.clients.lock().unwrap();
        let now = Instant::now();
        let window = Duration::from_secs(self.window);
        let entry = clients.entry(ip.to_string()).or_insert_with(Vec::new);
        entry.retain(|&t| now.duration_since(t) < window);
        if entry.len() < self.limit {
            entry.push(now);
            true
        } else {
            false
        }
    }
}
