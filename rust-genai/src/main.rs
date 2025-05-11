mod config;
mod cache;
mod rate_limit;
mod handlers;

use actix_web::{App, HttpServer, middleware::Logger};
use actix_cors::Cors;
use actix_files::Files;
use dotenv::dotenv;
use std::env;
use crate::config::AppConfig;
use crate::cache::AppCache;
use crate::rate_limit::RateLimiter;
use crate::handlers::*;
use std::sync::Arc;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv().ok();
    env_logger::init();
    let config = AppConfig::from_env();
    let cache = Arc::new(AppCache::new());
    let rate_limiter = Arc::new(RateLimiter::new(10, 60)); // 10 req/min per IP

    log::info!("Starting server on port {}", config.port);
    let port = config.port;

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .app_data(actix_web::web::Data::new(config.clone()))
            .app_data(actix_web::web::Data::new(cache.clone()))
            .app_data(actix_web::web::Data::new(rate_limiter.clone()))
            .wrap(Logger::default())
            .wrap(cors)
            .wrap(SecurityHeaders)
            .service(index)
            .service(chat_api)
            .service(health)
            .service(example)
            .service(api_docs)
            .service(Files::new("/static", "static"))
    })
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
