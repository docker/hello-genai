use dashmap::DashMap;
use std::time::{Duration, Instant};
use std::sync::Arc;

pub struct AppCache {
    map: DashMap<String, (String, Instant)>,
    ttl: Duration,
}

impl AppCache {
    pub fn new() -> Self {
        AppCache {
            map: DashMap::new(),
            ttl: Duration::from_secs(300), // 5 minutes
        }
    }

    pub fn get(&self, key: &str) -> Option<String> {
        if let Some((val, ts)) = self.map.get(key).map(|v| v.value().clone()) {
            if ts.elapsed() < self.ttl {
                return Some(val);
            } else {
                self.map.remove(key);
            }
        }
        None
    }

    pub fn set(&self, key: String, value: String) {
        self.map.insert(key, (value, Instant::now()));
    }
}
